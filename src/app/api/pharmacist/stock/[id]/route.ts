import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { stockItems } from "@/db/schema";
import { normalizeCategory } from "@/lib/marketplace-categories";
import { normalizeImageUrl, normalizePackInputs, num } from "@/lib/stock-catalog";
import { fetchPacksByStockIds, mapStockRow, replaceStockPacks } from "@/lib/stock-db";
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
      category?: string;
      imageUrl?: string | null;
      quantityOnHand?: number;
      unit?: string;
      isAvailable?: boolean;
      priceNaira?: number;
      priceUsdc?: number;
      packs?: unknown;
      clearImage?: boolean;
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
    const category = body.category !== undefined ? normalizeCategory(body.category) : normalizeCategory(row.category);
    let imageUrl = row.imageUrl;
    if (body.clearImage) imageUrl = null;
    else if (body.imageUrl !== undefined) imageUrl = normalizeImageUrl(body.imageUrl);
    const quantityOnHand =
      body.quantityOnHand !== undefined
        ? Math.max(0, Math.floor(Number(body.quantityOnHand)))
        : row.quantityOnHand;
    const unit = body.unit !== undefined ? String(body.unit).trim().slice(0, 40) || "units" : row.unit;
    const isAvailable = body.isAvailable !== undefined ? Boolean(body.isAvailable) : row.isAvailable;
    const priceNaira =
      body.priceNaira !== undefined ? Math.max(0, Number(body.priceNaira)) : num(row.priceNaira);
    const priceUsdc =
      body.priceUsdc !== undefined ? Math.max(0, Number(body.priceUsdc)) : num(row.priceUsdc);
    const packs = body.packs !== undefined ? normalizePackInputs(body.packs) : null;

    if (!drugName) {
      return NextResponse.json({ error: "Medication name is required." }, { status: 400 });
    }

    const updatedAt = new Date().toISOString();

    const updated = await db.transaction(async (tx) => {
      const rows = await tx
        .update(stockItems)
        .set({
          drugName,
          description,
          category,
          imageUrl,
          quantityOnHand,
          unit,
          isAvailable,
          priceNaira: String(priceNaira.toFixed(2)),
          priceUsdc: String(priceUsdc.toFixed(6)),
          updatedByUserId: auth.sub,
          updatedAt,
        })
        .where(eq(stockItems.id, id))
        .returning();

      if (packs !== null) {
        await replaceStockPacks(id, packs, { priceNaira, priceUsdc, unit });
      }

      return rows[0];
    });

    const packMap = await fetchPacksByStockIds([id]);
    return NextResponse.json({ item: mapStockRow(updated, packMap.get(id) || []) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not update stock.";
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
