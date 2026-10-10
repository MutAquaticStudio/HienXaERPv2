"use client";
import { formatBusinessDate } from "@/lib/core/business-time";

import { useMemo, useState } from "react";
import { postPaymentAction } from "@/modules/finance/actions";
import { formatVnd, vnd } from "@/lib/core/money";

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
  historicalContext?: boolean;
};

function integer(value: string) {
  return /^\d+$/.test(value) ? BigInt(value) : 0n;
}

export function PaymentForm(props: Props) {
  const [amount, setAmount] = useState("");
  const [advance, setAdvance] = useState("0");
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState(props.obligations);
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
  const advanceValue = integer(advance);
  const unallocated = received - allocated - advanceValue;
  const allocationPayload = Object.entries(allocations)
    .map(([id, amount]) => ({ obligation_id: id, amount_vnd: amount }))
    .filter((item) => integer(item.amount_vnd) > 0n);

  return (
    <form className="card card-pad payment-editor" action={postPaymentAction}>
      <div className="section-head flush">
        <div><p className="eyebrow">{props.direction === "RECEIPT" ? "Phiếu thu" : "Phiếu chi"}</p><h2>{props.partyName}</h2></div>
        <span className="scope-chip">Số dư hiện tại</span>
      </div>
      {props.historicalContext && <p className="form-message">Bạn đang xem mốc lịch sử; phiếu này dùng số dư hiện tại đã kiểm lại.</p>}
      <input type="hidden" name="direction" value={props.direction} />
      <input type="hidden" name="partyId" value={props.partyId} />
      <input type="hidden" name="allocationsJson" value={JSON.stringify(allocationPayload)} />
      <input type="hidden" name="operationId" value={props.operationId} />
      <input type="hidden" name="redirectTo" value={props.redirectTo} />
      <div className="inline-create">
        <label>Số tiền {props.direction === "RECEIPT" ? "nhận" : "chi"}<input name="amount" value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="numeric" required /></label>
        <label>Tài khoản<select name="accountId" required><option value="">Chọn tài khoản</option>{props.accounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></label>
        <label>Phương thức<select name="method"><option value="BANK_TRANSFER">Chuyển khoản</option><option value="CASH">Tiền mặt</option><option value="CARD">Thẻ</option><option value="OTHER">Khác</option></select></label>
        <label>Ngày nhận/chi<input type="datetime-local" name="effectiveAt" defaultValue={props.defaultEffectiveAt} required /></label>
        <label>Tham chiếu<input name="reference" maxLength={160} /></label>
        <label>Ghi nhận ứng trước<input name="advanceAmount" value={advance} onChange={(event) => setAdvance(event.target.value)} inputMode="numeric" /></label>
      </div>
      <div className="allocation-editor">
        <div className="allocation-head"><strong>Phân bổ thủ công</strong><span>Đã chọn {allocationPayload.length} khoản · không tự chọn thứ tự khoản</span></div>
        <div className="filter-bar"><label>Tìm khoản theo nguồn<input value={search} onChange={(event) => setSearch(event.target.value)} maxLength={80} placeholder="Mã hoặc tên nguồn" /></label><button className="button button-secondary" type="button" disabled={busy} onClick={() => void loadObligations(1, search)}>Tìm khoản</button></div>
        {visible.map((item) => <label className="allocation-row" key={item.id}><span><strong>{item.sourceLabel}</strong><small>Đến hạn {formatBusinessDate(item.dueDate)} · còn {formatVnd(vnd(item.outstandingAmountVnd))}</small></span><input aria-label={`Phân bổ cho ${item.sourceLabel}`} value={allocations[item.id] ?? ""} onChange={(event) => setAllocations((current) => ({ ...current, [item.id]: event.target.value }))} inputMode="numeric" placeholder="0" /></label>)}
        {!visible.length && <p className="empty-inline">Không có khoản còn dư phù hợp.</p>}
        {loadError && <p className="form-message" role="alert">{loadError}</p>}
        <div className="action-cluster"><span className="muted">Trang {page}</span>{page > 1 && <button className="button button-secondary" type="button" disabled={busy} onClick={() => void loadObligations(page - 1, appliedSearch)}>Trước</button>}{hasNext && <button className="button button-secondary" type="button" disabled={busy} onClick={() => void loadObligations(page + 1, appliedSearch)}>Tiếp</button>}</div>
      </div>
      <div className="money-triptych">
        <span>Tiền nhận/chi<strong>{formatVnd(vnd(received.toString()))}</strong></span>
        <span>Đã phân bổ<strong>{formatVnd(vnd(allocated.toString()))}</strong></span>
        <span className={unallocated < 0n ? "money-negative" : ""}>Còn chưa phân loại<strong>{formatVnd(vnd(unallocated.toString()))}</strong></span>
      </div>
      <button className="button button-primary action-full" type="submit" disabled={received <= 0n || unallocated < 0n}>Ghi nhận {props.direction === "RECEIPT" ? "thu tiền" : "chi tiền"}</button>
    </form>
  );
}
