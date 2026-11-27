"use client";
import { Tabs as BTabs } from "@base-ui/react/tabs";
import type { ReactNode } from "react";

export type TabItem = { value: string; label: string; panel?: ReactNode; disabled?: boolean };

export function Tabs({ items, value, defaultValue, onValueChange, tone = "ivory", label }: {
  items: TabItem[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (v: string) => void;
  tone?: "ivory" | "shell";
  label: string;
}) {
  const controlled = value !== undefined ? { value } : { defaultValue: defaultValue ?? items[0]?.value };
  return (
    <BTabs.Root {...controlled} onValueChange={(v) => onValueChange?.(String(v))} className={`z-tabs${tone === "shell" ? " z-tone-shell" : ""}`}>
      <BTabs.List className="z-tabs-list" aria-label={label}>
        {items.map((t) => (
          <BTabs.Tab key={t.value} value={t.value} disabled={t.disabled} className="z-tab">{t.label}</BTabs.Tab>
        ))}
        <BTabs.Indicator className="z-tabs-indicator" />
      </BTabs.List>
      {items.map((t) => t.panel !== undefined && (
        <BTabs.Panel key={t.value} value={t.value} className="z-tabs-panel">{t.panel}</BTabs.Panel>
      ))}
    </BTabs.Root>
  );
}
