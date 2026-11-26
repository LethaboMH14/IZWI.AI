import type { ReactNode } from "react";

export function EmptyState({ icon, title, line, action }: {
  icon: ReactNode;
  title: string;
  line: string;
  action?: ReactNode;
}) {
  return (
    <div className="z-empty">
      <span className="z-empty-icon" aria-hidden="true">{icon}</span>
      <h3 className="z-empty-title">{title}</h3>
      <p className="z-empty-line">{line}</p>
      {action}
    </div>
  );
}
