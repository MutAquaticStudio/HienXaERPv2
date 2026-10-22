"use client";

import { useState } from "react";
import { ReliableCommandForm, CommandRecoveryNotice } from "@/components/reliable-command-form";
import { approveReturnCreditAction, refundCustomerCreditAction, offsetCustomerCreditAction } from "./credit-actions";
import type { PaymentTarget } from "./payment-form";
import { formatVnd, vnd } from "@/lib/core/money";
import { MoneyInput } from "@/components/ui/money-input";

export type ReturnFinanceRow = { id: string; delivery_number: string; order_number: string; material_name_snapshot: string;
  base_quantity: string; maximum_credit_vnd: string; legacy_adjustment_exists: boolean; legacy_credit_amount_vnd?: string | null };
export type CustomerCreditRow = { id: string; return_case_id: string; delivery_number: string; order_number: string;
  approved_credit_vnd: string; amount_vnd: string; remaining_vnd: string; refunded_vnd: string; offset_vnd: string };
type Account = { id: string; code: string; name: string };

function OffsetForm({ credit, customerId, targets, targetsHasNext, actorScope, operationId }: {
  credit: CustomerCreditRow; customerId: string; targets: PaymentTarget[]; targetsHasNext: boolean; actorScope: string; operationId: string;
}) {
  const [rows, setRows] = useState(targets), [query, setQuery] = useState(""), [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(targetsHasNext), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [selected, setSelected] = useState(""), [amount, setAmount] = useState("");
  async function load(targetPage: number) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/finance/obligations?" + new URLSearchParams({ side: "AR", party: customerId, page: String(targetPage), q: query }));
      if (!response.ok) throw new Error("query");
      const data = await response.json() as { rows: PaymentTarget[]; hasNext: boolean };
      setRows(data.rows); setHasNext(data.hasNext); setPage(targetPage);
    } catch { setError("Chưa tải được công nợ. Giữ lựa chọn và thử tìm lại."); }
    finally { setBusy(false); }
  }
  return <ReliableCommandForm command="offset_customer_credit" scope={`${actorScope}:${credit.id}`} operationId={operationId}
    action={offsetCustomerCreditAction} className="command-panel" onNew={() => { setSelected(""); setAmount(""); }}
    onRestore={entries => { const fields = Object.fromEntries(entries); setSelected(fields.obligationId ?? ""); setAmount(fields.amount ?? ""); }}>
    <h3>Cấn trừ vào công nợ cùng khách</h3><input type="hidden" name="creditId" value={credit.id} />
    <div className="field"><label htmlFor={"credit-search-" + credit.id}>Tìm khoản cấn trừ</label><input id={"credit-search-" + credit.id} value={query} onChange={event => setQuery(event.target.value)} maxLength={80} /></div>
    <button className="button button-secondary" type="button" disabled={busy} onClick={() => void load(1)}>Tìm công nợ cấn trừ</button>
    <div className="field"><label htmlFor={"credit-target-" + credit.id}>Khoản nợ để cấn trừ</label>
      <select id={"credit-target-" + credit.id} name="obligationId" value={selected} onChange={event => setSelected(event.target.value)} required>
        <option value="">Chọn nghĩa vụ còn nợ</option>{selected && !rows.some(row => row.id === selected) && <option value={selected}>Khoản đã chọn · {selected}</option>}
        {rows.map(row => <option key={row.id} value={row.id}>{row.sourceLabel} · còn {formatVnd(vnd(row.outstandingAmountVnd))}</option>)}
      </select></div>
    <div className="action-cluster"><span>Trang {page}</span>{page > 1 && <button className="button button-secondary" type="button" disabled={busy} onClick={() => void load(page - 1)}>Trước</button>}{hasNext && <button className="button button-secondary" type="button" disabled={busy} onClick={() => void load(page + 1)}>Tiếp</button>}</div>
    {error && <p className="form-message" role="alert">{error}</p>}
    <div className="field"><label htmlFor={"offset-amount-" + credit.id}>Số tiền cấn trừ (VND)</label><MoneyInput id={"offset-amount-" + credit.id} name="amount" value={amount} onValue={setAmount} required /></div>
    <button className="button button-secondary" type="submit">Ghi cấn trừ khoản có</button>
  </ReliableCommandForm>;
}

