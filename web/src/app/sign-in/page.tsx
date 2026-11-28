"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Fingerprint } from "@phosphor-icons/react";
import { Mark } from "@/components/Mark";
import { CaptionPlayer } from "@/components/CaptionPlayer";
import { authClient } from "@/lib/auth-client";
import { safeNext } from "@/lib/safe-next";
import "../entry.css";

const MIN_PASSWORD = 10;

function SignInForm() {
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [mode, setMode] = useState<"in" | "create">(params.get("mode") === "create" ? "create" : "in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"" | "password" | "passkey">("");
  const [error, setError] = useState("");
  const [touched, setTouched] = useState(false);

  const create = mode === "create";
  const short = password.length > 0 && password.length < MIN_PASSWORD;
  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());
  const ready = emailOk && password.length >= (create ? MIN_PASSWORD : 1) && (!create || name.trim().length > 0);

  // One full page load: the server sees the new session, and a page with a one-time effect (an invite) runs once.
  const finish = () => window.location.assign(next);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!ready || busy) return;
    setBusy("password");
    setError("");
    try {
      const res = create
        ? await authClient.signUp.email({ name: name.trim(), email: email.trim(), password })
        : await authClient.signIn.email({ email: email.trim(), password });
      if (res.error) {
        setError(res.error.message || (create ? "We could not create that account." : "That email and password do not match."));
        setBusy("");
        return;
      }
      finish();
    } catch {
      setError("No connection. Check your signal and try again.");
      setBusy("");
    }
  };

  const passkey = async () => {
    if (busy) return;
    setBusy("passkey");
    setError("");
    try {
      const res = await authClient.signIn.passkey();
      if (res?.error) {
        setError(res.error.message || "That passkey did not work. Use your email and password instead.");
        setBusy("");
        return;
      }
      finish();
    } catch {
      setError("Passkey sign-in was cancelled or is not available on this device.");
      setBusy("");
    }
  };

  const switchMode = (m: "in" | "create") => {
    setMode(m);
    setError("");
    setTouched(false);
  };

  return (
    <main className="auth">
      <section className="auth-form">
        <Mark />
        <div className="auth-box">
          <h1>{create ? <>Start your <em>story.</em></> : <>Pick up your <em>story.</em></>}</h1>
          <p className="lede">
            {create ? "Make an account with your email. Your recordings stay private to your workspace." : "Sign in with your email and password, or with a passkey if you saved one."}
          </p>

          <div className="seg" role="tablist" aria-label="Sign in or create an account">
            <button type="button" role="tab" aria-selected={!create} className={!create ? "on" : ""} onClick={() => switchMode("in")}>Sign in</button>
            <button type="button" role="tab" aria-selected={create} className={create ? "on" : ""} onClick={() => switchMode("create")}>Create account</button>
          </div>

          {/* method="post": a submit before hydration must never put the password in the URL. */}
          <form onSubmit={submit} method="post" noValidate>
            {create && (
              <label className="field">
                <span>Your name</span>
                <input name="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Naledi Mokoena" aria-invalid={touched && !name.trim()} />
              </label>
            )}
            <label className="field">
              <span>Email</span>
              <input name="email" type="email" inputMode="email" autoComplete="username webauthn" autoCapitalize="none" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@yourstudio.co.za" aria-invalid={touched && !emailOk} />
              {touched && !emailOk && <small className="err">That email looks incomplete.</small>}
            </label>
            <label className="field">
              <span>Password</span>
              <input name="password" type="password" autoComplete={create ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={create && short} aria-describedby="pw-hint" />
              <small id="pw-hint" className={create && short ? "err" : ""}>
                {create ? `At least ${MIN_PASSWORD} characters${password ? `. ${password.length} so far.` : "."}` : "The password you made when you joined."}
              </small>
            </label>

            {error && <p className="form-err" role="alert">{error}</p>}

            <button className="btn btn-lg" disabled={busy !== "" || (touched && !ready)} aria-busy={busy === "password"}>
              {busy === "password" ? (create ? "Creating your account…" : "Signing you in…") : create ? "Create my account" : "Sign in"} <ArrowRight weight="bold" />
            </button>
          </form>

          {!create && (
            <>
              <div className="or"><span>or</span></div>
              <button type="button" className="btn btn-lg btn-quiet" onClick={passkey} disabled={busy !== ""} aria-busy={busy === "passkey"}>
                <Fingerprint weight="bold" /> {busy === "passkey" ? "Waiting for your device…" : "Sign in with a passkey"}
              </button>
              <p className="fine">A passkey uses your fingerprint, face or phone PIN. You can add one once you are signed in.</p>
            </>
          )}
          <p className="fine">Invited to a workspace? Create an account or sign in with the email address the invite was sent to.</p>
        </div>
      </section>
      <aside className="auth-side">
        <CaptionPlayer mode="src" />
        <p>We started with one phone and a borrowed mic.<span>Naledi, a fictional host used across IZWI designs</span></p>
      </aside>
    </main>
  );
}

export default function SignIn() {
  return (
    <Suspense fallback={<main className="auth"><section className="auth-form"><Mark /></section></main>}>
      <SignInForm />
    </Suspense>
  );
}
