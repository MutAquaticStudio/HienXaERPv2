"use client";

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
  const allocated = useMemo(
    () => Object.values(allocations).reduce((total, value) => total + integer(value), 0n),
    [allocations],
  );
  const received = integer(amount);
  const advanceValue = integer(advance);
  const unallocated = received - allocated - advanceValue;
  const allocationPayload = props.obligations
    .map((item) => ({ obligation_id: item.id, amount_vnd: allocations[item.id] ?? "0" }))
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
        <div className="allocation-head"><strong>Phân bổ thủ công</strong><span>Không tự chọn thứ tự khoản</span></div>
        {props.obligations.map((item) => <label className="allocation-row" key={item.id}><span><strong>{item.sourceLabel}</strong><small>Đến hạn {new Intl.DateTimeFormat("vi-VN").format(new Date(item.dueDate))} · còn {formatVnd(vnd(item.outstandingAmountVnd))}</small></span><input aria-label={`Phân bổ cho ${item.sourceLabel}`} value={allocations[item.id] ?? ""} onChange={(event) => setAllocations((current) => ({ ...current, [item.id]: event.target.value }))} inputMode="numeric" placeholder="0" /></label>)}
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