export function CustomerCreditPanel({ customerId, pending, credits, accounts, targets, targetsHasNext, actorScope, canApprove, canSettle,
  approvalOperations, refundOperations, offsetOperations, defaultRefundedAt }: {
  customerId: string; pending: ReturnFinanceRow[]; credits: CustomerCreditRow[]; accounts: Account[]; targets: PaymentTarget[]; targetsHasNext: boolean;
  actorScope: string; canApprove: boolean; canSettle: boolean; approvalOperations: Record<string, string>;
  refundOperations: Record<string, string>; offsetOperations: Record<string, string>; defaultRefundedAt: string;
}) {
  if (!pending.length && !credits.length) return null;
  return <section className="card card-pad command-panel"><h2>Hàng trả và khoản có của khách</h2>
    <p className="muted">Giảm phần chưa thanh toán vào công nợ; phần tiền đã thu được giữ để hoàn hoặc cấn trừ có nguồn. Ghi hoàn tiền khi khoản hoàn đã thực hiện.</p>
    {pending.map(row => <article className="exception-card" key={row.id}><strong>{row.delivery_number} · {row.material_name_snapshot} · trả {row.base_quantity}</strong>
      <p>Giới hạn theo hàng trả và chứng từ gốc: {formatVnd(vnd(row.maximum_credit_vnd))}.</p>
      {row.legacy_adjustment_exists && <p className="form-message">Đã có điều chỉnh trước đây. Đối chiếu nguồn tiền theo đúng giá trị đã ghi; không giảm công nợ hoặc doanh thu thêm lần nữa.</p>}
      {canApprove ? <ReliableCommandForm className="command-panel" command="adjust_return_receivable" action={approveReturnCreditAction}
          operationId={approvalOperations[row.id]} scope={`${actorScope}:RETURN:${row.id}`}>
          <input type="hidden" name="returnCaseId" value={row.id} />
          <div className="field"><label htmlFor={"return-credit-" + row.id}>{row.legacy_adjustment_exists ? "Giá trị điều chỉnh đã ghi (VND)" : "Số tiền giảm cho hàng trả (VND)"}</label><MoneyInput id={"return-credit-" + row.id} name="amount" readOnly={row.legacy_adjustment_exists} defaultValue={row.legacy_credit_amount_vnd ?? row.maximum_credit_vnd} required /></div>
          <div className="field"><label htmlFor={"return-reason-" + row.id}>Ghi chú (không bắt buộc)</label><input id={"return-reason-" + row.id} name="reason" maxLength={500} /></div>
          <button className="button button-danger" type="submit">{row.legacy_adjustment_exists ? "Đối chiếu nguồn điều chỉnh đã ghi" : "Duyệt giảm theo hàng trả"}</button>
        </ReliableCommandForm> : <p className="muted">Cần người có quyền duyệt điều chỉnh công nợ.</p>}
    </article>)}
    {credits.map(credit => <article className="exception-card" key={credit.id}><strong>{credit.delivery_number} · đã duyệt giảm {formatVnd(vnd(credit.approved_credit_vnd))}</strong>
      <p>Khoản có từ tiền đã thu: {formatVnd(vnd(credit.amount_vnd))} · còn {formatVnd(vnd(credit.remaining_vnd))}</p>
      <p>Đã hoàn: {formatVnd(vnd(credit.refunded_vnd))} · đã cấn trừ: {formatVnd(vnd(credit.offset_vnd))}</p>
      <CommandRecoveryNotice command="adjust_return_receivable" scope={`${actorScope}:RETURN:${credit.return_case_id}`} />
      {canSettle && BigInt(credit.remaining_vnd) > 0n ? <div className="two-column">
        {accounts.length > 0 ? <ReliableCommandForm className="command-panel" command="refund_customer_credit" action={refundCustomerCreditAction}
          operationId={refundOperations[credit.id]} scope={`${actorScope}:${credit.id}`}>
          <h3>Ghi hoàn tiền đã thực hiện</h3><input type="hidden" name="creditId" value={credit.id} />
          <div className="field"><label htmlFor={"refund-amount-" + credit.id}>Số tiền hoàn từ khoản có (VND)</label><MoneyInput id={"refund-amount-" + credit.id} name="amount" required /></div>
          <div className="field"><label htmlFor={"refund-account-" + credit.id}>Tài khoản chi hoàn</label><select id={"refund-account-" + credit.id} name="accountId" required><option value="">Chọn tài khoản chi</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></div>
          <div className="field"><label htmlFor={"refund-at-" + credit.id}>Thời điểm hoàn tiền</label><input id={"refund-at-" + credit.id} name="refundedAt" type="datetime-local" defaultValue={defaultRefundedAt} required /></div>
          <div className="field"><label htmlFor={"refund-method-" + credit.id}>Phương thức hoàn</label><select id={"refund-method-" + credit.id} name="method" defaultValue="BANK_TRANSFER"><option value="BANK_TRANSFER">Chuyển khoản</option><option value="CASH">Tiền mặt</option><option value="CARD">Thẻ</option><option value="OTHER">Khác</option></select></div>
          <div className="field"><label htmlFor={"refund-reference-" + credit.id}>Tham chiếu hoàn tiền</label><input id={"refund-reference-" + credit.id} name="reference" maxLength={160} /></div>
          <button className="button button-primary" type="submit">Ghi phiếu hoàn khoản có</button>
        </ReliableCommandForm> : <p className="form-message">Cần tài khoản tiền trong chi nhánh để ghi phiếu hoàn.</p>}
        <OffsetForm credit={credit} customerId={customerId} targets={targets} targetsHasNext={targetsHasNext} actorScope={actorScope} operationId={offsetOperations[credit.id]} />
      </div> : <div><CommandRecoveryNotice command="refund_customer_credit" scope={`${actorScope}:${credit.id}`} /><CommandRecoveryNotice command="offset_customer_credit" scope={`${actorScope}:${credit.id}`} /></div>}
    </article>)}
  </section>;
}
