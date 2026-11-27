// The five stages in the project's stage bar, each with a short count and a status, computed only from
// ProjectState. Pure and tested, so the numbers on screen always match the rows in the database.
import type { ProjectState } from "@/server/state";

export type StageId = "create" | "localise" | "protect" | "publish" | "earn";
export type StageTone = "done" | "working" | "held" | "idle";
export type StageCount = { id: StageId; label: string; count: string | null; tone: StageTone; detail: string };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const activeJob = (status: string) => status === "queued" || status === "running";

export function stageCounts(s: ProjectState): StageCount[] {
  const live = s.clips.filter((c) => c.status !== "dropped");
  const kept = live.filter((c) => c.status === "kept").length;
  const transcribing = s.jobs.some((j) => j.type === "transcribe" && activeJob(j.status));

  const create: StageCount = !s.source
    ? { id: "create", label: "Create", count: null, tone: "idle", detail: "No recording yet" }
    : transcribing
      ? { id: "create", label: "Create", count: null, tone: "working", detail: "Transcribing" }
      : { id: "create", label: "Create", count: live.length ? plural(live.length, "scene") : null, tone: kept > 0 ? "done" : live.length ? "working" : "idle", detail: live.length ? `${kept} kept of ${plural(live.length, "scene")}` : s.lines.length ? "Transcript ready, no scenes yet" : "No transcript yet" };

  const translations = s.tracks.filter((t) => t.kind !== "source");
  const lines = translations.reduce((n, t) => n + t.lines, 0);
  const approved = translations.reduce((n, t) => n + t.approved, 0);
  const localise: StageCount = translations.length === 0
    ? { id: "localise", label: "Localise", count: null, tone: "idle", detail: "No translations yet" }
    : { id: "localise", label: "Localise", count: `${approved}/${lines}`, tone: lines > 0 && approved === lines ? "done" : "working", detail: `${approved} of ${plural(lines, "line")} approved in ${plural(translations.length, "language")}` };

  const held = live.filter((c) => !c.gate.ok).length;
  const protect: StageCount = live.length === 0
    ? { id: "protect", label: "Protect", count: null, tone: "idle", detail: "No scenes to check" }
    : held > 0
      ? { id: "protect", label: "Protect", count: `${held} held`, tone: "held", detail: `${plural(held, "scene")} waiting on consent or a declaration` }
      : { id: "protect", label: "Protect", count: "Clear", tone: "done", detail: "Consent and declaration recorded for every scene" };

  const ready = s.outputs.filter((o) => o.status === "ready").length;
  const rendering = s.outputs.filter((o) => o.status === "queued" || o.status === "running").length;
  const blocked = s.outputs.filter((o) => o.status === "blocked").length;
  const failed = s.outputs.filter((o) => o.status === "failed").length;
  const publish: StageCount = ready > 0
    ? { id: "publish", label: "Publish", count: `${ready} ready`, tone: "done", detail: [`${ready} ready`, rendering && `${rendering} rendering`, blocked && `${blocked} held`, failed && `${failed} failed`].filter(Boolean).join(", ") }
    : rendering > 0
      ? { id: "publish", label: "Publish", count: `${rendering} rendering`, tone: "working", detail: `${plural(rendering, "render")} in progress` }
      : blocked > 0
        ? { id: "publish", label: "Publish", count: `${blocked} held`, tone: "held", detail: `${plural(blocked, "render")} held` }
        : failed > 0
          ? { id: "publish", label: "Publish", count: `${failed} failed`, tone: "held", detail: `${plural(failed, "render")} failed` }
          : { id: "publish", label: "Publish", count: null, tone: "idle", detail: "Nothing rendered yet" };

  const enquiries = s.listings.reduce((n, l) => n + (Array.isArray(l.enquiries) ? l.enquiries.length : 0), 0);
  const offers = s.listings.filter((l) => l.enabled).length;
  const earn: StageCount = enquiries > 0
    ? { id: "earn", label: "Earn", count: plural(enquiries, "enquiry", "enquiries"), tone: "working", detail: `${plural(enquiries, "enquiry", "enquiries")} on ${plural(s.listings.length, "licence offer")}` }
    : offers > 0
      ? { id: "earn", label: "Earn", count: plural(offers, "offer"), tone: "done", detail: `${plural(offers, "licence offer")} live, no enquiries yet` }
      : { id: "earn", label: "Earn", count: null, tone: "idle", detail: s.listings.length ? "Licence offer switched off" : "No licence offer yet" };

  return [create, localise, protect, publish, earn];
}

/** True while the project has work the creator is waiting on, so the store polls faster. */
export function projectBusy(s: ProjectState) {
  return s.jobs.some((j) => activeJob(j.status))
    || s.outputs.some((o) => o.status === "queued" || o.status === "running")
    || s.people.some((p) => p.consent?.status === "requested");
}
