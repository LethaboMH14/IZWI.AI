"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import type { SeasonalIdea } from "@/lib/seasonal-calendar";

export function SeasonalSuggestion({ idea }: { idea: SeasonalIdea }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const choose = async (action: "accept" | "dismiss") => {
    setBusy(true);
    try {
      const result = await api<{ message: string }>("/api/seasonal-suggestions", { method: "POST", body: { seasonalId: idea.id, action } });
      if (action === "accept") { const shell = document.querySelector<HTMLElement>(".z-shell"); if (shell) { shell.dataset.izwiTheme = idea.theme; shell.dataset.izwiAccent = idea.accent; } }
      setMessage(result.message);
    }
    catch (error) { setMessage((error as Error).message || "Could not save your choice."); }
    finally { setBusy(false); }
  };
  return <section className="st-card st-seasonal" aria-label="Seasonal suggestion"><p className="fine">Calendar suggestion · {idea.window}</p><h2>{idea.name}</h2><p>This is a data-based suggestion, not an AI judgment. It will not change your look until you accept it.</p><ul>{idea.ideas.map((text) => <li key={text}>{text}</li>)}</ul><p>Suggested look: {idea.theme === "approved" ? "Approved look" : idea.theme} · {idea.accent}.</p><div className="st-actions"><button type="button" className="btn btn-sm" disabled={busy} onClick={() => void choose("accept")}>Accept seasonal look</button><button type="button" className="btn btn-sm btn-quiet" disabled={busy} onClick={() => void choose("dismiss")}>Dismiss</button></div>{message && <p role="status">{message}</p>}</section>;
}
