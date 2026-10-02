"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";

type OperationIds = { create: string; finalize: string };
type PrepareResponse = { evidenceId?: string; objectPath?: string; token?: string; alreadyVerified?: boolean; error?: string };
type FinalizeResponse = { evidenceId?: string; error?: string };

const maxBytes = 10 * 1024 * 1024;

export function PurchaseEvidenceUpload({ purchaseOrderId }: { purchaseOrderId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const operationIds = useRef<OperationIds | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [evidenceId, setEvidenceId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function upload(file: File, ids: OperationIds) {
    setBusy(true);
    setError("");
    try {
      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const checksumSha256 = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
      const response = await fetch("/api/purchasing/evidence/upload", { method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ purchaseOrderId, createOperationId: ids.create, fileName: file.name, byteSize: file.size }) });
      const prepared = await response.json().catch(() => null) as PrepareResponse | null;
      if (!response.ok || !prepared?.evidenceId || !prepared.objectPath || (!prepared.alreadyVerified && !prepared.token)) {
        throw new Error(prepared?.error ?? "Không thể chuẩn bị tải minh chứng.");
      }
      if (operationIds.current?.create !== ids.create) return;
      if (!prepared.alreadyVerified) {
        // A retry may find the same object already uploaded. Finalize verifies its bytes either way.
        await createBrowserSupabase().storage.from("inventory-evidence").uploadToSignedUrl(prepared.objectPath, prepared.token!, file);
      }
      const finalizedResponse = await fetch("/api/purchasing/evidence/upload", { method: "PATCH", credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ purchaseOrderId, createOperationId: ids.create, evidenceId: prepared.evidenceId,
          finalizeOperationId: ids.finalize, byteSize: file.size, checksumSha256 }) });
      const payload = await finalizedResponse.json().catch(() => null) as FinalizeResponse | null;
      if (!finalizedResponse.ok || payload?.evidenceId !== prepared.evidenceId) throw new Error(payload?.error ?? "Không thể xác minh minh chứng.");
      if (operationIds.current?.create !== ids.create) return;
      setEvidenceId(prepared.evidenceId);
      inputRef.current?.setCustomValidity("");
    } catch (reason) {
      if (operationIds.current?.create !== ids.create) return;
      const message = reason instanceof Error ? reason.message : "Không thể tải minh chứng.";
      setEvidenceId("");
      setError(message);
      inputRef.current?.setCustomValidity("Tải lại minh chứng hoặc bỏ chọn tệp trước khi lưu.");
    } finally {
      if (operationIds.current?.create === ids.create) setBusy(false);
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;
    setSelectedFile(file);
    setEvidenceId("");
    setError("");
    if (!file) {
      operationIds.current = null;
      event.currentTarget.setCustomValidity("");
      setBusy(false);
      return;
    }
    event.currentTarget.setCustomValidity("Đang tải minh chứng.");
    const ids = { create: crypto.randomUUID(), finalize: crypto.randomUUID() };
    operationIds.current = ids;
    if (file.size < 1 || file.size > maxBytes) {
      setError("Tệp phải có dữ liệu và không vượt quá 10 MB.");
      setBusy(false);
      return;
    }
    void upload(file, ids);
  }

  return <div className="field">
    <label htmlFor={`purchaseEvidence-${purchaseOrderId}`}>Minh chứng nhận hàng/NCC giao (tùy chọn)</label>
    <input ref={inputRef} id={`purchaseEvidence-${purchaseOrderId}`} type="file" accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf" onChange={onFileChange} />
    <input type="hidden" name="evidenceId" value={evidenceId} />
    <p className="muted" role="status">{busy ? "Đang tải minh chứng..." : evidenceId ? "Đã tải minh chứng; sẽ gắn khi xác nhận nghiệp vụ." : "Chấp nhận PNG, JPEG hoặc PDF tối đa 10 MB."}</p>
    {error && <p role="alert">{error} {selectedFile && selectedFile.size <= maxBytes && <button className="button button-secondary" type="button" disabled={busy} onClick={() => { if (operationIds.current) void upload(selectedFile, operationIds.current); }}>Thử tải lại</button>}</p>}
  </div>;
}
