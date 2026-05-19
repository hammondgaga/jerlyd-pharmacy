import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { assertServerAuthEnv } from "@/lib/auth";
import { consumeResetToken } from "@/lib/password-reset";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertServerAuthEnv();

    const body = (await request.json()) as {
      token?: string;
      password?: string;
      password2?: string;
    };

    const token = String(body.token || "").trim();
    const password = String(body.password || "");
    const password2 = String(body.password2 || "");

    if (!token || token.length < 20) {
      return NextResponse.json({ error: "Invalid or missing reset link." }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }
    if (password !== password2) {
      return NextResponse.json({ error: "Passwords did not match." }, { status: 400 });
    }

    const userId = await consumeResetToken(token);
    if (!userId) {
      return NextResponse.json(
        { error: "This reset link is invalid or has expired. Request a new link from the sign-in page." },
        { status: 400 }
      );
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const db = getDb();
    await db.update(users).set({ passwordHash }).where(eq(users.id, userId));

    return NextResponse.json({ message: "Your password has been updated. You can sign in now." });
  } catch (e) {
    console.error("[reset-password]", e);
    const msg = e instanceof Error ? e.message : "Could not reset password.";
    const status =
      msg.includes("column") || msg.includes("does not exist")
        ? 503
        : msg.includes("DATABASE_URL")
          ? 503
          : 500;
    return NextResponse.json(
      {
        error:
          status === 503
            ? "Password reset needs a database update (run scripts/neon-init-v5.sql)."
            : msg,
      },
      { status }
    );
  }
}
