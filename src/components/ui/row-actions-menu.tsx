"use client";

import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

const subscribeNothing = () => () => {};
const GAP = 6;
const EDGE = 8;
const menuItems = (panel: HTMLElement | null) => Array.from(panel?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? []);

/**
 * "Thêm ▾" for the less used actions of a table row, in the look of the other "more" menus (.more-actions-menu). The list is
 * drawn in <body> so the table's sideways scroller cannot clip it, and it stays mounted while closed: an item that is a
 * FormDialog keeps its popup open after the list closes. Arrow keys move between items; Escape, Tab or a click outside closes.
 */
export function RowActionsMenu({ label = "Thêm", accessibleLabel, triggerData, children }: {
  label?: string;
  /** Spoken name of the button, e.g. "Thêm thao tác · Nguyễn Văn An"; it starts with the visible label. */
  accessibleLabel?: string;
  /** data-* attributes on the button, e.g. the record it acts on, for scripted checks. */
  triggerData?: Record<string, string>;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const focusOnOpen = useRef<"first" | "last">("first");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const mounted = useSyncExternalStore(subscribeNothing, () => true, () => false);

  const place = useCallback(() => {
    const trigger = triggerRef.current, panel = panelRef.current;
    if (!trigger || !panel) return;
    const anchor = trigger.getBoundingClientRect();
    const { width, height } = panel.getBoundingClientRect();
    const below = anchor.bottom + GAP;
    const above = anchor.top - GAP - height;
    const flip = below + height > window.innerHeight - EDGE && above >= EDGE;
    const left = Math.min(Math.max(EDGE, anchor.right - width), window.innerWidth - EDGE - width);
    panel.style.top = `${Math.round(flip ? above : below)}px`;
    panel.style.left = `${Math.round(Math.max(EDGE, left))}px`;
    panel.dataset.side = flip ? "top" : "bottom";
  }, []);

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    const list = menuItems(panelRef.current);
    (focusOnOpen.current === "last" ? list[list.length - 1] : list[0])?.focus();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) close(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place, close]);

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    focusOnOpen.current = event.key === "ArrowUp" ? "last" : "first";
    setOpen(true);
  };

  // React passes on events from an item's popup too (it is drawn in another portal but sits inside the list in the tree):
  // only keys and clicks on the open list itself are the menu's.
  const fromList = (event: { target: EventTarget }) => open && !!panelRef.current?.contains(event.target as Node);

  const onPanelKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!fromList(event)) return;
    const list = menuItems(panelRef.current);
    const index = list.indexOf(document.activeElement as HTMLElement);
    const move = (next: number) => { event.preventDefault(); list[(next + list.length) % list.length]?.focus(); };
    if (event.key === "ArrowDown") move(index + 1);
    else if (event.key === "ArrowUp") move(index - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(list.length - 1);
    else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); }
    // Tab leaves the menu from the button, so the next Tab stop is the one after "Thêm".
    else if (event.key === "Tab") close(true);
  };

  // An item opens its popup in its own click handler; the list then closes and focus goes back to "Thêm", which the popup
  // returns to when it closes.
  const onPanelClick = (event: MouseEvent<HTMLDivElement>) => {
    if (fromList(event) && (event.target as HTMLElement).closest('[role="menuitem"]')) close(true);
  };

  return <>
    <button ref={triggerRef} type="button" className="button button-secondary button-compact row-actions-trigger" aria-haspopup="menu" aria-expanded={open}
      aria-controls={panelId} aria-label={accessibleLabel} onKeyDown={onTriggerKeyDown}
      onClick={() => { focusOnOpen.current = "first"; setOpen((value) => !value); }}
      {...Object.fromEntries(Object.entries(triggerData ?? {}).map(([key, value]) => [`data-${key}`, value]))}>
      {label}<ChevronDown aria-hidden="true" size={15} />
    </button>
    {mounted && createPortal(<div ref={panelRef} id={panelId} className="more-actions-menu row-actions-menu" role="menu" aria-label={accessibleLabel ?? label}
      hidden={!open} onKeyDown={onPanelKeyDown} onClick={onPanelClick}>{children}</div>, document.body)}
  </>;
}

export function RowActionsSeparator() {
  return <div className="row-actions-separator" role="separator" />;
}
