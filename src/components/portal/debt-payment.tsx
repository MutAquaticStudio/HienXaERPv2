"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Dialog } from "@/components/ui/dialog";
import styles from "@/components/portal/portal.module.css";
import { CopyButton } from "@/components/portal/copy-button";
import { debtPaymentOptionsSchema, paymentTarget, vietQrImageUrl, type DebtPaymentOptions } from "@/modules/finance/sepay";
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
      <img className={styles.payQr} src={vietQrImageUrl({ bank: view.options.bank_name, accountNumber: view.options.account_number, amountVnd: view.amountVnd,
        note: view.note, holder: view.options.account_holder })} alt={`Mã QR chuyển ${money(view.amountVnd)} vào ${view.options.bank_name}`} width={300} height={300} />
      <p className={styles.hint}>Mở ứng dụng ngân hàng, quét mã. Số tiền và nội dung đã điền sẵn — vui lòng không sửa nội dung để hệ thống tự xác nhận.</p>
      <dl className={styles.payFacts}>
        <div><dt>Số tiền</dt><dd><strong>{money(view.amountVnd)}</strong></dd></div>
        <div><dt>Nội dung</dt><dd><strong className="mono">{view.note}</strong> <CopyButton value={view.note} /></dd></div>
        <div><dt>{view.options.bank_name}</dt><dd><span className="mono">{view.options.account_number}</span> <CopyButton value={view.options.account_number} label="Sao chép số TK" /></dd></div>
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
