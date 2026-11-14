"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import styles from "@/components/portal/portal.module.css";
import { cancelServiceRequestAction } from "@/modules/portal/service-actions";

/**
 * "Hủy yêu cầu" (D75): asks once, with an optional reason, and only while the store has not scheduled the request. When the
 * store was faster, the reason is said plainly and the page reloads to the new state. A result that is not known (lost connection)
 * is retried with the same operation, so the request is never cancelled twice.
 */
export function CancelServiceRequestButton({ requestId }: { requestId: string }) {
  const router = useRouter();
  const operationId = useRef<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function cancel() {
    if (busy) return;
    operationId.current ??= crypto.randomUUID();
    setBusy(true);
    setMessage(null);
    try {
      const outcome = await cancelServiceRequestAction({ requestId, reason, operationId: operationId.current });
      if (outcome.status !== "UNKNOWN") operationId.current = null;
      if (outcome.status === "SUCCESS") { router.refresh(); return; }
      setMessage(outcome.message);
      // The store may have scheduled it in the meantime: show the new state.
      if (outcome.status === "FAILED") { setAsking(false); router.refresh(); }
    } catch {
      setMessage("Chưa rõ yêu cầu đã hủy chưa (mất kết nối). Bấm “Hủy yêu cầu” lần nữa — hệ thống không hủy hai lần.");
    } finally {
      setBusy(false);
    }
  }

  return <div className={styles.svcCancel}>
    {!asking && <button type="button" className={styles.svcDanger} onClick={() => { setAsking(true); setMessage(null); }}>Hủy yêu cầu</button>}
    {asking && <div className={styles.card} role="group" aria-label="Xác nhận hủy yêu cầu">
      <p><strong>Hủy yêu cầu này?</strong> Bạn có thể đặt lại sau.</p>
      <div className={styles.field}><label htmlFor="svc-cancel-reason">Lý do (không bắt buộc)</label>
        <textarea id="svc-cancel-reason" rows={2} maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} /></div>
      <div className={styles.actions}>
        <button type="button" className={styles.buttonDanger} disabled={busy} onClick={() => { void cancel(); }}>{busy ? "Đang hủy..." : "Hủy yêu cầu"}</button>
        <button type="button" className={styles.buttonSecondary} disabled={busy} onClick={() => setAsking(false)}>Giữ yêu cầu</button>
      </div>
    </div>}
    {message && <p className={styles.status} role="status">{message}</p>}
  </div>;
}
