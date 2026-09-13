"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import styles from "@/components/portal/portal.module.css";

export function ClaimJobButton({ workItemId, version }: { workItemId: string; version: number }) {
  const operationId = useRef<string>("");
  const [status, setStatus] = useState<"idle" | "busy" | "error">("idle");
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function claim() {
    if (!operationId.current) operationId.current = crypto.randomUUID();
    setStatus("busy");
    setMessage("Đang giữ chỗ công việc...");
    try {
      const response = await fetch("/api/portal/work-items/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workItemId, version, operationId: operationId.current }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Không thể nhận việc");
      router.push("/work/jobs/" + workItemId);
      router.refresh();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Không thể nhận việc");
    }
  }

  return (
    <div className={styles.form}>
      <button className={styles.button} disabled={status === "busy"} onClick={claim} type="button">
        {status === "busy" ? "Đang nhận việc" : "Nhận việc này"}
      </button>
      {message ? (
        <p className={styles.status + " " + (status === "error" ? styles.error : "")} role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
