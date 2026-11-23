"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check } from "@phosphor-icons/react";
import { Mark } from "@/components/Mark";
import { Uploader } from "@/components/Uploader";
import { api, ApiError, newKey } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { KIND_LABEL, KIND_ORDER } from "@/lib/kinds";
import { LANGUAGES, langName } from "@/lib/languages";
import "../entry.css";

const MAKES = [
  { id: "podcast", label: "Podcast", kind: "podcast" },
  { id: "video", label: "YouTube videos", kind: "video" },
  { id: "shorts", label: "Short-form clips", kind: "video" },
  { id: "lesson", label: "Lessons and courses", kind: "lesson" },
  { id: "music", label: "Music", kind: "music" },
  { id: "film", label: "Film and documentary", kind: "film" },
  { id: "animation", label: "Animation and AI story", kind: "animation" },
  { id: "client", label: "Client work for others", kind: "client" },
] as const;

const DEVICES = [
  { id: "phone", label: "Phone only" },
  { id: "both", label: "Phone and laptop" },
  { id: "laptop", label: "Laptop or desktop" },
] as const;

const STEPS = ["What you make", "How you speak", "How you work", "Your workspace", "First story"];

export default function Welcome() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [checking, setChecking] = useState(true);
  const [hasWorkspace, setHasWorkspace] = useState(false);
  const [wsName, setWsName] = useState("");
  const [step, setStep] = useState(0);

  const [makes, setMakes] = useState<string[]>([]);
  const [kind, setKind] = useState("");
  const [speak, setSpeak] = useState<string[]>(["en"]);
  const [mix, setMix] = useState(true);
  const [device, setDevice] = useState<(typeof DEVICES)[number]["id"]>("both");
  const [saver, setSaver] = useState(true);
  const [nameTouched, setNameTouched] = useState(false);

  const [title, setTitle] = useState("");
  const [spoken, setSpoken] = useState("auto");
  const [projectId, setProjectId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const wsKey = useRef(newKey());
  const projKey = useRef(newKey());

  const first = (session?.user.name ?? "").trim().split(/\s+/)[0] || "My";
  const defaultName = first === "My" ? "My studio" : `${first}'s studio`;
  const wsNameValue = nameTouched ? wsName : wsName || defaultName;

  // Signed out → sign in. Signed in with a workspace → skip to the first story. Signed in with workspaces but none
  // active on this device → make one active instead of creating a duplicate.
  const uid = session?.user.id;
  useEffect(() => {
    if (isPending) return;
    if (!uid) { router.replace("/sign-in?next=%2Fwelcome"); return; }
    let dead = false;
    (async () => {
      try {
        const w = await api<{ name?: string }>("/api/workspace");
        if (dead) return;
        setWsName(w.name ?? "");
        setNameTouched(true);
        setHasWorkspace(true);
        setStep(4);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) { router.replace("/sign-in?next=%2Fwelcome"); return; }
        if (e instanceof ApiError && e.status === 409) {
          try {
            const orgs = await authClient.organization.list();
            const org = orgs.data?.[0];
            if (org) {
              await authClient.organization.setActive({ organizationId: org.id });
              if (!dead) router.replace("/app");
              return;
            }
          } catch { /* fall through to onboarding */ }
        } else if (!dead) setError(e instanceof ApiError ? e.message : "Could not check your workspace.");
      } finally {
        if (!dead) setChecking(false);
      }
    })();
    return () => { dead = true; };
  }, [uid, isPending, router]);

  const kinds = useMemo(() => {
    const out: string[] = [];
    for (const id of makes) { const k = MAKES.find((m) => m.id === id)?.kind; if (k && !out.includes(k)) out.push(k); }
    return out;
  }, [makes]);
  const activeKind = kind || kinds[0] || "podcast";

  const toggle = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const spokenChoices = useMemo(() => speak.filter((c) => LANGUAGES.some((l) => l.code === c)), [speak]);
  const listening = spokenChoices.filter((c) => LANGUAGES.find((l) => l.code === c)?.whisper);
  const translateOnly = spokenChoices.filter((c) => !LANGUAGES.find((l) => l.code === c)?.whisper);

  const can = [makes.length > 0, speak.length > 0, true, wsNameValue.trim().length >= 2, true][step];

  async function createWorkspace() {
    if (submitting.current || hasWorkspace) { setStep(4); return; }
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      await api("/api/workspace", {
        method: "POST",
        key: wsKey.current,
        body: { name: wsNameValue.trim(), makes, languages: speak, mixesLanguages: mix, device, dataSaver: saver },
      });
      setHasWorkspace(true);
      setWsName(wsNameValue.trim());
      setStep(4);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create the workspace. Try again.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  async function createProject() {
    if (submitting.current || projectId) return;
    if (!title.trim()) { setError("Give your story a title so you can find it again."); return; }
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await api<{ id: string }>("/api/projects", { method: "POST", key: projKey.current, body: { title: title.trim(), kind: activeKind, spokenLanguage: spoken } });
      setProjectId(r.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not start the story. Try again.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  const next = () => {
    setError("");
    if (step === 3) void createWorkspace();
    else setStep((s) => Math.min(4, s + 1));
  };
  const back = () => { setError(""); setStep((s) => Math.max(0, s - 1)); };

  if (isPending || checking) {
    return (
      <main className="welcome" aria-busy="true">
        <header><Mark /></header>
        <p className="lede wcheck">Opening your setup…</p>
      </main>
    );
  }

  return (
    <main className="welcome">
      <header>
        <Mark />
        {hasWorkspace ? <Link href="/app" className="link">Skip for now</Link> : <button type="button" className="link" onClick={async () => { await authClient.signOut(); router.replace("/sign-in"); }}>Use a different account</button>}
      </header>
      <ol className="steps steps-5" aria-label="Setup progress">
        {STEPS.map((s, i) => (
          <li key={s} className={i < step ? "past" : i === step ? "now" : ""} aria-current={i === step ? "step" : undefined}>
            <i>{i < step ? <Check weight="bold" /> : i + 1}</i><span>{s}</span>
          </li>
        ))}
      </ol>

      <section className="wstep" key={step}>
        {step === 0 && (
          <>
            <h1>What do you <em>make?</em></h1>
            <p className="lede">Pick everything that fits. This only changes the templates you see first.</p>
            <div className="chips big">
              {MAKES.map((m) => (
                <button key={m.id} type="button" aria-pressed={makes.includes(m.id)} className={makes.includes(m.id) ? "on" : ""} onClick={() => toggle(makes, setMakes, m.id)}>{m.label}</button>
              ))}
            </div>
            {kinds.length > 1 && (
              <div className="wsub">
                <h2>Your first story is a…</h2>
                <div className="chips" role="radiogroup" aria-label="Kind of your first story">
                  {kinds.map((k) => <button key={k} type="button" role="radio" aria-checked={activeKind === k} className={activeKind === k ? "on" : ""} onClick={() => setKind(k)}>{KIND_LABEL[k]}</button>)}
                </div>
              </div>
            )}
          </>
        )}

        {step === 1 && (
          <>
            <h1>Which languages do you <em>speak in?</em></h1>
            <p className="lede">Choose what you actually say on the mic. We use this to hear you properly and to learn which languages creators need next.</p>
            {(["South Africa", "Elsewhere"] as const).map((group) => (
              <div className="wgroup" key={group}>
                <h2 className="wlabel">{group === "South Africa" ? "South African languages" : "Other languages"}</h2>
                <div className="chips">
                  {LANGUAGES.filter((l) => (group === "South Africa") === (l.region === "South Africa")).map((l) => (
                    <button key={l.code} type="button" aria-pressed={speak.includes(l.code)} className={speak.includes(l.code) ? "on" : ""} onClick={() => toggle(speak, setSpeak, l.code)}>{l.name}</button>
                  ))}
                </div>
              </div>
            ))}
            <label className="toggle"><input type="checkbox" checked={mix} onChange={(e) => setMix(e.target.checked)} /><i /><span><b>I mix languages in one sentence</b><small>Captions keep the switch instead of forcing one language.</small></span></label>
            {spokenChoices.length > 0 && (
              <div className="lang-honest" aria-live="polite">
                {listening.length > 0 && <p><b>Listed by the listening model:</b> {listening.map(langName).join(", ")}. Quality is not measured per language yet.</p>}
                {translateOnly.length > 0 && <p><b>Not on the listening model’s list:</b> {translateOnly.map(langName).join(", ")}. You can still add captions by hand, and the translation model lists them.</p>}
              </div>
            )}
            <p className="fine">Picking a language does not mean IZWI supports it yet. “Listed” means the open model names it. It is not a promise of accuracy.</p>
          </>
        )}

        {step === 2 && (
          <>
            <h1>How do you <em>work?</em></h1>
            <p className="lede">So the first screen fits the device in your hand.</p>
            <div className="chips big" role="radiogroup" aria-label="Your device">
              {DEVICES.map((d) => <button key={d.id} type="button" role="radio" aria-checked={device === d.id} className={device === d.id ? "on" : ""} onClick={() => setDevice(d.id)}>{d.label}</button>)}
            </div>
            <label className="toggle"><input type="checkbox" checked={saver} onChange={(e) => setSaver(e.target.checked)} /><i /><span><b>Data saver</b><small>Light previews first, and the size shown before anything downloads.</small></span></label>
          </>
        )}

        {step === 3 && (
          <>
            <h1>Name your <em>workspace.</em></h1>
            <p className="lede">This is where your stories, your team and your records live. You can invite people later.</p>
            <label className="field wfield">
              <span>Workspace name</span>
              <input value={wsNameValue} maxLength={60} onFocus={(e) => { if (!nameTouched) e.currentTarget.select(); }} onMouseUp={(e) => { if (!nameTouched) e.preventDefault(); }} onChange={(e) => { setNameTouched(true); setWsName(e.target.value); }} aria-invalid={nameTouched && wsNameValue.trim().length < 2} autoComplete="organization" />
              <small>At least 2 characters. You are the owner.</small>
            </label>
          </>
        )}

        {step === 4 && (
          <>
            <h1>Bring your first <em>story.</em></h1>
            <p className="lede">One episode, one video, one voice note. It stays private to <b>{wsName || wsNameValue}</b>.</p>
            {!projectId ? (
              <form className="wfirst" onSubmit={(e) => { e.preventDefault(); void createProject(); }} noValidate>
                <label className="field wfield">
                  <span>Title</span>
                  <input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Episode 4: The taxi rank" aria-invalid={!!error && !title.trim()} />
                </label>
                <div className="field">
                  <span id="spoken-l">Spoken language</span>
                  <div className="chips" role="radiogroup" aria-labelledby="spoken-l">
                    <button type="button" role="radio" aria-checked={spoken === "auto"} className={spoken === "auto" ? "on" : ""} onClick={() => setSpoken("auto")}>Detect for me</button>
                    {spokenChoices.map((c) => <button key={c} type="button" role="radio" aria-checked={spoken === c} className={spoken === c ? "on" : ""} onClick={() => setSpoken(c)}>{langName(c)}</button>)}
                  </div>
                  <small>{spoken === "auto" ? "The listening model guesses from the first seconds. If it guesses wrong, change it in the studio and listen again." : `Tells the listening model what to expect. ${langName(spoken)} ${LANGUAGES.find((l) => l.code === spoken)?.whisper ? "is" : "is not"} on its list.`}</small>
                </div>
                <div className="field">
                  <span id="kind-l">What kind of story is it?</span>
                  <div className="chips" role="radiogroup" aria-labelledby="kind-l">
                    {KIND_ORDER.map((k) => <button key={k} type="button" role="radio" aria-checked={activeKind === k} className={activeKind === k ? "on" : ""} onClick={() => setKind(k)}>{KIND_LABEL[k]}</button>)}
                  </div>
                </div>
                {error && <p className="form-err" role="alert">{error}</p>}
                <button className="btn btn-lg" disabled={busy}>{busy ? "Starting…" : "Continue to upload"} <ArrowRight weight="bold" /></button>
              </form>
            ) : (
              <>
                <p className="wkind mono">{title} · {KIND_LABEL[activeKind]} · {spoken === "auto" ? "language detected" : langName(spoken)}</p>
                <Uploader projectId={projectId} onDone={() => router.push(`/app/p/${projectId}`)} />
                <Link href={`/app/p/${projectId}`} className="link">Open the story without a file for now <ArrowRight /></Link>
              </>
            )}
          </>
        )}
        {step < 4 && error && <p className="form-err" role="alert">{error}</p>}
      </section>

      <footer>
        <button type="button" className="btn btn-quiet" onClick={back} disabled={step === 0 || (hasWorkspace && step === 4) || !!projectId}><ArrowLeft /> Back</button>
        {step < 4 && (
          <button type="button" className="btn btn-lg" disabled={!can || busy} onClick={next}>
            {step === 3 ? (busy ? "Creating…" : hasWorkspace ? "Continue" : "Create workspace") : "Continue"} <ArrowRight weight="bold" />
          </button>
        )}
      </footer>
    </main>
  );
}
