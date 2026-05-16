import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
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
      .select({ walletAddress: users.walletAddress, email: users.email })
      .from(users)
      .where(eq(users.id, auth.sub))
      .limit(1);

    const row = rows[0];
    if (!row) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    return NextResponse.json({
      walletAddress: row.walletAddress,
      email: row.email,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    const status = msg.includes("authorization") || msg.includes("jwt") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = verifyBearer(request.headers.get("authorization"));
    if (auth.role !== "patient") {
      return NextResponse.json({ error: "Patient access required." }, { status: 403 });
    }

    const body = (await request.json()) as { walletAddress?: string };
    const walletAddress = String(body.walletAddress || "").trim();

    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return NextResponse.json({ error: "Invalid wallet address." }, { status: 400 });
    }

    const db = getDb();
    await db.update(users).set({ walletAddress }).where(eq(users.id, auth.sub));

    return NextResponse.json({ walletAddress });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not save wallet.";
    const status = msg.includes("authorization") || msg.includes("jwt") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
