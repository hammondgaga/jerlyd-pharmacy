import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { medicationOrders, stockItems } from "@/db/schema";
import { verifyBearer } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = verifyBearer(request.headers.get("authorization"));
    if (auth.role !== "patient") {
      return NextResponse.json({ error: "Patient access required." }, { status: 403 });
    }

    const db = getDb();
    const orders = await db
      .select({
        id: medicationOrders.id,
        stockItemId: medicationOrders.stockItemId,
        quantity: medicationOrders.quantity,
        status: medicationOrders.status,
        patientNote: medicationOrders.patientNote,
        pharmacistNote: medicationOrders.pharmacistNote,
        createdAt: medicationOrders.createdAt,
        updatedAt: medicationOrders.updatedAt,
        drugName: stockItems.drugName,
        unit: stockItems.unit,
      })
      .from(medicationOrders)
      .innerJoin(stockItems, eq(stockItems.id, medicationOrders.stockItemId))
      .where(eq(medicationOrders.patientUserId, auth.sub))
      .orderBy(desc(medicationOrders.id));

    return NextResponse.json({ orders });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    const status = msg.includes("authorization") || msg.includes("jwt") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const auth = verifyBearer(request.headers.get("authorization"));
    if (auth.role !== "patient") {
      return NextResponse.json({ error: "Patient access required." }, { status: 403 });
    }

    const body = (await request.json()) as {
      stockItemId?: number;
      quantity?: number;
      patientNote?: string;
    };
    const stockItemId = Number(body.stockItemId);
    const quantity = Math.floor(Number(body.quantity));
    const patientNote = String(body.patientNote || "").trim().slice(0, 2000);

    if (!stockItemId || quantity < 1 || quantity > 999) {
      return NextResponse.json({ error: "Choose a medication and a valid quantity (1–999)." }, { status: 400 });
    }

    const db = getDb();
    const result = await db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(stockItems)
        .where(and(eq(stockItems.id, stockItemId), eq(stockItems.isAvailable, true)))
        .limit(1);

      const item = rows[0];
      if (!item) {
        return { error: "This medication is not available.", status: 404 as const };
      }
      if (item.quantityOnHand < quantity) {
        return {
          error: `Only ${item.quantityOnHand} ${item.unit} in stock.`,
          status: 400 as const,
        };
      }

      const t = new Date().toISOString();
      const inserted = await tx
        .insert(medicationOrders)
        .values({
          patientUserId: auth.sub,
          stockItemId,
          quantity,
          status: "pending",
          patientNote,
          pharmacistNote: "",
          createdAt: t,
          updatedAt: t,
        })
        .returning();

      await tx
        .update(stockItems)
        .set({
          quantityOnHand: item.quantityOnHand - quantity,
          updatedAt: t,
          updatedByUserId: null,
        })
        .where(eq(stockItems.id, stockItemId));

      return { order: inserted[0], status: 201 as const };
    });

    if ("error" in result && result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ order: result.order }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not place order.";
    const status = msg.includes("authorization") || msg.includes("jwt") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
