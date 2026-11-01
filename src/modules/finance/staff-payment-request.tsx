"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { RequestQr } from "@/components/portal/debt-payment";
import { CopyButton } from "@/components/portal/copy-button";
import { formatPortalMoney as money } from "@/modules/portal/money";
import { cancelPaymentRequestAction, createPaymentRequestAction } from "./payment-request-actions";
import { PAYMENT_REQUEST_STATE_LABEL, selectedTotal, vietQrImageUrl, type DebtPaymentOptions, type PaymentRequest } from "./sepay";

export type PaymentRequestRow = { id: string; code: string; state: PaymentRequest["state"]; amount_vnd: string; received_amount_vnd: string; created_via: string; created_at: string };

const time = (value: string) => new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));

/** The message staff paste into Zalo / SMS: amount, debts, bank, the exact note, and a link to the QR image. */
export function paymentShareText(request: PaymentRequest): string {
  const qr = vietQrImageUrl({ bank: request.bank_name ?? "", accountNumber: request.account_number ?? "", amountVnd: request.amount_vnd, note: request.note, holder: request.account_holder ?? undefined });
  return [
    `Hiền Xa gửi quý khách yêu cầu thanh toán ${request.lines.length} khoản, tổng ${money(request.amount_vnd)}:`,
    ...request.lines.map((line) => `- ${line.label}: ${money(line.amount_vnd)}`),
    `Chuyển khoản: ${request.bank_name ?? ""} ${request.account_number ?? ""} (${request.account_holder ?? ""})`,
    `Nội dung (giữ nguyên để hệ thống tự xác nhận): ${request.note}`,
    `Mã QR: ${qr}`,
  ].join("\n");
}

/**
 * D44 for staff ("Thu nợ bằng QR" on the customer's Công nợ tab): tick debts, make one payment request, copy the QR /
 * message to send the customer. The bank (SePay) confirms the money exactly as for a request made in the portal.
 */
export function StaffPaymentRequestPanel({ customerId, options, requests }: { customerId: string; options: DebtPaymentOptions | null; requests: readonly PaymentRequestRow[] }) {
  const router = useRouter();
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [created, setCreated] = useState<PaymentRequest | null>(null);
  const [operationId, setOperationId] = useState<string | null>(null);

  if (!options) return <section className="card card-pad"><h2>Thu nợ bằng QR</h2>
    <p className="muted">Chưa dùng được: ở Sổ quỹ, tài khoản ngân hàng cần bật “Hiện cho khách” và “Tự ghi tiền về (SePay)”.</p></section>;

  const total = selectedTotal(options, chosen);
  async function create() {
    const op = operationId ?? crypto.randomUUID();
    setOperationId(op); setBusy(true); setMessage(null);
    const result = await createPaymentRequestAction({ customerId, keys: chosen, operationId: op }).catch(() => null);
    setBusy(false);
    if (!result) { setMessage("Chưa xác định được kết quả. Bấm lại đúng nút này để kiểm tra."); return; }
    if (result.status === "SUCCESS") { setCreated(result.request); setChosen([]); setOperationId(null); router.refresh(); return; }
    if (result.status === "FAILED") setOperationId(null);
    setMessage(result.message);
  }
  async function cancel(id: string) {
    const result = await cancelPaymentRequestAction({ requestId: id, operationId: crypto.randomUUID(), customerId }).catch(() => null);
    setMessage(result?.message ?? "Chưa xác định được kết quả. Tải lại trang để kiểm tra.");
    router.refresh();
  }

  return <section className="card list-main" aria-labelledby="staff-qr-title">
    <div className="section-head"><h2 id="staff-qr-title">Thu nợ bằng QR</h2><span className="scope-chip">Ngân hàng tự xác nhận</span></div>
    {options.orders.length === 0 ? <p className="empty-inline">Khách không còn khoản nợ nào.</p> : <>
      <div className="table-wrap"><table>
        <thead><tr><th scope="col"><span className="sr-only">Chọn</span></th><th scope="col">Khoản</th><th scope="col">Đến hạn</th><th scope="col" className="numeric">Còn nợ</th></tr></thead>
        <tbody>{options.orders.map((order) => <tr key={order.key}>
          <td><input type="checkbox" checked={chosen.includes(order.key)} aria-label={`Chọn ${order.label}`}
            onChange={() => { setOperationId(null); setChosen((current) => current.includes(order.key) ? current.filter((key) => key !== order.key) : [...current, order.key]); }} /></td>
          <td data-label="Khoản">{order.label}</td>
          <td data-label="Đến hạn">{order.due_date ? new Intl.DateTimeFormat("vi-VN").format(new Date(`${order.due_date}T00:00:00`)) : "—"}</td>
          <td className="numeric mono" data-label="Còn nợ">{money(order.outstanding_amount_vnd)}</td>
        </tr>)}</tbody>
      </table></div>
      <div className="form-actions">
        <span className="muted">{chosen.length ? `Đã chọn ${chosen.length} khoản · ${money(total)}` : "Chọn các khoản khách muốn trả"}</span>
        <button type="button" className="button button-primary" disabled={!chosen.length || busy} onClick={() => void create()}>{busy ? "Đang tạo…" : "Tạo QR thu nợ"}</button>
      </div>
    </>}
    {message && <p className="form-message" role="status">{message}</p>}
    {requests.length > 0 && <div className="table-wrap"><table>
      <caption className="sr-only">Yêu cầu thanh toán gần đây</caption>
      <thead><tr><th scope="col">Mã</th><th scope="col">Tạo lúc</th><th scope="col" className="numeric">Số tiền</th><th scope="col" className="numeric">Đã nhận</th><th scope="col">Trạng thái</th><th scope="col"><span className="sr-only">Thao tác</span></th></tr></thead>
      <tbody>{requests.map((row) => <tr key={row.id}>
        <td className="mono" data-label="Mã">{row.code}</td>
        <td data-label="Tạo lúc">{time(row.created_at)}<small className="table-subline">{row.created_via === "STAFF" ? "Nhân viên tạo" : "Khách tạo"}</small></td>
        <td className="numeric mono" data-label="Số tiền">{money(row.amount_vnd)}</td>
        <td className="numeric mono" data-label="Đã nhận">{money(row.received_amount_vnd)}</td>
        <td data-label="Trạng thái">{PAYMENT_REQUEST_STATE_LABEL[row.state]}</td>
        <td className="table-actions">{(row.state === "OPEN" || row.state === "PARTIAL") &&
          <button type="button" className="button button-secondary button-compact" onClick={() => void cancel(row.id)}>Hủy</button>}</td>
      </tr>)}</tbody>
    </table></div>}
    {created && <Dialog title={`QR thu nợ ${created.code}`} eyebrow="Gửi cho khách" onClose={() => setCreated(null)}>
      <RequestQr request={created} waiting={false} />
      <div className="form-actions"><CopyButton value={paymentShareText(created)} label="Sao chép tin nhắn gửi khách" /></div>
    </Dialog>}
  </section>;
}
