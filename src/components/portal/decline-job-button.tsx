"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "@/components/portal/portal.module.css";

/** C2: "Từ chối việc" before the goods are handed over; dispatch gets the job back with the optional note (FB7). */
export function DeclineJobButton({ workItemId, version }: { workItemId: string; version: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");

  async function decline() {
    if (sending) return;
    setSending(true);
    setMessage("Đang gửi...");
    try {
      const response = await fetch("/api/portal/work-items/decline", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ workItemId, version, operationId, reason: reason.trim() }) });
      const body = await response.json() as { error?: string; unknown?: boolean };
      if (!response.ok) {
        if (!body.unknown) setOperationId(crypto.randomUUID());
        setMessage(body.error ?? "Chưa gửi được.");
        return;
      }
      router.push("/work?notice=work-declined");
      router.refresh();
    } catch {
      setMessage("Mất kết nối. Kết nối lại rồi bấm gửi lần nữa; hệ thống không ghi hai lần.");
    } finally {
      setSending(false);
    }
  }

  if (!open) return <button type="button" className={styles.link} onClick={() => setOpen(true)}>Từ chối việc này</button>;
  return <div className={styles.form}>
    <div className={styles.field}><label htmlFor="decline-reason">Ghi chú (không bắt buộc)</label>
      <textarea id="decline-reason" value={reason} maxLength={300} disabled={sending} onChange={(event) => { setReason(event.target.value); setOperationId(crypto.randomUUID()); }} /></div>
    {message && <p className={styles.status} role="status">{message}</p>}
    <button type="button" className={styles.buttonSecondary} disabled={sending} onClick={() => { void decline(); }}>{sending ? "Đang gửi..." : "Gửi từ chối"}</button>
    <button type="button" className={styles.link} disabled={sending} onClick={() => { setOpen(false); setMessage(""); }}>Không từ chối</button>
  </div>;
}
