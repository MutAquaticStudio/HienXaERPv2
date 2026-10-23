"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { Dialog } from "@/components/ui/dialog";

const CloseDialog = createContext<(() => void) | null>(null);
/** Lets a form inside a FormDialog close it, e.g. after it saved (FB10). Null outside a dialog. */
export function useCloseFormDialog() { return useContext(CloseDialog); }

/**
 * A button that opens an existing form in a popup (UX decision D5). The form itself is rendered by the server page and
 * passed as children, so its server action, operation id and recovery behaviour are unchanged.
 */
export function FormDialog({ label, title, eyebrow, description, defaultOpen = false, buttonClassName = "button button-secondary", size = "md", triggerData, children }: {
  label: string;
  title: string;
  eyebrow?: string;
  description?: ReactNode;
  /** Open on arrival, e.g. when the page was reached through "Ghi thu" for one customer. */
  defaultOpen?: boolean;
  buttonClassName?: string;
  size?: "md" | "lg";
  /** data-* attributes on the button, e.g. the record it acts on, for scripted checks. */
  triggerData?: Record<string, string>;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return <>
    <button type="button" className={buttonClassName} onClick={() => setOpen(true)} {...Object.fromEntries(Object.entries(triggerData ?? {}).map(([key, value]) => [`data-${key}`, value]))}>{label}</button>
    {open && <Dialog title={title} eyebrow={eyebrow} description={description} size={size} onClose={() => setOpen(false)}><CloseDialog.Provider value={() => setOpen(false)}>{children}</CloseDialog.Provider></Dialog>}
  </>;
}
