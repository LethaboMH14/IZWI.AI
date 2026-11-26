"use client";
import { Menu as BMenu } from "@base-ui/react/menu";
import { ContextMenu as BContext } from "@base-ui/react/context-menu";
import { CaretRight } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import type { ReactElement, ReactNode } from "react";

export type MenuItem =
  | {
      id: string;
      label: string;
      icon?: Icon;
      shortcut?: string;
      onSelect?: () => void;
      disabled?: boolean;
      disabledReason?: string;
      danger?: boolean;
      items?: MenuItem[];
    }
  | { separator: true }
  | { heading: string };

// ContextMenu and Menu share the same item, popup and submenu parts; only root, trigger and positioner differ.
type Parts = {
  Item: typeof BMenu.Item;
  Popup: typeof BMenu.Popup;
  Separator: typeof BMenu.Separator;
  SubmenuRoot: typeof BMenu.SubmenuRoot;
  SubmenuTrigger: typeof BMenu.SubmenuTrigger;
  Portal: typeof BMenu.Portal;
  Positioner: typeof BMenu.Positioner;
};

function Row({ item }: { item: Exclude<MenuItem, { separator: true } | { heading: string }> }) {
  const Ic = item.icon;
  return (
    <>
      <span className="z-menu-icon" aria-hidden="true">{Ic ? <Ic size={16} /> : null}</span>
      <span className="z-menu-label">{item.label}</span>
      {item.shortcut && <span className="z-menu-shortcut">{item.shortcut}</span>}
    </>
  );
}

function renderItems(P: Parts, items: MenuItem[], keyPrefix = ""): ReactNode {
  return items.map((item, i) => {
    const key = `${keyPrefix}${i}`;
    if ("separator" in item) return <P.Separator key={key} className="z-menu-sep" />;
    if ("heading" in item) return <div key={key} role="presentation" className="z-menu-heading">{item.heading}</div>;
    const cls = `z-menu-item${item.danger ? " z-menu-danger" : ""}`;
    const title = item.disabled ? item.disabledReason : undefined;
    if (item.items && item.items.length) {
      return (
        <P.SubmenuRoot key={item.id}>
          <P.SubmenuTrigger className={cls} disabled={item.disabled} title={title}>
            <Row item={item} />
            <CaretRight size={12} className="z-menu-caret" aria-hidden="true" />
          </P.SubmenuTrigger>
          <P.Portal>
            <P.Positioner className="z-menu-pos" sideOffset={2} alignOffset={-4}>
              <P.Popup className="z-menu">{renderItems(P, item.items, `${key}.`)}</P.Popup>
            </P.Positioner>
          </P.Portal>
        </P.SubmenuRoot>
      );
    }
    return (
      <P.Item key={item.id} className={cls} disabled={item.disabled} title={title} onClick={() => item.onSelect?.()}>
        <Row item={item} />
      </P.Item>
    );
  });
}

/** Menu with a visible trigger. `trigger` is a single element (usually an IconButton or Button). */
export function DropdownMenu({ trigger, items, align = "start" }: {
  trigger: ReactElement<Record<string, unknown>>;
  items: MenuItem[];
  align?: "start" | "center" | "end";
}) {
  return (
    <BMenu.Root>
      <BMenu.Trigger render={trigger} />
      <BMenu.Portal>
        <BMenu.Positioner className="z-menu-pos" sideOffset={4} align={align}>
          <BMenu.Popup className="z-menu">{renderItems(BMenu as unknown as Parts, items)}</BMenu.Popup>
        </BMenu.Positioner>
      </BMenu.Portal>
    </BMenu.Root>
  );
}

/** Right-click menu around `children`, built from the same `items` as DropdownMenu. */
export function ContextMenu({ children, items }: { children: ReactNode; items: MenuItem[] }) {
  return (
    <BContext.Root>
      <BContext.Trigger className="z-context-trigger">{children}</BContext.Trigger>
      <BContext.Portal>
        <BContext.Positioner className="z-menu-pos">
          <BContext.Popup className="z-menu">{renderItems(BContext as unknown as Parts, items)}</BContext.Popup>
        </BContext.Positioner>
      </BContext.Portal>
    </BContext.Root>
  );
}
