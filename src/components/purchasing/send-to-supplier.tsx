"use client";

import { useState } from "react";
import { formatBusinessDateTime } from "@/lib/core/business-time";
import { recordPurchaseOrderSentAction } from "@/modules/purchasing/dispatch-actions";

export type SendablePurchaseOrder = { id: string; number: string; supplierName: string; supplierPhone: string | null; supplierEmail: string | null;
  destinationName: string; destinationAddress: string; expectedAt: string | null; lines: { name: string; quantity: string; unit: string }[];
  contact: string | null; companyName: string | null };

/** The message the supplier receives: what, how much, where and when. */
export function supplierMessage(order: SendablePurchaseOrder) {
  return [
    `Đơn mua ${order.number}${order.companyName ? ` — ${order.companyName}` : ""}`,
    `Gửi: ${order.supplierName}`,
    ...order.lines.map((line) => `• ${line.name}: ${line.quantity} ${line.unit}`),
    `Giao tới: ${order.destinationName} — ${order.destinationAddress}`,
    order.expectedAt ? `Ngày giao: ${formatBusinessDateTime(order.expectedAt)}` : "Ngày giao: theo thỏa thuận",
    ...(order.contact ? [`Liên hệ nhận hàng: ${order.contact}`] : []),
    "Vui lòng xác nhận giúp. Cảm ơn!",
  ].join("\n");
}

/** zalo.me takes the phone number without spaces; Vietnamese 0xxx numbers work as typed. */
export function zaloLink(phone: string | null) {
  const digits = (phone ?? "").replace(/[^\d+]/g, "").replace(/^\+84/, "0");
  return /^0\d{8,10}$/.test(digits) ? `https://zalo.me/${digits}` : null;
}

/**
 * D17 "Gửi NCC qua Zalo": on a phone the share sheet opens with the PDF and the text (pick Zalo → the supplier's chat); on a
 * computer the text is copied, the PDF downloaded and the supplier's Zalo opened. Sending stays with the person; the app only
 * records that it was sent.
 */
export function SendToSupplier({ order, lastSent }: { order: SendablePurchaseOrder; lastSent: { at: string; channel: string } | null }) {
  const [sent, setSent] = useState(lastSent);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const text = supplierMessage(order);
  const zalo = zaloLink(order.supplierPhone);

  async function record(channel: "ZALO" | "EMAIL" | "OTHER") {
    const result = await recordPurchaseOrderSentAction({ purchaseOrderId: order.id, channel, operationId });
    if (result.status === "SUCCESS") { setSent({ at: result.sentAt!, channel }); setOperationId(crypto.randomUUID()); setMessage(null); }
    else setMessage(result.message);
  }

  async function shareZalo() {
    if (busy) return;
    setBusy(true);
    try {
      let file: File | null = null;
      try {
        const response = await fetch(`/api/purchase-orders/${order.id}/pdf`);
        if (response.ok) file = new File([await response.blob()], `${order.number}.pdf`, { type: "application/pdf" });
      } catch { /* The text alone is still worth sending. */ }
      const data: ShareData = file && navigator.canShare?.({ files: [file] }) ? { title: order.number, text, files: [file] } : { title: order.number, text };
      if (typeof navigator.share === "function") {
        try { await navigator.share(data); } catch (error) { if ((error as DOMException)?.name === "AbortError") return; throw error; }
        await record("ZALO");
        return;
      }
      // Computer: copy the text, download the PDF, open the supplier's Zalo.
      await navigator.clipboard?.writeText(text).catch(() => undefined);
      if (file) {
        const url = URL.createObjectURL(file);
        const link = document.createElement("a");
        link.href = url; link.download = file.name; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      }
      if (zalo) window.open(zalo, "_blank", "noopener");
      setMessage("Đã chép nội dung và tải PDF. Dán vào khung chat Zalo của NCC, đính kèm PDF rồi bấm “Đã gửi”.");
    } catch {
      setMessage("Không mở được chia sẻ. Bấm “Chép nội dung” rồi gửi bằng Zalo.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="command-panel send-supplier">
    <strong>Gửi NCC</strong>
    <p className="muted">{sent ? `Đã gửi NCC ${formatBusinessDateTime(sent.at)} · ${sent.channel === "ZALO" ? "Zalo" : sent.channel === "EMAIL" ? "Email" : "Kênh khác"}` : "Chưa gửi NCC."}</p>
    <button type="button" className="button button-primary action-full" disabled={busy} onClick={() => { void shareZalo(); }}>{busy ? "Đang chuẩn bị..." : "Gửi NCC qua Zalo"}</button>
    <div className="inline-actions">
      <button type="button" className="link-button" onClick={() => { void navigator.clipboard?.writeText(text).then(() => setMessage("Đã chép nội dung đơn mua.")).catch(() => setMessage("Không chép được; chọn và chép nội dung bên dưới.")); }}>Chép nội dung</button>
      {order.supplierEmail && <a className="code-link" href={`mailto:${order.supplierEmail}?subject=${encodeURIComponent(`Đơn mua ${order.number}`)}&body=${encodeURIComponent(text)}`}
        onClick={() => { void record("EMAIL"); }}>Gửi email</a>}
      {zalo && <a className="code-link" href={zalo} target="_blank" rel="noopener noreferrer">Mở Zalo NCC</a>}
      <button type="button" className="link-button" onClick={() => { void record("ZALO"); }}>Đã gửi</button>
    </div>
    {!order.supplierPhone && <p className="muted">NCC chưa có số điện thoại; thêm trong danh mục NCC để mở Zalo trực tiếp.</p>}
    <details><summary>Xem nội dung gửi</summary><pre className="send-supplier-text">{text}</pre></details>
    {message && <p className="form-message" role="status">{message}</p>}
  </div>;
}
