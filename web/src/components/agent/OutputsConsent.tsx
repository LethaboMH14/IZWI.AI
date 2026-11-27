"use client";
import Link from "next/link";
import { useProject } from "@/components/workspace/ProjectProvider";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Counts from the project's real rows. Each line opens the stage that owns it. */
export function OutputsConsent() {
  const id = useProject((s) => s.id);
  const outputs = useProject((s) => s.state.outputs);
  const people = useProject((s) => s.state.people);
  const ready = outputs.filter((o) => o.status === "ready").length;
  const rendering = outputs.filter((o) => o.status === "queued" || o.status === "running").length;
  const held = outputs.filter((o) => o.status === "blocked").length;
  const granted = people.filter((p) => p.consent?.status === "granted").length;
  const open = people.filter((p) => !p.consent || p.consent.status === "requested").length;
  const out = [`${ready} ready`, rendering ? `${rendering} rendering` : null, held ? `${held} held` : null].filter(Boolean).join(" · ");
  const who = people.length === 0 ? "No people marked" : [`${granted} granted`, open ? `${open} open` : null].filter(Boolean).join(" · ");
  return (
    <div className="ag-outcons">
      <h4>Outputs & consent</h4>
      <Link href={`/app/p/${id}/publish`}>
        <span>{outputs.length === 0 ? "Outputs" : plural(outputs.length, "output")}</span><span className="ag-detail">{outputs.length === 0 ? "None yet" : out}</span>
      </Link>
      <Link href={`/app/p/${id}/protect`}>
        <span>{people.length === 0 ? "People" : plural(people.length, "person", "people")}</span><span className="ag-detail">{who}</span>
      </Link>
    </div>
  );
}
