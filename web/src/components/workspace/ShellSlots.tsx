"use client";
// The shell owns the header; pages put their controls into it through these slots, so there is exactly one
// header on every /app page (Codex review round 1, finding 10) and project pages can still add a switcher.
import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Slots = { main: HTMLElement | null; actions: HTMLElement | null };
export const ShellSlotsContext = createContext<Slots>({ main: null, actions: null });

/** Controls placed after the wordmark: the project switcher and the view switch. */
export function HeaderSlot({ children }: { children: ReactNode }) {
  const { main } = useContext(ShellSlotsContext);
  return main ? createPortal(children, main) : null;
}

/** Controls placed before the account menu: save state, Share, Export. */
export function HeaderActions({ children }: { children: ReactNode }) {
  const { actions } = useContext(ShellSlotsContext);
  return actions ? createPortal(children, actions) : null;
}
