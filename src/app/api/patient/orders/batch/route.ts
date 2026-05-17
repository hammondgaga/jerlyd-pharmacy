import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { medicationOrders, stockItems } from "@/db/schema";
import { verifyBearer } from "@/lib/auth";

export const runtime = "nodejs";

const PAYMENT_METHODS = ["pending", "card_naira", "usdc"] as const;

function num(v: string | null): number {
  return Number(v || 0);
}

type CartLineInput = { stockItemId?: number; quantity?: number };

export async function POST(request: Request) {
  try {
    const auth = verifyBearer(request.headers.get("authorization"));
    if (auth.role !== "patient") {
      return NextResponse.json({ error: "Patient access required." }, { status: 403 });
    }

    const body = (await request.json()) as {
      items?: CartLineInput[];
      patientNote?: string;
      paymentMethod?: string;
      txHash?: string;
    };

    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (rawItems.length === 0) {
      return NextResponse.json({ error: "Your cart is empty." }, { status: 400 });
    }
    if (rawItems.length > 50) {
      return NextResponse.json({ error: "Too many items in one order (max 50)." }, { status: 400 });
    }

    const merged = new Map<number, number>();
    for (const line of rawItems) {
      const stockItemId = Number(line.stockItemId);
      const quantity = Math.floor(Number(line.quantity));
      if (!stockItemId || quantity < 1 || quantity > 999) {
        return NextResponse.json({ error: "Each cart item needs a valid quantity (1–999)." }, { status: 400 });
      }
      merged.set(stockItemId, (merged.get(stockItemId) || 0) + quantity);
    }

    const patientNote = String(body.patientNote || "").trim().slice(0, 2000);
    const paymentMethod = String(body.paymentMethod || "card_naira").trim();
    const txHash = String(body.txHash || "").trim();

    if (!PAYMENT_METHODS.includes(paymentMethod as (typeof PAYMENT_METHODS)[number])) {
      return NextResponse.json({ error: "Invalid payment method." }, { status: 400 });
    }
    if (paymentMethod === "usdc" && (!txHash.startsWith("0x") || txHash.length < 10)) {
      return NextResponse.json({ error: "USDC payment requires a valid transaction hash." }, { status: 400 });
    }

    const db = getDb();
    const cartLines = [...merged.entries()].map(([stockItemId, quantity]) => ({ stockItemId, quantity }));

    const result = await db.transaction(async (tx) => {
      const prepared: {
        stockItemId: number;
        quantity: number;
        item: (typeof stockItems.$inferSelect);
        totalNaira: number;
        totalUsdc: number;
      }[] = [];

      for (const { stockItemId, quantity } of cartLines) {
        const rows = await tx
          .select()
          .from(stockItems)
          .where(and(eq(stockItems.id, stockItemId), eq(stockItems.isAvailable, true)))
          .limit(1);

        const item = rows[0];
        if (!item) {
          return { error: `Medication #${stockItemId} is not available.`, status: 404 as const };
        }
        if (item.quantityOnHand < quantity) {
          return {
            error: `Only ${item.quantityOnHand} ${item.unit} of ${item.drugName} in stock.`,
            status: 400 as const,
          };
        }

        const unitNaira = num(item.priceNaira);
        const unitUsdc = num(item.priceUsdc);
        prepared.push({
          stockItemId,
          quantity,
          item,
          totalNaira: Math.round(unitNaira * quantity * 100) / 100,
          totalUsdc: Math.round(unitUsdc * quantity * 1_000_000) / 1_000_000,
        });
      }

      const t = new Date().toISOString();
      const status = paymentMethod === "usdc" ? "confirmed" : "pending";
      const orders = [];

      for (const line of prepared) {
        const inserted = await tx
          .insert(medicationOrders)
          .values({
            patientUserId: auth.sub,
            stockItemId: line.stockItemId,
            quantity: line.quantity,
            status,
            patientNote,
            pharmacistNote: "",
            paymentMethod,
            txHash: txHash || null,
            totalNaira: String(line.totalNaira),
            totalUsdc: String(line.totalUsdc),
            createdAt: t,
            updatedAt: t,
          })
          .returning();

        await tx
          .update(stockItems)
          .set({
            quantityOnHand: line.item.quantityOnHand - line.quantity,
            updatedAt: t,
            updatedByUserId: null,
          })
          .where(eq(stockItems.id, line.stockItemId));

        line.item.quantityOnHand -= line.quantity;
        orders.push(inserted[0]);
      }

      return { orders, status: 201 as const };
    });

    if ("error" in result && result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ orders: result.orders }, { status: 201 });
  } catch (e) {
    console.error("[patient/orders/batch POST]", e);
    const msg = e instanceof Error ? e.message : "Could not place order.";
    const status = msg.includes("authorization") || msg.includes("jwt") ? 401 : 500;
    return NextResponse.json(
      {
        error:
          msg.includes("column") || msg.includes("does not exist")
            ? "Order could not be saved. Database may need migration (run neon-init-v3.sql)."
            : msg,
      },
      { status }
    );
  }
}
