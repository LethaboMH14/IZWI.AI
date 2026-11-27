"use client";
import type { ButtonHTMLAttributes, MouseEvent, ReactNode, Ref } from "react";
import { SpinnerGap } from "@phosphor-icons/react";
import { Kbd } from "./Kbd";
import { Tooltip } from "./Tooltip";

type Common = {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  tone?: "ivory" | "shell";
  size?: "sm" | "md";
  loading?: boolean;
  disabledReason?: string;
  ref?: Ref<HTMLButtonElement>;
};
export type ButtonProps = Common & ButtonHTMLAttributes<HTMLButtonElement>;

function cls(...p: Array<string | false | undefined>) {
  return p.filter(Boolean).join(" ");
}

export function Button({
  variant = "secondary", tone = "ivory", size = "md", loading = false, disabled, disabledReason,
  className, children, onClick, type = "button", ref, ...rest
}: ButtonProps) {
  const blocked = Boolean(disabled) || loading;
  // With a reason the button stays focusable (aria-disabled) so the tooltip can show on hover and focus.
  const soft = Boolean(disabled) && Boolean(disabledReason);
  const handle = (e: MouseEvent<HTMLButtonElement>) => {
    if (blocked) { e.preventDefault(); return; }
    onClick?.(e);
  };
  const el = (
    <button
      {...rest}
      ref={ref}
      type={type}
      disabled={blocked && !soft && !loading ? true : undefined}
      aria-disabled={blocked ? true : undefined}
      aria-busy={loading || undefined}
      onClick={handle}
      className={cls("z-btn", `z-btn-${variant}`, `z-btn-${size}`, tone === "shell" && "z-tone-shell", blocked && "z-is-disabled", loading && "z-is-loading", className)}
    >
      <span className="z-btn-label">{children}</span>
      {loading && <span className="z-btn-spin" aria-hidden="true"><SpinnerGap size={14} weight="bold" /></span>}
    </button>
  );
  return soft ? <Tooltip content={disabledReason}>{el}</Tooltip> : el;
}

export type IconButtonProps = Omit<Common, "variant" | "loading"> & {
  label: string;
  icon: ReactNode;
  shortcut?: string;
  variant?: "secondary" | "ghost" | "danger";
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label">;

export function IconButton({
  label, icon, shortcut, variant = "ghost", tone = "ivory", size = "md", disabled, disabledReason,
  className, onClick, type = "button", ref, ...rest
}: IconButtonProps) {
  const soft = Boolean(disabled) && Boolean(disabledReason);
  const el = (
    <button
      {...rest}
      ref={ref}
      type={type}
      aria-label={label}
      disabled={disabled && !soft ? true : undefined}
      aria-disabled={disabled ? true : undefined}
      onClick={(e) => { if (disabled) { e.preventDefault(); return; } onClick?.(e); }}
      className={cls("z-btn", "z-iconbtn", `z-btn-${variant}`, `z-btn-${size}`, tone === "shell" && "z-tone-shell", disabled && "z-is-disabled", className)}
    >
      <span aria-hidden="true" className="z-iconbtn-icon">{icon}</span>
    </button>
  );
  const tip = disabled && disabledReason ? disabledReason : (
    <span className="z-tip-row">{label}{shortcut && <Kbd tone="shell">{shortcut}</Kbd>}</span>
  );
  return <Tooltip content={tip}>{el}</Tooltip>;
}
