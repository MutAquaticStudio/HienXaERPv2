"use client";
import { formatQuantity, isExactEntryQuantity } from "@/lib/core/quantity";
import { userFacingError } from "@/lib/core/errors";
import { reasonOrDefault } from "@/lib/core/reason";
import { FilePicker } from "@/components/ui/file-picker";

import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import styles from "@/components/portal/portal.module.css";
import {
  parseSafeWorkDraft,
  serializeSafeWorkDraft,
  type SafeWorkDraft,
} from "@/modules/portal/draft";
import type { WorkerJob } from "@/modules/portal/types";

/** Kept when a result is sent before "Đã tới nơi" was pressed and no note was written. */
export const MISSING_ARRIVAL_NOTE = "Thợ chưa bấm Đã tới nơi";

export function WorkResultDraftForm({
  workItemId,
  version,
  initialEvidenceId,
  delivery,
  initialReceiverName,
}: {
  workItemId: string;
  version: number;
  initialEvidenceId?: string;
  delivery?: WorkerJob["delivery"];
  initialReceiverName?: string;
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
  const deliveryReady = !delivery || (delivery.can_submit_result === true && !!delivery.assignment_version
    && delivery.lines.every((line) => typeof line.loaded_base_quantity === "string"
      && isExactEntryQuantity(line.loaded_base_quantity, true) && isExactEntryQuantity(line.reportable_base_quantity, true)));
  const sourceChanged = !!draft && (draft.expectedVersion !== version || (!!delivery && !!draft.delivery
    && (draft.delivery.expectedVersion !== delivery.version || draft.delivery.expectedAssignmentVersion !== delivery.assignment_version)));

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const operationId = crypto.randomUUID();
      const raw = localStorage.getItem(key);
      const restored = parseSafeWorkDraft(raw, version, operationId, delivery);
      if (!raw) restored.receiverName = initialReceiverName ?? "";
      setDraft(restored);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [key, version, delivery, initialReceiverName]);

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
      setMessage(uploadError instanceof TypeError || !navigator.onLine
        ? "Mất kết nối. Bản nháp và tệp vẫn được giữ; hãy kết nối lại rồi tải minh chứng lần nữa."
        : uploadError instanceof Error ? userFacingError(uploadError.message) : "Tải minh chứng thất bại");
    } finally {
      setUploading(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || submitting || uploading || !deliveryReady) return;
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
          ...(draft.delivery ? {
            deliveryLines: draft.delivery.lines,
            expectedDeliveryVersion: draft.delivery.expectedVersion,
            expectedAssignmentVersion: draft.delivery.expectedAssignmentVersion,
            // FB7: the note is optional; a delivery still marked "on the way" keeps a plain description.
            missingArrivalReason: delivery?.state === "DISPATCHED" ? reasonOrDefault(draft.delivery.missingArrivalReason, MISSING_ARRIVAL_NOTE) : draft.delivery.missingArrivalReason,
          } : {}),
        }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Gửi kết quả thất bại");
      localStorage.removeItem(key);
      router.push("/work");
      router.refresh();
    } catch (submitError) {
      setError(true);
      if (submitError instanceof Error && ["stale_work_or_delivery_version", "stale_work_version"].includes(submitError.message)) {
        setDraft((current) => current ? { ...current, sourceRejected: true } : current);
      }
      setMessage(submitError instanceof Error ? (submitError.message === "stale_work_or_delivery_version" ? "Công việc hoặc phiếu giao đã thay đổi. Vui lòng tải lại để kiểm tra; bản nháp vẫn được giữ." : userFacingError(submitError.message)) : "Gửi kết quả thất bại");
    } finally {
      setSubmitting(false);
    }
  }

  if (!draft) return <p className={styles.status}>Đang mở bản nháp an toàn...</p>;

  function useCurrentSource() {
    if (!draft?.sourceRejected || !sourceChanged || !deliveryReady) return;
    setDraft({ ...draft, sourceRejected: undefined, operationId: crypto.randomUUID(), expectedVersion: version,
      ...(delivery && draft.delivery ? { delivery: { ...draft.delivery, expectedVersion: delivery.version,
        expectedAssignmentVersion: delivery.assignment_version } } : {}) });
    setError(false);
    setMessage("Đã dùng phiên bản mới. Kiểm tra lượng thực lấy và từng lượng báo giao trước khi gửi.");
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      {delivery && draft.delivery ? delivery.lines.map((line) => <div className={styles.field} key={line.id}>
        <label htmlFor={"actual-" + line.id}>Lượng thực tế · {line.material_name} ({line.unit})</label>
        <span id={"quantity-scope-" + line.id} className={`${styles.hint} ${styles.quantityScope}`}><span>Kế hoạch: {formatQuantity(line.planned_base_quantity)} {line.unit}</span><span>Thực lấy: {line.loaded_base_quantity == null ? "Chưa ghi nhận" : formatQuantity(line.loaded_base_quantity)} {line.unit}</span><span>Còn được phép báo: {line.reportable_base_quantity == null ? "Chưa xác định" : formatQuantity(line.reportable_base_quantity)} {line.unit}</span><span>Nhập 0 nếu không giao được dòng này.</span></span>
        <input id={"actual-" + line.id} aria-describedby={"quantity-scope-" + line.id} inputMode="decimal" type="number" min="0" max={line.reportable_base_quantity}
          step="0.000001" required disabled={submitting || uploading || !deliveryReady}
          value={draft.delivery?.lines.find((item) => item.deliveryLineId === line.id)?.actualQuantity ?? ""}
          onChange={(event) => setDraft((current) => current?.delivery ? { ...current, delivery: { ...current.delivery,
            lines: current.delivery.lines.map((item) => item.deliveryLineId === line.id
              ? { ...item, actualQuantity: event.target.value } : item),
          } } : current)} />
      </div>) : <div className={styles.field}>
        <label htmlFor="actual-quantity">Số lượng thực tế</label>
        <input id="actual-quantity" inputMode="decimal" onChange={update("actualQuantity")} required value={draft.actualQuantity} />
      </div>}
      {delivery?.state === "DISPATCHED" && draft.delivery && <div className={styles.field}>
        <label htmlFor="missing-arrival">Ghi chú bước tới nơi (không bắt buộc)</label>
        <textarea id="missing-arrival" maxLength={1000} value={draft.delivery.missingArrivalReason}
          onChange={(event) => setDraft((current) => current?.delivery ? { ...current,
            delivery: { ...current.delivery, missingArrivalReason: event.target.value } } : current)} />
      </div>}
      <div className={styles.field}>
        <label htmlFor="receiver-name">Người nhận / xác nhận</label>
        <input id="receiver-name" maxLength={120} onChange={update("receiverName")} value={draft.receiverName} />
      </div>
      <div className={styles.field}>
        <label htmlFor="result-note">Ghi chú hiện trường</label>
        <textarea id="result-note" maxLength={1000} minLength={3} onChange={update("note")} value={draft.note} />
        <span className={styles.hint}>Chỉ số lượng, người nhận và ghi chú được lưu cục bộ. Không lưu ảnh, thông tin đăng nhập hoặc số tiền.</span>
      </div>
      <div className={styles.field}>
        <label htmlFor="proof-file">Minh chứng riêng</label>
        <FilePicker accept="image/jpeg,image/png,application/pdf" id="proof-file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        <button className={styles.buttonSecondary} disabled={!file || uploading} onClick={uploadProof} type="button">
          {uploading ? "Đang tải minh chứng" : evidenceId ? "Tải lại minh chứng" : "Tải minh chứng"}
        </button>
      </div>
      {message ? <p className={styles.status + " " + (error ? styles.error : "")} role="status">{message}</p> : null}
      {!deliveryReady && <p className={styles.status}>Chưa có lượng thực lấy hoặc công việc chưa được phép báo giao. Kiểm tra bàn giao với kho/điều phối rồi tải dữ liệu mới.</p>}
      {(error || sourceChanged || !deliveryReady) && <button className={styles.buttonSecondary} type="button" onClick={() => router.refresh()}>Tải dữ liệu mới</button>}
      {draft.sourceRejected && sourceChanged && <button className={styles.buttonSecondary} type="button" disabled={!deliveryReady} onClick={useCurrentSource}>Dùng phiên bản mới đã tải</button>}
      <button className={styles.button} disabled={submitting || uploading || !deliveryReady} type="submit">
        {submitting ? "Đang gửi kết quả" : "Gửi kết quả công việc"}
      </button>
    </form>
  );
}
