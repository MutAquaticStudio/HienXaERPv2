"use client";

import { createContext, useContext, useId, useState, type ReactNode } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Dialog } from "@astryxdesign/core/Dialog";
import { DialogHeader } from "@astryxdesign/core/Dialog";
import "./sales-ax.css";

const CloseAxDialog = createContext<(() => void) | null>(null);
/** Cho form bên trong hộp thoại tự đóng hộp thoại (ví dụ sau khi lưu). Null nếu không nằm trong hộp thoại. */
export function useCloseAxDialog() { return useContext(CloseAxDialog); }

type Kind = "primary" | "secondary" | "commerce" | "danger" | "ghost";
const KIND: Record<Kind, string> = { primary: " p", secondary: "", commerce: " g", danger: " d", ghost: " ghost" };

/**
 * Nút mở hộp thoại Astryx (Dialog). Nội dung (form đã có action, operationId, expectedVersion) do trang dựng sẵn và truyền vào làm con,
 * nên server action và cách khôi phục lỗi không đổi so với bản Classic.
 */
export function AxDialogButton({ label, title, subtitle, kind = "secondary", small, width = 520, defaultOpen = false, purpose = "form", wide, children }: {
  label: string; title: string; subtitle?: ReactNode; kind?: Kind; small?: boolean; width?: number; defaultOpen?: boolean; purpose?: "form" | "info"; wide?: boolean; children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const close = () => setOpen(false);
  const titleId = useId();
  return <>
    <button type="button" className={`hx-btn${KIND[kind]}${small ? " sm" : ""}`} style={wide ? { width: "100%" } : undefined} aria-haspopup="dialog" onClick={() => setOpen(true)}>{label}</button>
    <Dialog isOpen={open} onOpenChange={setOpen} width={width} purpose={purpose} aria-labelledby={titleId}>
      <DialogHeader title={title} subtitle={subtitle} onOpenChange={setOpen} />
      <div className="sx-dlg-body"><CloseAxDialog.Provider value={close}>{children}</CloseAxDialog.Provider></div>
    </Dialog>
  </>;
}

/** Nút Astryx đóng hộp thoại ("Quay lại", "Không hủy"). */
export function AxDialogClose({ label = "Đóng" }: { label?: string }) {
  const close = useCloseAxDialog();
  return <Button type="button" variant="secondary" label={label} onClick={() => close?.()} />;
}
