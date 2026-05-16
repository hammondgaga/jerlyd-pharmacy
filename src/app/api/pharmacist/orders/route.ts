import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { medicationOrders, stockItems, users } from "@/db/schema";
import { verifyBearer } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = verifyBearer(request.headers.get("authorization"));
    if (auth.role !== "pharmacist") {
      return NextResponse.json({ error: "Pharmacist access required." }, { status: 403 });
    }

    const db = getDb();
    const orders = await db
      .select({
        id: medicationOrders.id,
        patientUserId: medicationOrders.patientUserId,
        stockItemId: medicationOrders.stockItemId,
        quantity: medicationOrders.quantity,
        status: medicationOrders.status,
        patientNote: medicationOrders.patientNote,
        pharmacistNote: medicationOrders.pharmacistNote,
        paymentMethod: medicationOrders.paymentMethod,
        txHash: medicationOrders.txHash,
        totalNaira: medicationOrders.totalNaira,
        totalUsdc: medicationOrders.totalUsdc,
        createdAt: medicationOrders.createdAt,
        updatedAt: medicationOrders.updatedAt,
        drugName: stockItems.drugName,
        unit: stockItems.unit,
        patientDisplayName: users.displayName,
        patientEmail: users.email,
      })
      .from(medicationOrders)
      .innerJoin(stockItems, eq(stockItems.id, medicationOrders.stockItemId))
      .innerJoin(users, eq(users.id, medicationOrders.patientUserId))
      .orderBy(desc(medicationOrders.id));

    return NextResponse.json({ orders });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    const status = msg.includes("authorization") || msg.includes("jwt") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
