import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { prescriptions, users } from "@/db/schema";
import { verifyBearer } from "@/lib/auth";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Params) {
  try {
    const auth = verifyBearer(request.headers.get("authorization"));
    if (auth.role !== "patient") {
      return NextResponse.json({ error: "Patient access required." }, { status: 403 });
    }

    const id = Number((await ctx.params).id);
    const body = (await request.json()) as {
      patientFeedback?: string;
      sideEffectsObserved?: string;
    };
    const patientFeedback = String(body.patientFeedback ?? "").trim().slice(0, 8000);
    const sideEffectsObserved = String(body.sideEffectsObserved ?? "").trim().slice(0, 8000);

    const db = getDb();
    const existing = await db
      .select({ id: prescriptions.id })
      .from(prescriptions)
      .where(and(eq(prescriptions.id, id), eq(prescriptions.patientUserId, auth.sub)))
      .limit(1);

    if (!existing[0]) {
      return NextResponse.json({ error: "Prescription not found." }, { status: 404 });
    }

    const updatedAt = new Date().toISOString();
    await db
      .update(prescriptions)
      .set({ patientFeedback, sideEffectsObserved, updatedAt })
      .where(eq(prescriptions.id, id));

    const updatedRows = await db
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
      .where(eq(prescriptions.id, id))
      .limit(1);

    const updated = updatedRows[0];
    if (!updated) {
      return NextResponse.json({ error: "Prescription not found." }, { status: 404 });
    }

    return NextResponse.json({ prescription: updated });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    const status = msg.includes("authorization") || msg.includes("jwt") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
