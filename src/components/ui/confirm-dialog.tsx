"use client";

import { useState, type ReactNode } from "react";
import { Dialog } from "@/components/ui/dialog";

export type ConfirmRequest = { title: string; body: ReactNode; confirmLabel: string; danger?: boolean; run: () => void | Promise<void> };

/**
 * D59: a question before an action that sends, charges or removes something — in the app's own popup (focus kept inside,
 * Esc closes, the safe choice first) instead of the browser's confirm box. `ask(request)` opens it; `dialog` renders it.
 */
export function useConfirm() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const dialog = request && <Dialog title={request.title} onClose={() => { if (!busy) setRequest(null); }} initialFocusId="confirm-cancel">
    <div className="form-stack confirm-body">
      <div>{request.body}</div>
      <div className="form-actions">
        <button id="confirm-cancel" type="button" className="button button-secondary" disabled={busy} onClick={() => setRequest(null)}>Không, quay lại</button>
        <button type="button" className={`button ${request.danger ? "button-danger" : "button-primary"}`} disabled={busy} onClick={async () => {
          setBusy(true);
          try { await request.run(); } finally { setBusy(false); setRequest(null); }
        }}>{busy ? "Đang làm…" : request.confirmLabel}</button>
      </div>
    </div>
  </Dialog>;
  return { ask: setRequest, dialog };
}
