"use client";

import { FileUp, LoaderCircle } from "lucide-react";
import { useRef, useState } from "react";

import { createClient, type BrowserSupabaseConfig } from "@/lib/supabase/client";

const acceptedTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const extensions: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf",
};
const maxBytes = 25 * 1024 * 1024;

export function CustomerEvidenceUploader({
  config,
  onUploaded,
}: {
  config: BrowserSupabaseConfig | null;
  onUploaded: (path: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [message, setMessage] = useState("CHƯA GỬI — chứng từ chỉ được dùng để đối chiếu thông báo.");

  async function upload() {
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setState("error"); setMessage("GỬI LỖI — hãy chọn ảnh hoặc chứng từ trước."); return;
    }
    if (!config || !navigator.onLine || !acceptedTypes.has(file.type) || file.size > maxBytes) {
      setState("error");
      setMessage(!config ? "GỬI LỖI — chưa cấu hình tải chứng từ an toàn." : !navigator.onLine ? "GỬI LỖI — tệp vẫn ở trên máy, chưa được ghi nhận." : "GỬI LỖI — chỉ nhận JPG, PNG, WEBP hoặc PDF, tối đa 25 MB.");
      return;
    }
    setState("uploading"); setMessage("ĐANG GỬI — đang tải chứng từ riêng tư.");
    try {
      const supabase = createClient(config);
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) throw new Error("AUTHENTICATION_REQUIRED");
      const path = `${data.user.id}/payment-${globalThis.crypto.randomUUID()}.${extensions[file.type]}`;
      const result = await supabase.storage.from("customer-evidence").upload(path, file, {
        contentType: file.type, upsert: false,
      });
      if (result.error) throw result.error;
      onUploaded(path);
      setState("success"); setMessage("ĐÃ GỬI — chứng từ đã tải lên, hãy gửi thông báo thanh toán bên dưới.");
      if (inputRef.current) inputRef.current.value = "";
    } catch {
      setState("error"); setMessage("GỬI LỖI — chưa có chứng từ nào được liên kết vào thông báo.");
    }
  }

  return <section className="customer-evidence-uploader" aria-label="Tải chứng từ thanh toán">
    <label>Chứng từ chuyển khoản<input accept="image/jpeg,image/png,image/webp,application/pdf" ref={inputRef} type="file" /></label>
    <button className="secondary-button" disabled={state === "uploading"} onClick={upload} type="button">
      {state === "uploading" ? <LoaderCircle aria-hidden="true" className="customer-spinner" /> : <FileUp aria-hidden="true" />}
      {state === "uploading" ? "ĐANG GỬI…" : "TẢI CHỨNG TỪ"}
    </button>
    <p aria-live="polite" className={`customer-upload-status ${state}`} role={state === "error" ? "alert" : "status"}>{message}</p>
  </section>;
}
