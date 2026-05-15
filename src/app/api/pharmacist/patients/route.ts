import { NextResponse } from "next/server";
import { count, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { prescriptions, users } from "@/db/schema";
import { verifyBearer } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = verifyBearer(request.headers.get("authorization"));
    if (auth.role !== "pharmacist") {
      return NextResponse.json({ error: "Pharmacist access required." }, { status: 403 });
    }

    const db = getDb();
    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        createdAt: users.createdAt,
        prescriptionCount: count(prescriptions.id),
      })
      .from(users)
      .leftJoin(prescriptions, eq(prescriptions.patientUserId, users.id))
      .where(eq(users.role, "patient"))
      .groupBy(users.id, users.email, users.displayName, users.createdAt)
      .orderBy(desc(users.id));

    return NextResponse.json({
      patients: rows.map((r) => ({
        ...r,
        prescriptionCount: Number(r.prescriptionCount),
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    const status = msg.includes("authorization") || msg.includes("jwt") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
