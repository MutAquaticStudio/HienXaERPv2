"use client";

import { useEffect, useId, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { QuickCreateFocusGuard } from "@/components/sales/quick-create-focus-guard";

const subscribeNothing = () => () => {};

/**
 * Popup for create/edit forms (UX decision D5). It is rendered into <body>, so its form is never nested in the
 * page form behind it; focus stays inside, Escape or "Đóng" closes it, and on phones it fills the screen.
 * Escape that a control inside already handled (e.g. closing a suggestion list) does not close the popup.
 */
export function Dialog({ title, eyebrow, description, onClose, children, size = "md", initialFocusId }: {
  title: string;
  eyebrow?: string;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  size?: "md" | "lg";
  /** Element to focus when the popup opens, usually the first field. */
  initialFocusId?: string;
}) {
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  const mounted = useSyncExternalStore(subscribeNothing, () => true, () => false);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      onCloseRef.current();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
  useEffect(() => {
    if (mounted && initialFocusId) document.getElementById(initialFocusId)?.focus();
  }, [mounted, initialFocusId]);

  if (!mounted) return null;
  return createPortal(<div className="dialog-backdrop" role="presentation">
    <section className={`dialog-panel dialog-${size} card`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <QuickCreateFocusGuard />
      <header className="dialog-head">
        <div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2 id={titleId}>{title}</h2></div>
        <button className="button button-secondary" type="button" onClick={onClose}>Đóng</button>
      </header>
      {description && <p className="muted dialog-description">{description}</p>}
      {children}
    </section>
  </div>, document.body);
}
