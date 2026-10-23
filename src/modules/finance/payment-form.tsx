"use client";
import { formatBusinessDate } from "@/lib/core/business-time";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { submitPaymentWithOutcomeAction } from "@/modules/finance/actions";
import { ReliableCommandForm } from "@/components/reliable-command-form";
import { formatVnd, vnd } from "@/lib/core/money";
import { MoneyInput } from "@/components/ui/money-input";
import { useCloseFormDialog } from "@/components/ui/form-dialog";

export type PaymentTarget = {
  id: string;
  sourceLabel: string;
  dueDate: string;
  outstandingAmountVnd: string;
};

type Props = {
  direction: "RECEIPT" | "DISBURSEMENT";
  partyId: string;
  partyName: string;
  accounts: Array<{ id: string; name: string; code: string }>;
  obligations: PaymentTarget[];
  initialHasNext?: boolean;
  defaultEffectiveAt: string;
  redirectTo: string;
  operationId: string;
  actorScope: string;
  historicalContext?: boolean;
};

function integer(value: string) {
  return /^\d+$/.test(value) ? BigInt(value) : 0n;
}

/** FB10: the amount received pays the oldest debts first (by due date); staff can still change each line. */
export function autoAllocate(amount: bigint, obligations: PaymentTarget[]): Record<string, string> {
  let left = amount;
  const result: Record<string, string> = {};
  for (const item of [...obligations].sort((a, b) => a.dueDate.localeCompare(b.dueDate))) {
    if (left <= 0n) break;
    const part = integer(item.outstandingAmountVnd) < left ? integer(item.outstandingAmountVnd) : left;
    if (part > 0n) { result[item.id] = part.toString(); left -= part; }
  }
  return result;
}

