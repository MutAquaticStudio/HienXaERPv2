"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import styles from "@/components/portal/portal.module.css";

export function StartJobButton({ workItemId, version }: { workItemId: string; version: number }) {
  const operationId = useRef("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function start() {
    if (!operationId.current) operationId.current = crypto.randomUUID();
    setBusy(true);
    setMessage("Đang bắt đầu công việc...");
    try {
      const response = await fetch("/api/portal/work-items/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workItemId, version, operationId: operationId.current }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Không thể bắt đầu công việc");
      setMessage("Đã bắt đầu công việc.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể bắt đầu công việc");
      setBusy(false);
    }
  }

  return (
    <div className={styles.form}>
      <button className={styles.button} disabled={busy} onClick={start} type="button">
        {busy ? "Đang bắt đầu" : "Bắt đầu công việc"}
      </button>
      {message ? <p className={styles.status} role="status">{message}</p> : null}
    </div>
  );
}
