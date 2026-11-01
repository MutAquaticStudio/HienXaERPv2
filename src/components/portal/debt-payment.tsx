"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Dialog } from "@/components/ui/dialog";
import styles from "@/components/portal/portal.module.css";
import { CopyButton } from "@/components/portal/copy-button";
import { debtPaymentOptionsSchema, paymentTarget, vietQrImageUrl, type DebtPaymentOptions, type PaymentRequest } from "@/modules/finance/sepay";
import { createPaymentRequestAction } from "@/modules/finance/payment-request-actions";
import { formatPortalMoney as money } from "@/modules/portal/money";

const POLL_MS = 5_000;
const POLL_LIMIT_MS = 15 * 60_000;

type View =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "settled" }
  | { kind: "ready"; options: DebtPaymentOptions; label: string; amountVnd: string; note: string }
  | { kind: "paid"; paymentNumber: string; amountVnd: string };

/**
 * D42: "Thanh toán" on Công nợ. Opening it asks the database for the amount owed right now and shows a VietQR with that
 * exact amount and the order code + customer code; the window then waits for the bank (SePay) to confirm the money.
 */
export function DebtPayButton({ customerId, targetKey, label, primary = false }: { customerId: string; targetKey: string; label: string; primary?: boolean }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return <>
    <button type="button" className={primary ? styles.payAllButton : styles.payButton} onClick={() => setOpen(true)}>{label}</button>
    {open && <PaymentDialog customerId={customerId} targetKey={targetKey} onClose={() => { setOpen(false); router.refresh(); }} />}
  </>;
}

