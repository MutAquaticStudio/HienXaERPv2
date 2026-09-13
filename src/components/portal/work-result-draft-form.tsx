"use client";

import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import styles from "@/components/portal/portal.module.css";
import {
  parseSafeWorkDraft,
  serializeSafeWorkDraft,
  type SafeWorkDraft,
} from "@/modules/portal/draft";

export function WorkResultDraftForm({
  workItemId,
  version,
  initialEvidenceId,
}: {
  workItemId: string;
  version: number;
  initialEvidenceId?: string;
}) {
  const key = "hx:work-draft:" + workItemId;
  const [draft, setDraft] = useState<SafeWorkDraft | null>(null);
  const [evidenceId, setEvidenceId] = useState(initialEvidenceId ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const operationId = crypto.randomUUID();
      setDraft(parseSafeWorkDraft(localStorage.getItem(key), version, operationId));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [key, version]);

  useEffect(() => {
    if (draft) localStorage.setItem(key, serializeSafeWorkDraft(draft));
  }, [draft, key]);

  function update(field: "actualQuantity" | "receiverName" | "note") {
    return (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setDraft((current) => current ? { ...current, [field]: event.target.value } : current);
    };
  }

  async function uploadProof() {
    if (!draft || !file) return;
    setUploading(true);
    setError(false);
    setMessage("Đang tải minh chứng. Bản nháp kết quả vẫn được giữ riêng.");
    const formData = new FormData();
    formData.set("file", file);
    formData.set("context", "WORK_RESULT");
    formData.set("workItemId", workItemId);
    formData.set("operationId", draft.operationId);
    try {
      const response = await fetch("/api/portal/evidence/upload", { method: "POST", body: formData });
      const body = await response.json() as { evidenceId?: string; error?: string };
      if (!response.ok || !body.evidenceId) throw new Error(body.error ?? "Tải minh chứng thất bại");
      setEvidenceId(body.evidenceId);
      setMessage("Minh chứng đã tải xong. Bạn có thể gửi kết quả độc lập.");
    } catch (uploadError) {
      setError(true);
      setMessage(uploadError instanceof Error ? uploadError.message : "Tải minh chứng thất bại");
    } finally {
      setUploading(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    setSubmitting(true);
    setError(false);
    setMessage("Đang gửi đúng phiên bản công việc...");
    try {
      const response = await fetch("/api/portal/work-results", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workItemId,
          actualQuantity: draft.actualQuantity,
          receiverName: draft.receiverName,
          note: draft.note,
          evidenceId: evidenceId || null,
          expectedVersion: draft.expectedVersion,
          operationId: draft.operationId,
        }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Gửi kết quả thất bại");
      localStorage.removeItem(key);
      router.push("/work");
      router.refresh();
    } catch (submitError) {
      setError(true);
      setMessage(submitError instanceof Error ? submitError.message : "Gửi kết quả thất bại");
    } finally {
      setSubmitting(false);
    }
  }

  if (!draft) return <p className={styles.status}>Đang mở bản nháp an toàn...</p>;

  return (
    <form className={styles.form} onSubmit={submit}>
      <div className={styles.field}>
        <label htmlFor="actual-quantity">Số lượng thực tế</label>
        <input id="actual-quantity" inputMode="decimal" onChange={update("actualQuantity")} required value={draft.actualQuantity} />
      </div>
      <div className={styles.field}>
        <label htmlFor="receiver-name">Người nhận / xác nhận</label>
        <input id="receiver-name" maxLength={120} onChange={update("receiverName")} value={draft.receiverName} />
      </div>
      <div className={styles.field}>
        <label htmlFor="result-note">Ghi chú hiện trường</label>
        <textarea id="result-note" maxLength={1000} minLength={3} onChange={update("note")} value={draft.note} />
        <span className={styles.hint}>Chỉ số lượng, người nhận và ghi chú được lưu cục bộ. Không lưu ảnh, token hay dữ liệu tiền.</span>
      </div>
      <div className={styles.field}>
        <label htmlFor="proof-file">Minh chứng riêng</label>
        <input accept="image/jpeg,image/png,application/pdf" id="proof-file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} type="file" />
        <button className={styles.buttonSecondary} disabled={!file || uploading} onClick={uploadProof} type="button">
          {uploading ? "Đang tải minh chứng" : evidenceId ? "Tải lại minh chứng" : "Tải minh chứng"}
        </button>
      </div>
      {message ? <p className={styles.status + " " + (error ? styles.error : "")} role="status">{message}</p> : null}
      <button className={styles.button} disabled={submitting || uploading} type="submit">
        {submitting ? "Đang gửi kết quả" : "Gửi kết quả công việc"}
      </button>
    </form>
  );
}
