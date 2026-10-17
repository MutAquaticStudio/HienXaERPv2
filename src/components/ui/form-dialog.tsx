"use client";

import { useState, type ReactNode } from "react";
import { Dialog } from "@/components/ui/dialog";

/**
 * A button that opens an existing form in a popup (UX decision D5). The form itself is rendered by the server page and
 * passed as children, so its server action, operation id and recovery behaviour are unchanged.
 */
export function FormDialog({ label, title, eyebrow, description, defaultOpen = false, buttonClassName = "button button-secondary", size = "md", children }: {
  label: string;
  title: string;
  eyebrow?: string;
  description?: ReactNode;
  /** Open on arrival, e.g. when the page was reached through "Ghi thu" for one customer. */
  defaultOpen?: boolean;
  buttonClassName?: string;
  size?: "md" | "lg";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return <>
    <button type="button" className={buttonClassName} onClick={() => setOpen(true)}>{label}</button>
    {open && <Dialog title={title} eyebrow={eyebrow} description={description} size={size} onClose={() => setOpen(false)}>{children}</Dialog>}
  </>;
}
