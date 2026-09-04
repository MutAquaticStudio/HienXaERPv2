"use client";

import { FileUp, LoaderCircle } from "lucide-react";
import { useRef, useState } from "react";

import {
  createClient,
  type BrowserSupabaseConfig,
} from "@/lib/supabase/client";

const acceptedTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
const extensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
const maxBytes = 25 * 1024 * 1024;

export interface UploadedEvidence {
  id: string;
  label: string;
}

type UploadState = "idle" | "uploading" | "success" | "error";

export function WorkerEvidenceUploader({
  config,
  entityId,
  entityType,
  onUploaded,
}: {
  config: BrowserSupabaseConfig | null;
  entityId: string;
  entityType: "DELIVERY" | "SERVICE_JOB";
  onUploaded: (evidence: UploadedEvidence) => void;
}) {
  const [state, setState] = useState<UploadState>("idle");
  const [message, setMessage] = useState("CHƯA GỬI");
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload() {
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setState("error");
      setMessage("GỬI LỖI — hãy chọn ảnh hoặc chứng từ trước.");
      return;
    }
    if (!config) {
      setState("error");
      setMessage("GỬI LỖI — chưa cấu hình kết nối an toàn để tải bằng chứng.");
      return;
    }
    if (!navigator.onLine) {
      setState("error");
      setMessage("GỬI LỖI — tệp vẫn ở trên máy, chưa được ghi nhận trên hệ thống.");
      return;
    }
    if (!acceptedTypes.has(file.type) || file.size > maxBytes) {
      setState("error");
      setMessage("GỬI LỖI — chỉ nhận JPG, PNG, WEBP hoặc PDF, tối đa 25 MB.");
      return;
    }

    setState("uploading");
    setMessage("ĐANG GỬI");
    try {
      const supabase = createClient(config);
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw new Error("AUTHENTICATION_REQUIRED");

      const extension = extensions[file.type];
      const path = `${userData.user.id}/${entityType.toLowerCase()}-${entityId}-${globalThis.crypto.randomUUID()}.${extension}`;
      const uploadResult = await supabase.storage.from("evidence").upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (uploadResult.error) throw uploadResult.error;

      const evidenceResult = await supabase
        .from("evidence")
        .insert({
          owner_user_id: userData.user.id,
          bucket_id: "evidence",
          storage_path: path,
          entity_type: entityType,
          entity_id: entityId,
          content_type: file.type,
          byte_size: file.size,
        })
        .select("id, storage_path")
        .single();
      if (evidenceResult.error || !evidenceResult.data) throw evidenceResult.error ?? new Error("EVIDENCE_CREATE_FAILED");

      onUploaded({ id: evidenceResult.data.id, label: evidenceResult.data.storage_path });
      setState("success");
      setMessage("ĐÃ GỬI — bằng chứng đã được ghi nhận trên hệ thống.");
      if (inputRef.current) inputRef.current.value = "";
    } catch {
      setState("error");
      setMessage("GỬI LỖI — chưa có bằng chứng nào được liên kết vào nghiệp vụ.");
    }
  }

  return (
    <section className="worker-evidence-uploader" aria-label="Tải ảnh hoặc chứng từ">
      <label>
        Ảnh / chứng từ
        <input
          accept="image/jpeg,image/png,image/webp,application/pdf"
          ref={inputRef}
          type="file"
        />
      </label>
      <button
        className="secondary-button worker-evidence-upload"
        disabled={state === "uploading"}
        onClick={upload}
        type="button"
      >
        {state === "uploading" ? <LoaderCircle aria-hidden="true" className="worker-evidence-spinner" /> : <FileUp aria-hidden="true" />}
        {state === "uploading" ? "ĐANG GỬI…" : "TẢI BẰNG CHỨNG"}
      </button>
      <p
        aria-live="polite"
        className={`worker-evidence-status worker-evidence-status-${state}`}
        role={state === "error" ? "alert" : "status"}
      >
        {message}
      </p>
    </section>
  );
}
