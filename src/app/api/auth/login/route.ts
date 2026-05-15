import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { assertServerAuthEnv, getUserRow, signToken } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertServerAuthEnv();

    const body = (await request.json()) as { email?: string; password?: string };
    const email = String(body.email || "")
      .trim()
      .toLowerCase();
    const password = String(body.password || "");

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    const db = getDb();
    const row = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const u = row[0];
    if (!u || !bcrypt.compareSync(password, u.passwordHash)) {
      return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
    }

    const user = await getUserRow(u.id);
    if (!user) {
      return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
    }

    const token = signToken(user);
    return NextResponse.json({ token, user });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sign-in failed.";
    if (
      msg.includes("DATABASE_URL") ||
      msg.includes("JWT_SECRET") ||
      msg.includes("misconfiguration") ||
      msg.includes("Environment Variables")
    ) {
      return NextResponse.json({ error: msg }, { status: 503 });
    }
    console.error(e);
    return NextResponse.json({ error: "Sign-in failed. Please try again." }, { status: 500 });
  }
}
