import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { stockItems } from "@/db/schema";
import { verifyBearer } from "@/lib/auth";

export const runtime = "nodejs";

function num(v: string | null): number {
  return Number(v || 0);
}

export async function GET(request: Request) {
  try {
    const auth = verifyBearer(request.headers.get("authorization"));
    if (auth.role !== "patient") {
      return NextResponse.json({ error: "Patient access required." }, { status: 403 });
    }

    const db = getDb();
    const rows = await db
      .select({
        id: stockItems.id,
        drugName: stockItems.drugName,
        description: stockItems.description,
        quantityOnHand: stockItems.quantityOnHand,
        unit: stockItems.unit,
        isAvailable: stockItems.isAvailable,
        priceNaira: stockItems.priceNaira,
        priceUsdc: stockItems.priceUsdc,
      })
      .from(stockItems)
      .where(eq(stockItems.isAvailable, true))
      .orderBy(desc(stockItems.id));

    const items = rows.map((r) => ({
      id: r.id,
      drugName: r.drugName,
      description: r.description,
      quantityOnHand: r.quantityOnHand,
      unit: r.unit,
      isAvailable: r.isAvailable,
      priceNaira: num(r.priceNaira),
      priceUsdc: num(r.priceUsdc),
      inStock: r.quantityOnHand > 0,
    }));

    return NextResponse.json({ items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    const status = msg.includes("authorization") || msg.includes("jwt") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