function PaymentDialog({ customerId, targetKey, onClose }: { customerId: string; targetKey: string; onClose: () => void }) {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [since] = useState(() => new Date(Date.now() - 60_000).toISOString());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/portal/debt-payment?customer=${encodeURIComponent(customerId)}`, { cache: "no-store" });
        const body = await response.json() as { options?: unknown; error?: string };
        if (cancelled) return;
        if (!response.ok) { setView({ kind: "error", message: body.error ?? "Chưa lấy được thông tin thanh toán." }); return; }
        if (body.options === null) { setView({ kind: "error", message: "Cửa hàng chưa bật thanh toán tự xác nhận. Vui lòng chuyển khoản theo thông tin ở trang Công nợ." }); return; }
        const options = debtPaymentOptionsSchema.parse(body.options);
        if (!options.qr_enabled) { setView({ kind: "error", message: "Cửa hàng chưa bật thanh toán tự xác nhận. Vui lòng chuyển khoản theo thông tin ở trang Công nợ." }); return; }
        const target = paymentTarget(options, targetKey);
        setView(target ? { kind: "ready", options, ...target } : { kind: "settled" });
      } catch {
        if (!cancelled) setView({ kind: "error", message: "Chưa lấy được thông tin thanh toán. Kiểm tra kết nối rồi thử lại." });
      }
    })();
    return () => { cancelled = true; };
  }, [customerId, targetKey]);

  const waiting = view.kind === "ready";
  useEffect(() => {
    if (!waiting) return;
    const started = Date.now();
    const timer = window.setInterval(async () => {
      if (Date.now() - started > POLL_LIMIT_MS) { window.clearInterval(timer); return; }
      try {
        const response = await fetch(`/api/portal/debt-payment?customer=${encodeURIComponent(customerId)}&since=${encodeURIComponent(since)}`, { cache: "no-store" });
        if (!response.ok) return;
        const status = await response.json() as { paid?: boolean; payment_number?: string; amount_vnd?: string };
        if (status.paid) { window.clearInterval(timer); setView({ kind: "paid", paymentNumber: status.payment_number ?? "", amountVnd: status.amount_vnd ?? "0" }); }
      } catch {
        // Weak signal: ask again on the next tick.
      }
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [waiting, customerId, since]);

  const title = view.kind === "ready" ? `Thanh toán ${view.label}` : "Thanh toán công nợ";
  return <Dialog title={title} eyebrow="Chuyển khoản bằng mã QR" onClose={onClose}>
    {view.kind === "loading" && <p className={styles.hint} role="status">Đang lấy số tiền cần thanh toán…</p>}
    {view.kind === "error" && <p className={styles.hint} role="alert">{view.message}</p>}
    {view.kind === "settled" && <p className={styles.hint} role="status">Khoản này đã được thanh toán. Đóng cửa sổ để xem công nợ mới nhất.</p>}
    {view.kind === "ready" && <div className={styles.payDialog}>
      {/* eslint-disable-next-line @next/next/no-img-element -- the QR image is generated per payment by vietqr.app */}
      <img className={styles.payQr} src={vietQrImageUrl({ bank: view.options.bank_name ?? "", accountNumber: view.options.account_number ?? "", amountVnd: view.amountVnd,
        note: view.note, holder: view.options.account_holder ?? undefined })} alt={`Mã QR chuyển ${money(view.amountVnd)} vào ${view.options.bank_name}`} width={300} height={300} />
      <p className={styles.hint}>Mở ứng dụng ngân hàng, quét mã. Số tiền và nội dung đã điền sẵn — vui lòng không sửa nội dung để hệ thống tự xác nhận.</p>
      <dl className={styles.payFacts}>
        <div><dt>Số tiền</dt><dd><strong>{money(view.amountVnd)}</strong></dd></div>
        <div><dt>Nội dung</dt><dd><strong className="mono">{view.note}</strong> <CopyButton value={view.note} /></dd></div>
        <div><dt>{view.options.bank_name}</dt><dd><span className="mono">{view.options.account_number}</span> <CopyButton value={view.options.account_number ?? ""} label="Sao chép số TK" /></dd></div>
        <div><dt>Chủ tài khoản</dt><dd>{view.options.account_holder}</dd></div>
      </dl>
      <p className={styles.payWaiting} role="status">Đang chờ tiền về… Cửa sổ tự cập nhật khi ngân hàng xác nhận.</p>
    </div>}
    {view.kind === "paid" && <div className={styles.payDone} role="status">
      <strong>Đã nhận thanh toán {money(view.amountVnd)}</strong>
      <p>Phiếu thu {view.paymentNumber} đã ghi vào sổ, công nợ đã được trừ. Cảm ơn quý khách!</p>
    </div>}
  </Dialog>;
}

export type SelectableDebt = { key: string; label: string; dueLabel: string; dueTone: string; amountVnd: string };

/**
 * D44: the debts as a list the customer can tick; "Thanh toán N khoản đã chọn" makes one payment request (one QR, one
 * transfer note with its code) for exactly those debts. Each row keeps its own "Thanh toán" (D42).
 */
export function DebtSelectList({ customerId, rows, qrEnabled = true }: { customerId: string; rows: readonly SelectableDebt[]; qrEnabled?: boolean }) {
  const [chosen, setChosen] = useState<string[]>([]);
  const [paying, setPaying] = useState<{ keys: string[]; operationId: string; method: "BANK_QR" | "CASH" } | null>(null);
  const router = useRouter();
  const total = rows.filter((row) => chosen.includes(row.key)).reduce((sum, row) => sum + BigInt(row.amountVnd), 0n).toString();
  const toggle = (key: string) => setChosen((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  return <>
    {rows.length > 1 && <div className={styles.selectTools}>
      <button type="button" className={styles.linkButton} onClick={() => setChosen(chosen.length === rows.length ? [] : rows.map((row) => row.key))}>
        {chosen.length === rows.length ? "Bỏ chọn tất cả" : "Chọn tất cả"}</button>
      {rows.some((row) => row.dueTone === "overdue") && <button type="button" className={styles.linkButton}
        onClick={() => setChosen(rows.filter((row) => row.dueTone === "overdue").map((row) => row.key))}>Chọn các khoản quá hạn</button>}
    </div>}
    {rows.map((row) => <article className={styles.billRow} key={row.key}>
      <label className={styles.billPick}>
        <input type="checkbox" checked={chosen.includes(row.key)} onChange={() => toggle(row.key)} aria-label={`Chọn ${row.label}`} />
        <span>{row.label}<small data-tone={row.dueTone}>{row.dueLabel}</small></span>
      </label>
      <span className={styles.billActions}><strong>{money(row.amountVnd)}</strong>
        {qrEnabled && <DebtPayButton customerId={customerId} targetKey={row.key} label="Thanh toán" />}</span>
    </article>)}
    {chosen.length > 0 && <div className={styles.selectBar} role="region" aria-label="Các khoản đã chọn">
      <span>Đã chọn {chosen.length} khoản<strong>{money(total)}</strong></span>
      <span className={styles.selectActions}>
        {qrEnabled && <button type="button" className={styles.payAllButton} onClick={() => setPaying({ keys: chosen, operationId: crypto.randomUUID(), method: "BANK_QR" })}>
          Chuyển khoản {chosen.length} khoản</button>}
        <button type="button" className={qrEnabled ? styles.cashButton : styles.payAllButton} onClick={() => setPaying({ keys: chosen, operationId: crypto.randomUUID(), method: "CASH" })}>
          Trả tiền mặt tại cửa hàng</button>
      </span>
    </div>}
    {paying && <RequestPaymentDialog customerId={customerId} keys={paying.keys} operationId={paying.operationId} method={paying.method}
      onClose={() => { setPaying(null); setChosen([]); router.refresh(); }} />}
  </>;
}

type RequestView =
  | { kind: "loading" }
  | { kind: "error"; message: string; retry: boolean }
  | { kind: "ready"; request: PaymentRequest }
  | { kind: "paid"; paymentNumber: string; amountVnd: string };

function RequestPaymentDialog({ customerId, keys, operationId, method, onClose }: { customerId: string; keys: string[]; operationId: string; method: "BANK_QR" | "CASH"; onClose: () => void }) {
  const [view, setView] = useState<RequestView>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [since] = useState(() => new Date(Date.now() - 60_000).toISOString());

  useEffect(() => {
    let cancelled = false;
    void createPaymentRequestAction({ customerId, keys, operationId, method }).then((result) => {
      if (cancelled) return;
      setView(result.status === "SUCCESS" ? { kind: "ready", request: result.request } : { kind: "error", message: result.message, retry: result.status === "UNKNOWN" });
    }).catch(() => { if (!cancelled) setView({ kind: "error", message: "Chưa tạo được mã thanh toán. Kiểm tra kết nối rồi thử lại.", retry: true }); });
    return () => { cancelled = true; };
  }, [customerId, keys, operationId, method, attempt]);

  const waiting = view.kind === "ready" && view.request.method === "BANK_QR";
  useEffect(() => {
    if (!waiting) return;
    const started = Date.now();
    const timer = window.setInterval(async () => {
      if (Date.now() - started > POLL_LIMIT_MS) { window.clearInterval(timer); return; }
      try {
        const response = await fetch(`/api/portal/debt-payment?customer=${encodeURIComponent(customerId)}&since=${encodeURIComponent(since)}`, { cache: "no-store" });
        if (!response.ok) return;
        const status = await response.json() as { paid?: boolean; payment_number?: string; amount_vnd?: string };
        if (status.paid) { window.clearInterval(timer); setView({ kind: "paid", paymentNumber: status.payment_number ?? "", amountVnd: status.amount_vnd ?? "0" }); }
      } catch {
        // Weak signal: ask again on the next tick.
      }
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [waiting, customerId, since]);

  return <Dialog title={view.kind === "ready" ? `Thanh toán ${view.request.lines.length} khoản` : "Thanh toán các khoản đã chọn"}
    eyebrow={method === "CASH" ? "Trả tiền mặt tại cửa hàng" : "Chuyển khoản bằng mã QR"} onClose={onClose}>
    {view.kind === "loading" && <p className={styles.hint} role="status">Đang tạo mã thanh toán…</p>}
    {view.kind === "error" && <div className={styles.payDialog}><p className={styles.hint} role="alert">{view.message}</p>
      {view.retry && <button type="button" className={styles.payButton} onClick={() => { setView({ kind: "loading" }); setAttempt((value) => value + 1); }}>Thử lại</button>}</div>}
    {view.kind === "ready" && (view.request.method === "CASH" ? <CashRequestCard request={view.request} /> : <RequestQr request={view.request} />)}
    {view.kind === "paid" && <div className={styles.payDone} role="status">
      <strong>Đã nhận thanh toán {money(view.amountVnd)}</strong>
      <p>Phiếu thu {view.paymentNumber} đã ghi vào sổ, công nợ các khoản đã chọn đã được trừ. Cảm ơn quý khách!</p>
    </div>}
  </Dialog>;
}

/** The QR, the exact amount and note of a payment request, and the debts it pays (shared by the portal and staff). */
export function RequestQr({ request, waiting = true }: { request: PaymentRequest; waiting?: boolean }) {
  const bank = request.bank_name ?? "";
  const account = request.account_number ?? "";
  return <div className={styles.payDialog}>
    {/* eslint-disable-next-line @next/next/no-img-element -- the QR image is generated per payment by vietqr.app */}
    <img className={styles.payQr} src={vietQrImageUrl({ bank, accountNumber: account, amountVnd: request.amount_vnd, note: request.note, holder: request.account_holder ?? undefined })}
      alt={`Mã QR chuyển ${money(request.amount_vnd)} vào ${bank}`} width={300} height={300} />
    <p className={styles.hint}>Mở ứng dụng ngân hàng, quét mã. Số tiền và nội dung đã điền sẵn — vui lòng không sửa nội dung để hệ thống tự xác nhận.</p>
    <dl className={styles.payFacts}>
      <div><dt>Số tiền</dt><dd><strong>{money(request.amount_vnd)}</strong></dd></div>
      <div><dt>Nội dung</dt><dd><strong className="mono">{request.note}</strong> <CopyButton value={request.note} /></dd></div>
      <div><dt>{bank}</dt><dd><span className="mono">{account}</span> <CopyButton value={account} label="Sao chép số TK" /></dd></div>
      <div><dt>Chủ tài khoản</dt><dd>{request.account_holder}</dd></div>
    </dl>
    <ul className={styles.requestLines} aria-label="Các khoản trong lần thanh toán này">
      {request.lines.map((line) => <li key={`${line.label}-${line.due_date ?? ""}-${line.amount_vnd}`}><span>{line.label}</span><strong>{money(line.amount_vnd)}</strong></li>)}
    </ul>
    {waiting && <p className={styles.payWaiting} role="status">Đang chờ tiền về… Cửa sổ tự cập nhật khi ngân hàng xác nhận.</p>}
  </div>;
}

/** D45: what the customer brings to the shop — the code and the exact amount; the accountant confirms the cash. */
export function CashRequestCard({ request }: { request: PaymentRequest }) {
  return <div className={styles.payDialog}>
    <p className={styles.cashCode}><small>Mã thanh toán</small><strong className="mono">{request.code}</strong></p>
    <p className={styles.hint}>Vui lòng mang <strong>{money(request.amount_vnd)}</strong> và mã <strong className="mono">{request.code}</strong> tới cửa hàng.
      Công nợ được trừ khi kế toán xác nhận đã nhận tiền; phần trả thiếu vẫn là công nợ.</p>
    <dl className={styles.payFacts}>
      <div><dt>Số tiền</dt><dd><strong>{money(request.amount_vnd)}</strong></dd></div>
      <div><dt>Mã</dt><dd><strong className="mono">{request.code}</strong> <CopyButton value={request.code} /></dd></div>
    </dl>
    <ul className={styles.requestLines} aria-label="Các khoản trong lần thanh toán này">
      {request.lines.map((line) => <li key={`${line.label}-${line.due_date ?? ""}-${line.amount_vnd}`}><span>{line.label}</span><strong>{money(line.amount_vnd)}</strong></li>)}
    </ul>
  </div>;
}
