import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { prescriptions } from "@/db/schema";
import { verifyBearer } from "@/lib/auth";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Params) {
  try {
    const auth = verifyBearer(request.headers.get("authorization"));
    if (auth.role !== "pharmacist") {
      return NextResponse.json({ error: "Pharmacist access required." }, { status: 403 });
    }

    const id = Number((await ctx.params).id);
    const body = (await request.json()) as { pharmacistReply?: string };
    const pharmacistReply = String(body.pharmacistReply ?? "").trim().slice(0, 8000);
    const updatedAt = new Date().toISOString();
    const db = getDb();

    const updated = await db
      .update(prescriptions)
      .set({ pharmacistReply, updatedAt })
      .where(eq(prescriptions.id, id))
      .returning({ id: prescriptions.id });

    if (!updated[0]) {
      return NextResponse.json({ error: "Prescription not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, pharmacistReply, updatedAt });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    const status = msg.includes("authorization") || msg.includes("jwt") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(request: Request, ctx: Params) {
  try {
    const auth = verifyBearer(request.headers.get("authorization"));
    if (auth.role !== "pharmacist") {
      return NextResponse.json({ error: "Pharmacist access required." }, { status: 403 });
    }

    const id = Number((await ctx.params).id);
    const db = getDb();
    const del = await db.delete(prescriptions).where(eq(prescriptions.id, id)).returning({ id: prescriptions.id });

    if (del.length === 0) {
      return NextResponse.json({ error: "Prescription not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    const status = msg.includes("authorization") || msg.includes("jwt") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
