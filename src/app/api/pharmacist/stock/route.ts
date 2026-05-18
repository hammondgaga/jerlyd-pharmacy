import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { getDb } from "@/db/client";
import { stockItems } from "@/db/schema";
import { normalizeCategory } from "@/lib/marketplace-categories";
import { normalizeImageUrl, normalizePackInputs } from "@/lib/stock-catalog";
import { fetchPacksByStockIds, mapStockRow, replaceStockPacks } from "@/lib/stock-db";
import { verifyBearer } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = verifyBearer(request.headers.get("authorization"));
    if (auth.role !== "pharmacist") {
      return NextResponse.json({ error: "Pharmacist access required." }, { status: 403 });
    }

    const db = getDb();
    const rows = await db.select().from(stockItems).orderBy(desc(stockItems.id));
    const packMap = await fetchPacksByStockIds(rows.map((r) => r.id));
    const items = rows.map((r) => mapStockRow(r, packMap.get(r.id) || []));

    return NextResponse.json({ items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    const status = msg.includes("authorization") || msg.includes("jwt") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const auth = verifyBearer(request.headers.get("authorization"));
    if (auth.role !== "pharmacist") {
      return NextResponse.json({ error: "Pharmacist access required." }, { status: 403 });
    }

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
    };

    const drugName = String(body.drugName || "").trim();
    const description = String(body.description || "").trim().slice(0, 2000);
    const category = normalizeCategory(body.category);
    const imageUrl = normalizeImageUrl(body.imageUrl);
    const quantityOnHand = Math.max(0, Math.floor(Number(body.quantityOnHand) || 0));
    const unit = String(body.unit || "units").trim().slice(0, 40) || "units";
    const isAvailable = body.isAvailable !== false;
    const priceNaira = Math.max(0, Number(body.priceNaira) || 0);
    const priceUsdc = Math.max(0, Number(body.priceUsdc) || 0);
    const packs = normalizePackInputs(body.packs);

    if (!drugName) {
      return NextResponse.json({ error: "Medication name is required." }, { status: 400 });
    }

    const t = new Date().toISOString();
    const db = getDb();

    const result = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(stockItems)
        .values({
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
          createdAt: t,
          updatedAt: t,
        })
        .returning();

      const item = inserted[0];
      await replaceStockPacks(item.id, packs, { priceNaira, priceUsdc, unit });
      return item;
    });

    const packMap = await fetchPacksByStockIds([result.id]);
    return NextResponse.json({ item: mapStockRow(result, packMap.get(result.id) || []) }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not add stock item.";
    const status = msg.includes("authorization") || msg.includes("jwt") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
