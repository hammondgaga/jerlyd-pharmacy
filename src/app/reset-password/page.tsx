"use client";

import Link from "next/link";
import Image from "next/image";
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
            <Image 
              src="/logo.jpg" 
              alt="Jerlyd Pharmacy logo" 
              height={48}
              width={160}
              style={{ objectFit: "contain" }}
              priority
            />
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
