import { CheckCircle, Question, Warning } from "@phosphor-icons/react";
import type { Effect } from "@/lib/edit-effects";

const ICON = { ok: CheckCircle, warn: Warning, unknown: Question };
const WORD = { ok: "OK", warn: "Check", unknown: "Unknown" };

export function EffectsList({ effects }: { effects: Effect[] }) {
  return (
    <div className="ag-effects">
      <h4>Effects of this edit</h4>
      <ul>
        {effects.map((e) => {
          const Ic = ICON[e.tone];
          return (
            <li key={e.id} data-tone={e.tone}>
              <Ic size={16} weight="fill" aria-hidden="true" />
              <div><span className="sr-only">{WORD[e.tone]}: </span>{e.title}<span className="ag-detail">{e.detail}</span></div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
