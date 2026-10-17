"use client";

import { ReliableCommandForm } from "@/components/reliable-command-form";
import { useState } from "react";
import { allocateExistingPaymentAction } from "@/modules/finance/actions";
import { formatVnd, vnd } from "@/lib/core/money";
import type { PaymentTarget } from "@/modules/finance/payment-form";
import { MoneyInput } from "@/components/ui/money-input";

export type ExistingPayment = { id: string; payment_number: string; available_amount_vnd: string; advance_remaining_vnd: string };

function amount(value: string) { return /^\d+$/.test(value) ? BigInt(value) : 0n; }

export function ExistingPaymentAllocationForm({ direction, partyId, payments, obligations, redirectTo, operationId, hasMore, actorScope }: {
  direction: "RECEIPT" | "DISBURSEMENT"; partyId: string; payments: ExistingPayment[];
  obligations: PaymentTarget[]; redirectTo: string; operationId: string; hasMore: boolean; actorScope: string;
}) {
  const [paymentId, setPaymentId] = useState(payments[0]?.id ?? "");
  const [values, setValues] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState(obligations);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(hasMore);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  async function load(targetPage: number) {
    setBusy(true); setLoadError("");
    try {
      const params = new URLSearchParams({ side: direction === "RECEIPT" ? "AR" : "AP", party: partyId, page: String(targetPage), q: search });
      const response = await fetch(`/api/finance/obligations?${params}`);
      if (!response.ok) throw new Error("obligations");
      const result = await response.json() as { rows: PaymentTarget[]; hasNext: boolean };
      setVisible(result.rows); setHasNext(result.hasNext); setPage(targetPage);
    } catch { setLoadError("Không thể tải các khoản công nợ. Vui lòng thử lại."); }
    finally { setBusy(false); }
  }
  const payment = payments.find(item => item.id === paymentId);
  const allocations = Object.entries(values).filter(([, value]) => amount(value) > 0n)
    .map(([id, value]) => ({ obligation_id: id, amount_vnd: value }));
  const total = allocations.reduce((sum, item) => sum + amount(item.amount_vnd), 0n);
  const invalid = Object.values(values).some(value => value.trim() && (!/^\d+$/.test(value) || value.length > 19 || amount(value) > 9223372036854775807n));
  if (!payments.length) return null;
  return <ReliableCommandForm className="card card-pad payment-editor" action={allocateExistingPaymentAction}
    command="allocate_payment" operationId={operationId} scope={`${actorScope}:${direction}:${partyId}`}
    onRestore={entries => { const fields = Object.fromEntries(entries); setPaymentId(fields.paymentId ?? "");
      try { const restored = JSON.parse(fields.allocationsJson ?? "[]") as Array<{ obligation_id: string; amount_vnd: string }>;
        setValues(Object.fromEntries(restored.map(row => [row.obligation_id, row.amount_vnd]))); } catch { setValues({}); } }}
    onNew={() => setValues({})}>
    <h2>{direction === "RECEIPT" ? "Phân bổ phiếu thu đã có" : "Phân bổ phiếu chi đã có"}</h2>
    <p className="muted">Chọn tiền đã ghi nhận, gồm tiền ứng trước, để thanh toán công nợ. Thao tác này không ghi thu/chi lần nữa.</p>
    <input type="hidden" name="direction" value={direction} /><input type="hidden" name="partyId" value={partyId} />
    <input type="hidden" name="redirectTo" value={redirectTo} />
    <input type="hidden" name="allocationsJson" value={JSON.stringify(allocations)} />
    <div className="field"><label htmlFor={"existing-payment-" + direction}>Phiếu {direction === "RECEIPT" ? "thu" : "chi"} còn tiền</label>
      <select id={"existing-payment-" + direction} name="paymentId" value={paymentId} onChange={event => setPaymentId(event.target.value)} required>
        {payments.map(item => <option key={item.id} value={item.id}>{item.payment_number} · còn {formatVnd(vnd(item.available_amount_vnd))}</option>)}
      </select></div>
    {payment && <p>Tiền ứng trước chưa phân bổ: <strong>{formatVnd(vnd(payment.advance_remaining_vnd))}</strong></p>}
    <div className="filter-bar"><label>Tìm khoản để phân bổ tiền đã có<input value={search} onChange={event => setSearch(event.target.value)} maxLength={80} /></label><button className="button button-secondary" type="button" disabled={busy} onClick={() => void load(1)}>Tìm khoản</button></div>
    <div className="allocation-editor">{visible.map(item => <label className="allocation-row" key={item.id}>
      <span><strong>{item.sourceLabel}</strong><small>Còn {formatVnd(vnd(item.outstandingAmountVnd))}</small></span>
      <MoneyInput aria-label={`Phân bổ tiền đã có cho ${item.sourceLabel}`} value={values[item.id] ?? ""}
        onValue={value => setValues(current => ({ ...current, [item.id]: value }))} placeholder="0" />
    </label>)}</div>
    {!visible.length && <p className="empty-inline">Chưa có khoản nợ phù hợp để phân bổ; phiếu tiền đã nhận vẫn được giữ.</p>}
    {loadError && <p className="form-message" role="alert">{loadError}</p>}
    {invalid && <p className="form-message" role="alert">Tiền phân bổ phải là số VND nguyên không âm hợp lệ.</p>}
    <div className="action-cluster"><span>Trang {page}</span>{page > 1 && <button className="button button-secondary" type="button" disabled={busy} onClick={() => void load(page - 1)}>Trước</button>}{hasNext && <button className="button button-secondary" type="button" disabled={busy} onClick={() => void load(page + 1)}>Tiếp</button>}</div>
    <p>Đã chọn: <strong>{formatVnd(vnd(total.toString()))}</strong></p>
    <button className="button button-secondary action-full" type="submit"
      disabled={invalid || allocations.length > 50 || !payment || total <= 0n || total > amount(payment.available_amount_vnd)}>Phân bổ tiền đã có</button>
  </ReliableCommandForm>;
}
