import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { assertServerAuthEnv, getUserRow, signToken } from "@/lib/auth";

export const runtime = "nodejs";

function isPgUniqueViolation(err: unknown) {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "23505";
}

function isPgUndefinedTable(err: unknown) {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "42P01";
}

export async function POST(request: Request) {
  try {
    assertServerAuthEnv();

    const body = (await request.json()) as {
      email?: string;
      password?: string;
      displayName?: string;
      role?: string;
      inviteCode?: string;
    };

    const email = String(body.email || "")
      .trim()
      .toLowerCase();
    const password = String(body.password || "");
    const displayName = String(body.displayName || "").trim();
    const wantsPharmacist = body.role === "pharmacist";
    const inviteCode = String(body.inviteCode || "").trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }
    if (!displayName || displayName.length > 120) {
      return NextResponse.json({ error: "Please enter your name (max 120 characters)." }, { status: 400 });
    }

    let role: "patient" | "pharmacist" = "patient";
    if (wantsPharmacist) {
      const code = process.env.PHARMACIST_INVITE_CODE || "";
      if (!code) {
        return NextResponse.json(
          {
            error: "Pharmacist self-registration is disabled. Set PHARMACIST_INVITE_CODE on the server.",
          },
          { status: 403 }
        );
      }
      if (inviteCode !== code) {
        return NextResponse.json({ error: "Invalid staff invite code." }, { status: 403 });
      }
      role = "pharmacist";
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const createdAt = new Date().toISOString();
    const db = getDb();

    const inserted = await db
      .insert(users)
      .values({
        email,
        passwordHash,
        role,
        displayName,
        createdAt,
      })
      .returning({ id: users.id });

    const id = inserted[0]?.id;
    if (!id) {
      return NextResponse.json({ error: "Could not create account." }, { status: 500 });
    }

    const user = await getUserRow(id);
    if (!user) {
      return NextResponse.json({ error: "Could not create account." }, { status: 500 });
    }

    const token = signToken(user);
    return NextResponse.json({ token, user }, { status: 201 });
  } catch (err) {
    if (isPgUniqueViolation(err)) {
      return NextResponse.json(
        { error: "An account with this email already exists. Try signing in." },
        { status: 409 }
      );
    }
    if (isPgUndefinedTable(err)) {
      return NextResponse.json(
        {
          error:
            "The database has no tables yet. Easiest fix: open Neon → SQL Editor, paste the contents of scripts/neon-init-once.sql, and run. Or create .env.local with DATABASE_URL and run: npm run db:migrate",
        },
        { status: 503 }
      );
    }
    const msg = err instanceof Error ? err.message : "";
    if (
      msg.includes("DATABASE_URL") ||
      msg.includes("JWT_SECRET") ||
      msg.includes("misconfiguration") ||
      msg.includes("Environment Variables")
    ) {
      return NextResponse.json({ error: msg }, { status: 503 });
    }
    console.error(err);
    return NextResponse.json(
      {
        error:
          msg && process.env.NODE_ENV === "development"
            ? msg
            : "Could not create account. If this keeps happening, ask the site owner to check server logs and database setup.",
      },
      { status: 500 }
    );
  }
}
