"use client";

import { useEffect, useRef } from "react";

export function QuickCreateFocusGuard() {
  const markerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const dialog = markerRef.current?.closest<HTMLElement>('[role="dialog"]');
    if (!dialog) return;

    const returnFocusTarget = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousTabIndex = dialog.getAttribute("tabindex");
    const previousOverflow = document.body.style.overflow;
    const background: Array<{ element: HTMLElement; inert: boolean }> = [];
    dialog.setAttribute("tabindex", "-1");
    document.body.style.overflow = "hidden";

    // Keep the dialog's ancestor path active, not its surrounding form or shell.
    let current: Element = dialog;
    while (current.parentElement && current.parentElement !== document.documentElement) {
      const parent = current.parentElement;
      for (const sibling of Array.from(parent.children)) {
        if (sibling !== current && sibling instanceof HTMLElement && !["SCRIPT", "STYLE", "LINK"].includes(sibling.tagName)) {
          background.push({ element: sibling, inert: sibling.inert });
          sibling.inert = true;
        }
      }
      current = parent;
    }

    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'a[href], button, input, select, textarea, [tabindex]',
    )).filter((element) =>
      element.tabIndex >= 0 &&
      !element.matches(':disabled, [aria-disabled="true"]') &&
      !element.closest("[hidden], [inert]") &&
      element.getClientRects().length > 0 &&
      getComputedStyle(element).visibility !== "hidden",
    );

    const focusInside = () => {
      const first = focusable()[0];
      if (first) first.focus();
      else dialog.focus();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const controls = focusable();
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first || !last) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const active = document.activeElement;
      if (!active || !dialog.contains(active) || active === dialog) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (event.target instanceof Node && !dialog.contains(event.target)) focusInside();
    };

    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("focusin", handleFocusIn);
    if (!dialog.contains(document.activeElement)) focusInside();

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("focusin", handleFocusIn);
      for (const saved of background.reverse()) saved.element.inert = saved.inert;
      document.body.style.overflow = previousOverflow;
      if (previousTabIndex === null) dialog.removeAttribute("tabindex");
      else dialog.setAttribute("tabindex", previousTabIndex);
      if (returnFocusTarget?.isConnected && !returnFocusTarget.closest("[inert]")) {
        returnFocusTarget.focus({ preventScroll: true });
      }
    };
  }, []);

  return <span ref={markerRef} hidden aria-hidden="true" />;
}
