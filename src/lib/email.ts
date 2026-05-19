/**
 * Transactional email via Resend (same provider used for welcome mail).
 * Requires RESEND_API_KEY and EMAIL_FROM in server env.
 */

type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export function getAppBaseUrl(): string {
  const explicit = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}

function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail({ to, subject, html, text }: SendEmailParams): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    throw new Error(
      "Email is not configured. Set RESEND_API_KEY and EMAIL_FROM in your server environment (e.g. Vercel → Environment Variables)."
    );
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
      text: text || html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("[email] Resend error", res.status, body);
    throw new Error("Could not send email. Please try again later.");
  }
}

export async function sendWelcomeEmail(to: string, displayName: string): Promise<void> {
  if (!emailConfigured()) return;

  const name = displayName.trim() || "there";
  const base = getAppBaseUrl();

  await sendEmail({
    to,
    subject: "Welcome to Jerlyd Pharmacy",
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;color:#0f2420">
        <h1 style="color:#0f6e56;font-size:1.35rem">Welcome, ${escapeHtml(name)}</h1>
        <p>Your Jerlyd Pharmacy patient portal account is ready.</p>
        <p>You can sign in anytime to view medications recorded by your pharmacist, shop our marketplace, and share feedback.</p>
        <p style="margin:1.5rem 0">
          <a href="${base}" style="display:inline-block;background:#0f6e56;color:#fff;padding:0.65rem 1.25rem;border-radius:999px;text-decoration:none;font-weight:600">Open patient portal</a>
        </p>
        <p style="font-size:0.85rem;color:#5a6b66">If you did not create this account, please contact your pharmacy.</p>
      </div>
    `,
  });
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const base = getAppBaseUrl();

  await sendEmail({
    to,
    subject: "Reset your Jerlyd Pharmacy password",
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;color:#0f2420">
        <h1 style="color:#0f6e56;font-size:1.35rem">Password reset</h1>
        <p>We received a request to reset the password for your Jerlyd Pharmacy account.</p>
        <p style="margin:1.5rem 0">
          <a href="${resetUrl}" style="display:inline-block;background:#0f6e56;color:#fff;padding:0.65rem 1.25rem;border-radius:999px;text-decoration:none;font-weight:600">Reset password</a>
        </p>
        <p style="font-size:0.88rem;color:#5a6b66">This link expires in 1 hour. If you did not request a reset, you can ignore this email.</p>
        <p style="font-size:0.82rem;color:#5a6b66;word-break:break-all">${resetUrl}</p>
        <p style="font-size:0.82rem;color:#5a6b66"><a href="${base}">${base}</a></p>
      </div>
    `,
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function isEmailConfigured(): boolean {
  return emailConfigured();
}
