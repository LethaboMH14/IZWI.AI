"use client";
import { Tooltip as BTooltip } from "@base-ui/react/tooltip";
import type { ReactElement, ReactNode } from "react";

/** Dark tooltip. `children` must be a single element that can take a ref and props (a button, a span). */
export function Tooltip({ content, children, delay = 400, side = "top" }: {
  content: ReactNode;
  children: ReactElement<Record<string, unknown>>;
  delay?: number;
  side?: "top" | "bottom" | "left" | "right";
}) {
  if (content === null || content === undefined || content === "") return children;
  return (
    <BTooltip.Provider delay={delay}>
      <BTooltip.Root>
        <BTooltip.Trigger delay={delay} render={children} />
        <BTooltip.Portal>
          <BTooltip.Positioner side={side} sideOffset={6} className="z-tooltip-pos">
            <BTooltip.Popup className="z-tooltip">{content}</BTooltip.Popup>
          </BTooltip.Positioner>
        </BTooltip.Portal>
      </BTooltip.Root>
    </BTooltip.Provider>
  );
}
