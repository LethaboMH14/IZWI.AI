"use client";

// The page the reset email links to. The link carries a one-time token; a bad, expired or used token is shown as such.
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight } from "@phosphor-icons/react";
import { Mark } from "@/components/Mark";
import { authClient } from "@/lib/auth-client";
import "../entry.css";

const MIN_PASSWORD = 10;

function ResetForm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const linkError = params.get("error");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const short = password.length > 0 && password.length < MIN_PASSWORD;
  const mismatch = confirm.length > 0 && confirm !== password;
  const ready = token.length > 0 && password.length >= MIN_PASSWORD && password === confirm;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await authClient.resetPassword({ newPassword: password, token });
      if (res.error) {
        setError(res.error.message || "This link has expired or was already used. Ask for a new one.");
      } else {
        setDone(true);
      }
    } catch {
      setError("No connection. Check your signal and try again.");
    }
    setBusy(false);
  };

  return (
    <main className="auth">
      <section className="auth-form">
        <Mark />
        <div className="auth-box">
          <h1>Choose a new <em>password.</em></h1>
          {done ? (
            <>
              <p className="lede">Your password is changed. You can sign in with it now.</p>
              <a className="btn btn-lg" href="/sign-in">Sign in <ArrowRight weight="bold" /></a>
            </>
          ) : !token ? (
            <>
              <p className="lede">{linkError ? "This link has expired or was already used." : "This link is missing its code."} Ask for a new reset link.</p>
              <a className="btn btn-lg btn-quiet" href="/sign-in">Back to sign in</a>
            </>
          ) : (
            <>
              <p className="lede">At least {MIN_PASSWORD} characters. The link works once.</p>
              <form onSubmit={submit} method="post" noValidate>
                <label className="field">
                  <span>New password</span>
                  <input name="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={short} aria-describedby="rp-hint" />
                  <small id="rp-hint" className={short ? "err" : ""}>{short ? `${MIN_PASSWORD - password.length} more to go.` : `At least ${MIN_PASSWORD} characters.`}</small>
                </label>
                <label className="field">
                  <span>Type it again</span>
                  <input name="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={mismatch} />
                  {mismatch && <small className="err">The two passwords do not match yet.</small>}
                </label>
                {error && <p className="form-err" role="alert">{error}</p>}
                <button className="btn btn-lg" disabled={!ready || busy} aria-busy={busy}>
                  {busy ? "Saving…" : "Save new password"} <ArrowRight weight="bold" />
                </button>
              </form>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetForm />
    </Suspense>
  );
}
