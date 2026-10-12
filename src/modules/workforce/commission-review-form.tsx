"use client";

import { useState } from "react";
import { ReliableCommandForm } from "@/components/reliable-command-form";
import { formatVnd, vnd } from "@/lib/core/money";
import { resolveCommissionReviewAction } from "./commission-review-action";

export function CommissionReviewForm({ caseId, operationId, scope, targets, rules, canWaive }: {
 caseId: string; operationId: string; scope: string; targets: { id: string; version: number; label: string; remaining: string }[];
 rules: { id: string; label: string }[]; canWaive: boolean;
}) {
 const [method, setMethod] = useState("RECOVER_UNPAID_COMMISSION"), [target, setTarget] = useState(""), [rule, setRule] = useState(""), [reason, setReason] = useState("");
 return <ReliableCommandForm action={resolveCommissionReviewAction} command="resolve_commission_reconciliation" operationId={operationId} scope={scope} className="command-panel"
  onRestore={entries => { const fields = Object.fromEntries(entries); setMethod(fields.method ?? "RECOVER_UNPAID_COMMISSION"); setTarget(fields.target ?? ""); setRule(fields.ruleId ?? ""); setReason(fields.reason ?? ""); }}>
  <input type="hidden" name="caseId" value={caseId} />
  <label htmlFor={`commission-method-${caseId}`}>Quyết định</label><select id={`commission-method-${caseId}`} name="method" value={method} onChange={event => { setMethod(event.target.value); setTarget(""); setRule(""); }}><option value="RECOVER_UNPAID_COMMISSION">Giảm khoản hoa hồng còn chưa trả</option>{canWaive && <option value="WAIVE">Chủ doanh nghiệp quyết định không thu hồi</option>}</select>
  {method === "RECOVER_UNPAID_COMMISSION" ? <><label htmlFor={`commission-target-${caseId}`}>Nguồn hoa hồng còn chưa trả</label><select id={`commission-target-${caseId}`} name="target" value={target} onChange={event => setTarget(event.target.value)} required><option value="">Chọn khoản cùng nhân viên</option>{targets.map(item => <option key={item.id} value={`${item.id}:${item.version}`}>{item.label} · còn {formatVnd(vnd(item.remaining))}</option>)}</select>
   <label htmlFor={`commission-rule-${caseId}`}>Quy tắc điều chỉnh theo VND</label><select id={`commission-rule-${caseId}`} name="ruleId" value={rule} onChange={event => setRule(event.target.value)} required><option value="">Chọn ADJUSTMENT, hệ số 1</option>{rules.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
   {!rules.length && <p className="muted">Cần quy tắc điều chỉnh hợp lệ tại phân hệ thu nhập trước khi xử lý khoản chưa trả.</p>}</> : <><input type="hidden" name="target" value="" /><input type="hidden" name="ruleId" value="" /></>}
  <label htmlFor={`commission-reason-${caseId}`}>Lý do quyết định</label><input id={`commission-reason-${caseId}`} name="reason" value={reason} onChange={event => setReason(event.target.value)} minLength={3} maxLength={500} required />
  <button className="button button-primary" type="submit">Ghi quyết định đối chiếu hoa hồng</button>
 </ReliableCommandForm>;
}
