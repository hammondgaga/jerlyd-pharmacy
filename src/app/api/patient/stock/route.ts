import { NextResponse } from "next/server";
import { and, desc, eq, gt } from "drizzle-orm";
import { getDb } from "@/db/client";
import { stockItems } from "@/db/schema";
import { verifyBearer } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = verifyBearer(request.headers.get("authorization"));
    if (auth.role !== "patient") {
      return NextResponse.json({ error: "Patient access required." }, { status: 403 });
    }

    const db = getDb();
    const items = await db
      .select({
        id: stockItems.id,
        drugName: stockItems.drugName,
        description: stockItems.description,
        quantityOnHand: stockItems.quantityOnHand,
        unit: stockItems.unit,
      })
      .from(stockItems)
      .where(and(eq(stockItems.isAvailable, true), gt(stockItems.quantityOnHand, 0)))
      .orderBy(desc(stockItems.id));

    return NextResponse.json({ items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    const status = msg.includes("authorization") || msg.includes("jwt") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
