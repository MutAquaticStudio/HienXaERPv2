"use client";

import { useState } from "react";

/**
 * D51 "Gửi qua Zalo" (free): the staff send the prepared text themselves. On a phone the share sheet opens with the text and
 * the PDF (pick Zalo → the customer's chat); on a computer the text is copied, the PDF downloaded and the customer's Zalo
 * chat opened, then the staff paste and press send. The app does not send anything itself.
 */
export function SendToCustomerZalo({ label, text, zaloUrl, pdfUrl, pdfName, phoneHint }: {
  label: string; text: string; zaloUrl: string | null; pdfUrl?: string; pdfName?: string; phoneHint?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function send() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      let file: File | null = null;
      if (pdfUrl) {
        try {
          const response = await fetch(pdfUrl);
          if (response.ok) file = new File([await response.blob()], pdfName ?? "chung-tu.pdf", { type: "application/pdf" });
        } catch { /* The text alone is still worth sending. */ }
      }
      if (typeof navigator.share === "function" && window.matchMedia?.("(pointer: coarse)").matches) {
        const data: ShareData = file && navigator.canShare?.({ files: [file] }) ? { text, files: [file] } : { text };
        try { await navigator.share(data); } catch (error) { if ((error as DOMException)?.name !== "AbortError") throw error; }
        return;
      }
      const copied = await navigator.clipboard?.writeText(text).then(() => true, () => false);
      if (file) {
        const url = URL.createObjectURL(file);
        const link = document.createElement("a");
        link.href = url; link.download = file.name; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      }
      if (zaloUrl) window.open(zaloUrl, "_blank", "noopener");
      setMessage(`${copied ? "Đã chép nội dung" : "Chưa chép được nội dung — chép ở mục “Xem nội dung” bên dưới"}${file ? " và tải PDF" : ""}. ${zaloUrl ? "Dán vào khung chat Zalo của khách vừa mở" : "Mở Zalo của khách, dán nội dung"}${file ? ", đính kèm PDF" : ""} rồi bấm Gửi.`);
    } catch {
      setMessage("Không mở được chia sẻ. Bấm “Chép nội dung” rồi gửi bằng Zalo.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="zalo-send">
    <button type="button" className="button button-secondary action-full" disabled={busy} onClick={() => { void send(); }}>{busy ? "Đang chuẩn bị…" : label}</button>
    <div className="inline-actions">
      <button type="button" className="link-button" onClick={() => { void navigator.clipboard?.writeText(text).then(() => setMessage("Đã chép nội dung.")).catch(() => setMessage("Không chép được; chọn và chép nội dung bên dưới.")); }}>Chép nội dung</button>
      {zaloUrl && <a className="code-link" href={zaloUrl} target="_blank" rel="noopener noreferrer">Mở Zalo khách</a>}
    </div>
    {!zaloUrl && <p className="muted">{phoneHint ?? "Khách chưa có số di động dùng Zalo; thêm số điện thoại ở hồ sơ khách để mở Zalo trực tiếp."}</p>}
    <details><summary>Xem nội dung</summary><pre className="send-supplier-text">{text}</pre></details>
    {message && <p className="form-message" role="status">{message}</p>}
  </div>;
}
