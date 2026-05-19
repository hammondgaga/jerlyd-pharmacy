import { NextResponse } from "next/server";
import { assertServerAuthEnv } from "@/lib/auth";
import { getAppBaseUrl, isEmailConfigured, sendPasswordResetEmail } from "@/lib/email";
import { createPasswordResetToken, findUserByEmail } from "@/lib/password-reset";

export const runtime = "nodejs";

const GENERIC_OK =
  "If an account exists for that email, we sent a password reset link. Check your inbox and spam folder.";

export async function POST(request: Request) {
  try {
    assertServerAuthEnv();

    if (!isEmailConfigured()) {
      return NextResponse.json(
        {
          error:
            "Password reset email is not configured yet. Ask the site owner to set RESEND_API_KEY and EMAIL_FROM.",
        },
        { status: 503 }
      );
    }

    const body = (await request.json()) as { email?: string };
    const email = String(body.email || "")
      .trim()
      .toLowerCase();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
    }

    const user = await findUserByEmail(email);
    if (user) {
      const token = await createPasswordResetToken(user.id);
      const resetUrl = `${getAppBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
      try {
        await sendPasswordResetEmail(user.email, resetUrl);
      } catch (e) {
        console.error("[forgot-password] send failed", e);
        return NextResponse.json(
          { error: "Could not send reset email. Please try again in a few minutes." },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ message: GENERIC_OK });
  } catch (e) {
    console.error("[forgot-password]", e);
    const msg = e instanceof Error ? e.message : "Request failed.";
    const status = msg.includes("DATABASE_URL") || msg.includes("JWT_SECRET") ? 503 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
