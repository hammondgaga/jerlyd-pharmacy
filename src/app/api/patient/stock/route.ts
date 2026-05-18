import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { stockItems } from "@/db/schema";
import { categoryCountsFromItems } from "@/lib/stock-catalog";
import { fetchPacksByStockIds, mapStockRow } from "@/lib/stock-db";
import { STOCK_CATEGORIES } from "@/lib/marketplace-categories";
import { verifyBearer } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = verifyBearer(request.headers.get("authorization"));
    if (auth.role !== "patient") {
      return NextResponse.json({ error: "Patient access required." }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const categoryFilter = searchParams.get("category");

    const db = getDb();
    const rows = await db
      .select()
      .from(stockItems)
      .where(eq(stockItems.isAvailable, true))
      .orderBy(desc(stockItems.id));

    const packMap = await fetchPacksByStockIds(rows.map((r) => r.id));
    const items = rows.map((r) => mapStockRow(r, packMap.get(r.id) || [], { patientView: true }));

    const categories = STOCK_CATEGORIES.map((c) => ({
      id: c.id,
      label: c.label,
      color: c.color,
      accent: c.accent,
      count: categoryCountsFromItems(items)[c.id] || 0,
    }));

    const filtered = categoryFilter
      ? items.filter((i) => i.category === categoryFilter && i.inStock)
      : items;

    return NextResponse.json({ categories, items: filtered });
  } catch (e) {
    console.error("[patient/stock GET]", e);
    const msg = e instanceof Error ? e.message : "Could not load stock.";
    const status = msg.includes("authorization") || msg.includes("jwt") ? 401 : 500;
    return NextResponse.json(
      {
        error:
          msg.includes("column") || msg.includes("does not exist")
            ? "Marketplace needs a database update (run scripts/neon-init-v4.sql)."
            : msg,
      },
      { status }
    );
  }
}
