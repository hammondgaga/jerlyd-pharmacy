import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { prescriptions, users } from "@/db/schema";
import { verifyBearer } from "@/lib/auth";

export const runtime = "nodejs";

type Params = { params: Promise<{ patientId: string }> };

export async function GET(request: Request, ctx: Params) {
  try {
    const auth = verifyBearer(request.headers.get("authorization"));
    if (auth.role !== "pharmacist") {
      return NextResponse.json({ error: "Pharmacist access required." }, { status: 403 });
    }

    const patientId = Number((await ctx.params).patientId);
    const db = getDb();

    const patientRows = await db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
      })
      .from(users)
      .where(and(eq(users.id, patientId), eq(users.role, "patient")))
      .limit(1);

    const patient = patientRows[0];
    if (!patient) {
      return NextResponse.json({ error: "Patient not found." }, { status: 404 });
    }

    const rx = await db
      .select({
        id: prescriptions.id,
        patientUserId: prescriptions.patientUserId,
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
      })
      .from(prescriptions)
      .where(eq(prescriptions.patientUserId, patientId))
      .orderBy(desc(prescriptions.id));

    return NextResponse.json({ patient, prescriptions: rx });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    const status = msg.includes("authorization") || msg.includes("jwt") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
