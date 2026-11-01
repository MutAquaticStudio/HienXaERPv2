"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { MoneyInput } from "@/components/ui/money-input";
import { RequestQr } from "@/components/portal/debt-payment";
import { CopyButton } from "@/components/portal/copy-button";
import { formatPortalMoney as money } from "@/modules/portal/money";
import { cancelPaymentRequestAction, confirmCashPaymentAction, createPaymentRequestAction } from "./payment-request-actions";
import { PAYMENT_REQUEST_STATE_LABEL, selectedTotal, vietQrImageUrl, type DebtPaymentOptions, type PaymentRequest } from "./sepay";

export type PaymentRequestRow = { id: string; code: string; method: PaymentRequest["method"]; state: PaymentRequest["state"]; amount_vnd: string;
  received_amount_vnd: string; created_via: string; created_at: string };
export type CashAccount = { id: string; name: string };

const time = (value: string) => new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));

/** The message staff paste into Zalo / SMS: amount, debts, bank, the exact note, and a link to the QR image. */
export function paymentShareText(request: PaymentRequest): string {
  if (request.method === "CASH") {
    return [
      `Hiền Xa xác nhận yêu cầu thanh toán tiền mặt ${request.lines.length} khoản, tổng ${money(request.amount_vnd)}:`,
      ...request.lines.map((line) => `- ${line.label}: ${money(line.amount_vnd)}`),
      `Mã thanh toán: ${request.code} — vui lòng mang theo khi trả tiền tại cửa hàng.`,
    ].join("\n");
  }
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
 * D45 "Xác nhận đã thu": the cash actually received (prefilled with what is still owed on the request) into a cash fund.
 * Less than asked stays owed. One operation id per opening, so pressing again never books twice.
 */
export function CashConfirmDialog({ request, customerId, defaultAmountVnd, accounts, onClose, onDone }: {
  request: { id: string; code: string }; customerId?: string; defaultAmountVnd: string; accounts: readonly CashAccount[]; onClose: () => void; onDone: (message: string) => void;
}) {
  const [amount, setAmount] = useState(defaultAmountVnd);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [operationId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function confirm() {
    setBusy(true); setMessage(null);
    const result = await confirmCashPaymentAction({ requestId: request.id, amountVnd: amount, accountId, operationId, customerId }).catch(() => null);
    setBusy(false);
    if (result?.status === "SUCCESS") { onDone(result.message); return; }
    setMessage(result?.message ?? "Chưa xác định được kết quả. Bấm lại đúng nút này để kiểm tra — hệ thống không ghi trùng.");
  }
  return <Dialog title={`Xác nhận đã thu ${request.code}`} eyebrow="Thu tiền mặt" onClose={onClose}>
    {accounts.length === 0 ? <p className="muted">Chi nhánh chưa có quỹ tiền mặt đang dùng. Tạo quỹ ở Sổ quỹ trước.</p> : <div className="form-grid">
      <div className="field"><label htmlFor={`cash-amount-${request.id}`}>Số tiền thực nhận</label>
        <MoneyInput id={`cash-amount-${request.id}`} value={amount} onValue={setAmount} /></div>
      <div className="field"><label htmlFor={`cash-account-${request.id}`}>Quỹ tiền mặt</label>
        <select id={`cash-account-${request.id}`} value={accountId} onChange={(event) => setAccountId(event.target.value)}>
          {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></div>
      <p className="muted">Trừ các khoản của yêu cầu trước (hạn sớm nhất trước); thu thiếu thì phần còn lại vẫn là công nợ, thu dư thì trừ nợ cũ khác rồi ghi ứng trước.</p>
      {message && <p className="form-message" role="alert">{message}</p>}
      <div className="form-actions"><button type="button" className="button button-primary" disabled={busy || !amount || amount === "0" || !accountId} onClick={() => void confirm()}>
        {busy ? "Đang ghi…" : "Xác nhận đã thu"}</button></div>
    </div>}
  </Dialog>;
}

/** "Xác nhận đã thu" button for one waiting cash request (cash book list, customer page). */
export function CashConfirmButton({ request, customerId, defaultAmountVnd, accounts }: { request: { id: string; code: string }; customerId?: string; defaultAmountVnd: string; accounts: readonly CashAccount[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  return <>
    <button type="button" className="button button-primary button-compact" onClick={() => setOpen(true)}>Xác nhận đã thu</button>
    {done && <span className="sr-only" role="status">{done}</span>}
    {open && <CashConfirmDialog request={request} customerId={customerId} defaultAmountVnd={defaultAmountVnd} accounts={accounts}
      onClose={() => setOpen(false)} onDone={(message) => { setOpen(false); setDone(message); router.refresh(); }} />}
  </>;
}

/**
 * D44/D45 for staff ("Thu nợ" on the customer's Công nợ tab): tick debts, then a QR to send the customer, or take the
 * cash now (a CASH request + "Xác nhận đã thu"). Waiting cash requests can be confirmed from the list below.
 */
export function StaffPaymentRequestPanel({ customerId, options, requests, canPostPayment = false, cashAccounts = [] }: {
  customerId: string; options: DebtPaymentOptions | null; requests: readonly PaymentRequestRow[]; canPostPayment?: boolean; cashAccounts?: readonly CashAccount[];
}) {
  const router = useRouter();
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [created, setCreated] = useState<PaymentRequest | null>(null);
  const [collecting, setCollecting] = useState<PaymentRequest | null>(null);
  const [operation, setOperation] = useState<{ id: string; method: PaymentRequest["method"] } | null>(null);

  if (!options) return <section className="card card-pad"><h2>Thu nợ</h2><p className="muted">Chưa đọc được công nợ của khách. Tải lại trang để thử lại.</p></section>;

  const total = selectedTotal(options, chosen);
  async function create(method: PaymentRequest["method"]) {
    const op = operation?.method === method ? operation.id : crypto.randomUUID();
    setOperation({ id: op, method }); setBusy(true); setMessage(null);
    const result = await createPaymentRequestAction({ customerId, keys: chosen, method, operationId: op }).catch(() => null);
    setBusy(false);
    if (!result) { setMessage("Chưa xác định được kết quả. Bấm lại đúng nút này để kiểm tra."); return; }
    if (result.status === "SUCCESS") {
      setChosen([]); setOperation(null); router.refresh();
      if (method === "CASH") setCollecting(result.request); else setCreated(result.request);
      return;
    }
    if (result.status === "FAILED") setOperation(null);
    setMessage(result.message);
  }
  async function cancel(id: string) {
    const result = await cancelPaymentRequestAction({ requestId: id, operationId: crypto.randomUUID(), customerId }).catch(() => null);
    setMessage(result?.message ?? "Chưa xác định được kết quả. Tải lại trang để kiểm tra.");
    router.refresh();
  }

  return <section className="card list-main" aria-labelledby="staff-qr-title">
    <div className="section-head"><h2 id="staff-qr-title">Thu nợ</h2><span className="scope-chip">{options.qr_enabled ? "QR ngân hàng tự xác nhận · tiền mặt" : "Tiền mặt"}</span></div>
    {options.orders.length === 0 ? <p className="empty-inline">Khách không còn khoản nợ nào.</p> : <>
      <div className="table-wrap"><table>
        <thead><tr><th scope="col"><span className="sr-only">Chọn</span></th><th scope="col">Khoản</th><th scope="col">Đến hạn</th><th scope="col" className="numeric">Còn nợ</th></tr></thead>
        <tbody>{options.orders.map((order) => <tr key={order.key}>
          <td><input type="checkbox" checked={chosen.includes(order.key)} aria-label={`Chọn ${order.label}`}
            onChange={() => { setOperation(null); setChosen((current) => current.includes(order.key) ? current.filter((key) => key !== order.key) : [...current, order.key]); }} /></td>
          <td data-label="Khoản">{order.label}</td>
          <td data-label="Đến hạn">{order.due_date ? new Intl.DateTimeFormat("vi-VN").format(new Date(`${order.due_date}T00:00:00`)) : "—"}</td>
          <td className="numeric mono" data-label="Còn nợ">{money(order.outstanding_amount_vnd)}</td>
        </tr>)}</tbody>
      </table></div>
      <div className="form-actions">
        <span className="muted">{chosen.length ? `Đã chọn ${chosen.length} khoản · ${money(total)}` : "Chọn các khoản khách muốn trả"}</span>
        {options.qr_enabled && <button type="button" className="button button-secondary" disabled={!chosen.length || busy} onClick={() => void create("BANK_QR")}>Tạo QR thu nợ</button>}
        {canPostPayment && <button type="button" className="button button-primary" disabled={!chosen.length || busy} onClick={() => void create("CASH")}>Thu tiền mặt</button>}
        {busy && <span className="muted" role="status">Đang tạo…</span>}
      </div>
      {!options.qr_enabled && <p className="muted">QR chưa dùng được: ở Sổ quỹ, tài khoản ngân hàng cần bật “Hiện cho khách” và “Tự ghi tiền về (SePay)”.</p>}
    </>}
    {message && <p className="form-message" role="status">{message}</p>}
    {requests.length > 0 && <div className="table-wrap"><table>
      <caption className="sr-only">Yêu cầu thanh toán gần đây</caption>
      <thead><tr><th scope="col">Mã</th><th scope="col">Cách trả</th><th scope="col">Tạo lúc</th><th scope="col" className="numeric">Số tiền</th><th scope="col" className="numeric">Đã nhận</th><th scope="col">Trạng thái</th><th scope="col"><span className="sr-only">Thao tác</span></th></tr></thead>
      <tbody>{requests.map((row) => <tr key={row.id}>
        <td className="mono" data-label="Mã">{row.code}</td>
        <td data-label="Cách trả">{row.method === "CASH" ? "Tiền mặt" : "QR chuyển khoản"}</td>
        <td data-label="Tạo lúc">{time(row.created_at)}<small className="table-subline">{row.created_via === "STAFF" ? "Nhân viên tạo" : "Khách tạo"}</small></td>
        <td className="numeric mono" data-label="Số tiền">{money(row.amount_vnd)}</td>
        <td className="numeric mono" data-label="Đã nhận">{money(row.received_amount_vnd)}</td>
        <td data-label="Trạng thái">{PAYMENT_REQUEST_STATE_LABEL[row.state]}</td>
        <td className="table-actions">{(row.state === "OPEN" || row.state === "PARTIAL") && <span className="inline-actions">
          {canPostPayment && row.method === "CASH" && <CashConfirmButton request={row} customerId={customerId} accounts={cashAccounts}
            defaultAmountVnd={(BigInt(row.amount_vnd) > BigInt(row.received_amount_vnd) ? BigInt(row.amount_vnd) - BigInt(row.received_amount_vnd) : BigInt(row.amount_vnd)).toString()} />}
          <button type="button" className="button button-secondary button-compact" onClick={() => void cancel(row.id)}>Hủy</button></span>}</td>
      </tr>)}</tbody>
    </table></div>}
    {created && <Dialog title={`QR thu nợ ${created.code}`} eyebrow="Gửi cho khách" onClose={() => setCreated(null)}>
      <RequestQr request={created} waiting={false} />
      <div className="form-actions"><CopyButton value={paymentShareText(created)} label="Sao chép tin nhắn gửi khách" /></div>
    </Dialog>}
    {collecting && <CashConfirmDialog request={collecting} customerId={customerId} defaultAmountVnd={collecting.amount_vnd} accounts={cashAccounts}
      onClose={() => setCollecting(null)} onDone={(text) => { setCollecting(null); setMessage(text); router.refresh(); }} />}
  </section>;
}
