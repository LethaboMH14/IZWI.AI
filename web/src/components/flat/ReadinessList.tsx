"use client";
// What is true about this story right now, step by step. Each step says Done or To do, and an action only where
// the creator can take one. It replaces a bare "nothing here yet" panel, so an empty screen still says what is next.
import type { ReactNode } from "react";

export type ReadinessStep = { label: string; detail: string; done: boolean; action?: ReactNode };

export function ReadinessList({ title, steps }: { title: string; steps: ReadinessStep[] }) {
  return (
    <section className="fs-ready" aria-label={title}>
      <h3 className="fs-ready-h">{title}</h3>
      <ol className="fs-ready-list">
        {steps.map((s) => (
          <li key={s.label} className="fs-ready-item" data-done={s.done || undefined}>
            <span className="fs-ready-state">{s.done ? "Done" : "To do"}</span>
            <span className="fs-ready-text">
              <b>{s.label}</b>
              <span className="fs-muted">{s.detail}</span>
            </span>
            {s.action && <span className="fs-ready-act">{s.action}</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}
