"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PasswordField } from "@/components/PasswordField";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!token) {
    return (
      <section className="panel auth-panel">
        <h1>Invalid link</h1>
        <p className="panel-sub muted">This password reset link is missing or incomplete.</p>
        <Link href="/" className="btn btn-primary">
          Back to sign in
        </Link>
      </section>
    );
  }

  if (done) {
    return (
      <section className="panel auth-panel">
        <h1>Password updated</h1>
        <p className="panel-sub">Your new password is saved. Sign in with it on the patient portal.</p>
        <Link href="/" className="btn btn-primary">
          Go to sign in
        </Link>
      </section>
    );
  }

  return (
    <section className="panel auth-panel">
      <h1>Choose a new password</h1>
      <p className="panel-sub">Enter and confirm your new password below.</p>
      {error ? (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      ) : null}
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          setError(null);
          const fd = new FormData(e.currentTarget);
          const password = String(fd.get("password") || "");
          const password2 = String(fd.get("password2") || "");
          try {
            const res = await fetch("/api/auth/reset-password", {
              method: "POST",
              headers: { "Content-Type": "application/json", Accept: "application/json" },
              body: JSON.stringify({ token, password, password2 }),
            });
            const data = (await res.json()) as { error?: string; message?: string };
            if (!res.ok) {
              setError(data.error || "Could not reset password.");
              return;
            }
            setDone(true);
          } catch {
            setError("Network error. Please try again.");
          } finally {
            setSaving(false);
          }
        }}
      >
        <PasswordField id="resetPw" name="password" label="New password" autoComplete="new-password" minLength={8} required />
        <PasswordField
          id="resetPw2"
          name="password2"
          label="Confirm new password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Update password"}
          </button>
        </div>
      </form>
    </section>
  );
}

export default function ResetPasswordPage() {
  return (
    <>
      <div className="bg-pattern" aria-hidden />
      <header className="site-header">
        <div className="brand">
          <div className="brand-logo-wrapper">
            <picture>
              <img 
                src="/logo.jpeg" 
                alt="Jerlyd Pharmacy" 
                style={{ height: "48px", width: "auto" }}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                  const svg = (e.currentTarget as HTMLImageElement).nextElementSibling as SVGSVGElement | null;
                  if (svg) svg.style.display = "block";
                }}
              />
              <svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: "none", width: "28px", height: "28px" }} aria-hidden>
                <rect x="1.5" y="10" width="11" height="8" rx="4" stroke="currentColor" strokeWidth="1.75" />
                <circle cx="20" cy="14" r="6.5" stroke="currentColor" strokeWidth="1.75" />
                <path d="M20 11.25v5.5M17.25 14h5.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              </svg>
            </picture>
          </div>
          <div className="brand-text-wrapper">
            <p className="brand-name">Jerlyd Pharmacy</p>
            <p className="brand-tag">Password reset</p>
          </div>
        </div>
      </header>
      <main className="main">
        <Suspense fallback={<p className="muted">Loading…</p>}>
          <ResetPasswordForm />
        </Suspense>
      </main>
    </>
  );
}
