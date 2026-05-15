import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { medicationOrders, stockItems } from "@/db/schema";
import { verifyBearer } from "@/lib/auth";

export const runtime = "nodejs";

const ALLOWED_STATUSES = ["pending", "confirmed", "ready", "fulfilled", "cancelled"] as const;

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Params) {
  try {
    const auth = verifyBearer(request.headers.get("authorization"));
    if (auth.role !== "pharmacist") {
      return NextResponse.json({ error: "Pharmacist access required." }, { status: 403 });
    }

    const id = Number((await ctx.params).id);
    const body = (await request.json()) as { status?: string; pharmacistNote?: string };
    const status = body.status ? String(body.status).trim() : undefined;
    const pharmacistNote =
      body.pharmacistNote !== undefined ? String(body.pharmacistNote).trim().slice(0, 2000) : undefined;

    if (status && !ALLOWED_STATUSES.includes(status as (typeof ALLOWED_STATUSES)[number])) {
      return NextResponse.json({ error: "Invalid order status." }, { status: 400 });
    }

    const db = getDb();
    const result = await db.transaction(async (tx) => {
      const rows = await tx
        .select({
          order: medicationOrders,
          stockQty: stockItems.quantityOnHand,
        })
        .from(medicationOrders)
        .innerJoin(stockItems, eq(stockItems.id, medicationOrders.stockItemId))
        .where(eq(medicationOrders.id, id))
        .limit(1);

      const row = rows[0];
      if (!row) {
        return { error: "Order not found.", status: 404 as const };
      }

      const prev = row.order;
      const nextStatus = status ?? prev.status;
      const nextNote = pharmacistNote !== undefined ? pharmacistNote : prev.pharmacistNote;
      const updatedAt = new Date().toISOString();

      if (prev.status !== "cancelled" && nextStatus === "cancelled") {
        await tx
          .update(stockItems)
          .set({
            quantityOnHand: row.stockQty + prev.quantity,
            updatedAt,
            updatedByUserId: auth.sub,
          })
          .where(eq(stockItems.id, prev.stockItemId));
      }

      const updated = await tx
        .update(medicationOrders)
        .set({ status: nextStatus, pharmacistNote: nextNote, updatedAt })
        .where(eq(medicationOrders.id, id))
        .returning();

      return { order: updated[0], status: 200 as const };
    });

    if ("error" in result && result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ order: result.order });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    const status = msg.includes("authorization") || msg.includes("jwt") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
