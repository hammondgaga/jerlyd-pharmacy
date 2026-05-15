import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { prescriptions, users } from "@/db/schema";
import { verifyBearer } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = verifyBearer(request.headers.get("authorization"));
    if (auth.role !== "patient") {
      return NextResponse.json({ error: "Patient access required." }, { status: 403 });
    }

    const db = getDb();
    const rows = await db
      .select({
        id: prescriptions.id,
        drugName: prescriptions.drugName,
        indication: prescriptions.indication,
        dosage: prescriptions.dosage,
        duration: prescriptions.duration,
        dispensedOn: prescriptions.dispensedOn,
        pharmacistNote: prescriptions.pharmacistNote,
        patientFeedback: prescriptions.patientFeedback,
        sideEffectsObserved: prescriptions.sideEffectsObserved,
        pharmacistReply: prescriptions.pharmacistReply,
        createdAt: prescriptions.createdAt,
        updatedAt: prescriptions.updatedAt,
        pharmacistDisplayName: users.displayName,
      })
      .from(prescriptions)
      .innerJoin(users, eq(users.id, prescriptions.pharmacistUserId))
      .where(eq(prescriptions.patientUserId, auth.sub))
      .orderBy(desc(prescriptions.id));

    return NextResponse.json({ prescriptions: rows });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    const status = msg.includes("authorization") || msg.includes("jwt") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