export function PaymentForm(props: Props) {
  const router = useRouter();
  const closeDialog = useCloseFormDialog();
  const [amount, setAmount] = useState("");
  const [asAdvance, setAsAdvance] = useState(false);
  const [manual, setManual] = useState(false);
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState(props.obligations);
  // FB10: after a save the page refreshes; show its current debts, not the ones the popup opened with.
  const [shown, setShown] = useState(props.obligations);
  if (shown !== props.obligations) { setShown(props.obligations); setVisible(props.obligations); }
  function changeAmount(value: string) {
    setAmount(value);
    if (!manual) setAllocations(autoAllocate(integer(value), visible));
  }
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(Boolean(props.initialHasNext));
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  async function loadObligations(targetPage: number, q: string) {
    setBusy(true);
    setLoadError("");
    try {
      const params = new URLSearchParams({ side: props.direction === "RECEIPT" ? "AR" : "AP", party: props.partyId, page: String(targetPage), q });
      const response = await fetch(`/api/finance/obligations?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Không thể tải khoản công nợ.");
      const result = await response.json() as { rows: PaymentTarget[]; hasNext: boolean };
      setVisible(result.rows);
      setHasNext(result.hasNext);
      setPage(targetPage);
      setAppliedSearch(q);
    } catch {
      setLoadError("Không thể tải khoản công nợ. Hãy thử lại.");
    } finally {
      setBusy(false);
    }
  }
  const allocated = useMemo(
    () => Object.values(allocations).reduce((total, value) => total + integer(value), 0n),
    [allocations],
  );
  const received = integer(amount);
  const remaining = received - allocated;
  const advanceValue = asAdvance && remaining > 0n ? remaining : 0n;
  const unallocated = remaining - advanceValue;
  const allocationPayload = Object.entries(allocations)
    .map(([id, amount]) => ({ obligation_id: id, amount_vnd: amount }))
    .filter((item) => integer(item.amount_vnd) > 0n);

  return (
    <ReliableCommandForm className="card card-pad payment-editor" action={submitPaymentWithOutcomeAction}
      command="post_payment" scope={`${props.actorScope}:${props.direction}:${props.partyId}`} operationId={props.operationId}
      onRestore={(entries) => {
        const fields = Object.fromEntries(entries);
        setAmount(fields.amount ?? "");
        setAsAdvance(integer(fields.advanceAmount ?? "0") > 0n);
        setManual(true);
        try {
          const values = JSON.parse(fields.allocationsJson ?? "[]") as Array<{ obligation_id: string; amount_vnd: string }>;
          setAllocations(Object.fromEntries(values.map((item) => [item.obligation_id, item.amount_vnd])));
        } catch { setAllocations({}); }
      }} onNew={() => { setAmount(""); setAsAdvance(false); setManual(false); setAllocations({}); }}
      onSuccess={(outcome) => { closeDialog?.(); router.replace(`${props.redirectTo}${props.redirectTo.includes("?") ? "&" : "?"}notice=payment-posted&payment=${outcome.resultId}`); }}>
      <div className="section-head flush">
        <div><p className="eyebrow">{props.direction === "RECEIPT" ? "Phiếu thu" : "Phiếu chi"}</p><h2>{props.partyName}</h2></div>
        <span className="scope-chip">Số dư hiện tại</span>
      </div>
      {props.historicalContext && <p className="form-message">Bạn đang xem mốc lịch sử; phiếu này dùng số dư hiện tại đã kiểm lại.</p>}
      <input type="hidden" name="direction" value={props.direction} />
      <input type="hidden" name="partyId" value={props.partyId} />
      <input type="hidden" name="allocationsJson" value={JSON.stringify(allocationPayload)} />
      <input type="hidden" name="redirectTo" value={props.redirectTo} />
      <div className="inline-create">
        <label>Số tiền {props.direction === "RECEIPT" ? "nhận" : "chi"}<MoneyInput name="amount" value={amount} onValue={changeAmount} required /></label>
        <label>Tài khoản<select name="accountId" required><option value="">Chọn tài khoản</option>{props.accounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></label>
        <label>Phương thức<select name="method"><option value="BANK_TRANSFER">Chuyển khoản</option><option value="CASH">Tiền mặt</option><option value="CARD">Thẻ</option><option value="OTHER">Khác</option></select></label>
        <label>Ngày nhận/chi<input type="datetime-local" name="effectiveAt" defaultValue={props.defaultEffectiveAt} required /></label>
        <label>Tham chiếu<input name="reference" maxLength={160} /></label>
        <input type="hidden" name="advanceAmount" value={advanceValue.toString()} />
      </div>
      <div className="allocation-editor">
        <div className="allocation-head"><strong>Trừ vào khoản nợ</strong><span>{manual ? `Đã sửa tay · ${allocationPayload.length} khoản` : `Tự trừ khoản cũ nhất trước · ${allocationPayload.length} khoản`}</span>{manual && <button className="button button-secondary" type="button" onClick={() => { setManual(false); setAllocations(autoAllocate(received, visible)); }}>Tự phân bổ lại</button>}</div>
        <div className="filter-bar"><label>Tìm khoản theo nguồn<input value={search} onChange={(event) => setSearch(event.target.value)} maxLength={80} placeholder="Mã hoặc tên nguồn" /></label><button className="button button-secondary" type="button" disabled={busy} onClick={() => void loadObligations(1, search)}>Tìm khoản</button></div>
        {visible.map((item) => <label className="allocation-row" key={item.id}><span><strong>{item.sourceLabel}</strong><small>Đến hạn {formatBusinessDate(item.dueDate)} · còn {formatVnd(vnd(item.outstandingAmountVnd))}</small></span><MoneyInput aria-label={`Phân bổ cho ${item.sourceLabel}`} value={allocations[item.id] ?? ""} onValue={(value) => { setManual(true); setAllocations((current) => ({ ...current, [item.id]: value })); }} placeholder="0" /></label>)}
        {!visible.length && <p className="empty-inline">Không có khoản còn dư phù hợp.</p>}
        {loadError && <p className="form-message" role="alert">{loadError}</p>}
        <div className="action-cluster"><span className="muted">Trang {page}</span>{page > 1 && <button className="button button-secondary" type="button" disabled={busy} onClick={() => void loadObligations(page - 1, appliedSearch)}>Trước</button>}{hasNext && <button className="button button-secondary" type="button" disabled={busy} onClick={() => void loadObligations(page + 1, appliedSearch)}>Tiếp</button>}</div>
      </div>
      <div className="money-triptych">
        <span>Tiền nhận/chi<strong>{formatVnd(vnd(received.toString()))}</strong></span>
        <span>Đã phân bổ<strong>{formatVnd(vnd(allocated.toString()))}</strong></span>
        <span className={remaining < 0n ? "money-negative" : ""}>{asAdvance ? "Tiền ứng trước" : "Còn dư"}<strong>{formatVnd(vnd(remaining.toString()))}</strong></span>
      </div>
      {remaining > 0n && <label className="check-inline"><input type="checkbox" checked={asAdvance} onChange={(event) => setAsAdvance(event.target.checked)} /> Ghi {formatVnd(vnd(remaining.toString()))} còn dư là tiền {props.direction === "RECEIPT" ? "khách" : "trả"} ứng trước</label>}
      {remaining > 0n && !asAdvance && <p className="form-message warning" role="status">Số tiền lớn hơn các khoản đã chọn. Trừ thêm vào khoản nợ khác hoặc chọn ghi phần dư là tiền ứng trước.</p>}
      {remaining < 0n && <p className="form-message" role="alert">Số trừ vào các khoản lớn hơn số tiền {props.direction === "RECEIPT" ? "nhận" : "chi"}.</p>}
      <button className="button button-primary action-full" type="submit" disabled={received <= 0n || unallocated !== 0n}>Ghi nhận {props.direction === "RECEIPT" ? "thu tiền" : "chi tiền"}</button>
    </ReliableCommandForm>
  );
}
