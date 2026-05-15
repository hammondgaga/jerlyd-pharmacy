import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { stockItems } from "@/db/schema";
import { verifyBearer } from "@/lib/auth";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Params) {
  try {
    const auth = verifyBearer(request.headers.get("authorization"));
    if (auth.role !== "pharmacist") {
      return NextResponse.json({ error: "Pharmacist access required." }, { status: 403 });
    }

    const id = Number((await ctx.params).id);
    const body = (await request.json()) as {
      drugName?: string;
      description?: string;
      quantityOnHand?: number;
      unit?: string;
      isAvailable?: boolean;
    };

    const db = getDb();
    const existing = await db.select().from(stockItems).where(eq(stockItems.id, id)).limit(1);
    if (!existing[0]) {
      return NextResponse.json({ error: "Stock item not found." }, { status: 404 });
    }

    const row = existing[0];
    const drugName = body.drugName !== undefined ? String(body.drugName).trim() : row.drugName;
    const description =
      body.description !== undefined ? String(body.description).trim().slice(0, 2000) : row.description;
    const quantityOnHand =
      body.quantityOnHand !== undefined
        ? Math.max(0, Math.floor(Number(body.quantityOnHand)))
        : row.quantityOnHand;
    const unit = body.unit !== undefined ? String(body.unit).trim().slice(0, 40) || "units" : row.unit;
    const isAvailable = body.isAvailable !== undefined ? Boolean(body.isAvailable) : row.isAvailable;

    if (!drugName) {
      return NextResponse.json({ error: "Medication name is required." }, { status: 400 });
    }

    const updatedAt = new Date().toISOString();
    const updated = await db
      .update(stockItems)
      .set({
        drugName,
        description,
        quantityOnHand,
        unit,
        isAvailable,
        updatedByUserId: auth.sub,
        updatedAt,
      })
      .where(eq(stockItems.id, id))
      .returning();

    return NextResponse.json({ item: updated[0] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    const status = msg.includes("authorization") || msg.includes("jwt") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(request: Request, ctx: Params) {
  try {
    const auth = verifyBearer(request.headers.get("authorization"));
    if (auth.role !== "pharmacist") {
      return NextResponse.json({ error: "Pharmacist access required." }, { status: 403 });
    }

    const id = Number((await ctx.params).id);
    const db = getDb();
    const del = await db.delete(stockItems).where(eq(stockItems.id, id)).returning({ id: stockItems.id });

    if (!del[0]) {
      return NextResponse.json({ error: "Stock item not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    const status = msg.includes("authorization") || msg.includes("jwt") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
