import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { prescriptions, users } from "@/db/schema";
import { verifyBearer } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const auth = verifyBearer(request.headers.get("authorization"));
    if (auth.role !== "pharmacist") {
      return NextResponse.json({ error: "Pharmacist access required." }, { status: 403 });
    }

    const body = (await request.json()) as {
      patientUserId?: number;
      drugName?: string;
      indication?: string;
      dosage?: string;
      duration?: string;
      dispensedOn?: string;
      pharmacistNote?: string;
    };

    const patientUserId = Number(body.patientUserId);
    const drugName = String(body.drugName || "").trim();
    const indication = String(body.indication || "").trim();
    const dosage = String(body.dosage || "").trim();
    const duration = String(body.duration || "").trim();
    const dispensedOn = String(body.dispensedOn || "").trim();
    const pharmacistNote = String(body.pharmacistNote || "").trim();

    if (!patientUserId || !drugName || !indication || !dosage || !duration) {
      return NextResponse.json(
        { error: "Patient, medication name, indication, dosage, and duration are required." },
        { status: 400 }
      );
    }

    const db = getDb();
    const patient = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, patientUserId), eq(users.role, "patient")))
      .limit(1);

    if (!patient[0]) {
      return NextResponse.json({ error: "Patient not found." }, { status: 404 });
    }

    const t = new Date().toISOString();
    const inserted = await db
      .insert(prescriptions)
      .values({
        patientUserId,
        pharmacistUserId: auth.sub,
        drugName,
        indication,
        dosage,
        duration,
        dispensedOn: dispensedOn || null,
        pharmacistNote,
        patientFeedback: "",
        sideEffectsObserved: "",
        createdAt: t,
        updatedAt: t,
      })
      .returning();

    const created = inserted[0];
    if (!created) {
      return NextResponse.json({ error: "Could not save medication." }, { status: 500 });
    }

    return NextResponse.json(
      {
        prescription: {
          id: created.id,
          patientUserId: created.patientUserId,
          drugName: created.drugName,
          indication: created.indication,
          dosage: created.dosage,
          duration: created.duration,
          dispensedOn: created.dispensedOn,
          pharmacistNote: created.pharmacistNote,
          patientFeedback: created.patientFeedback,
          sideEffectsObserved: created.sideEffectsObserved,
          createdAt: created.createdAt,
          updatedAt: created.updatedAt,
        },
      },
      { status: 201 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    const status = msg.includes("authorization") || msg.includes("jwt") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
