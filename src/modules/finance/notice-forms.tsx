"use client";

import { ReliableCommandForm } from "@/components/reliable-command-form";
import { paymentNoticeCommandAction } from "./notice-actions";
import { MoneyInput } from "@/components/ui/money-input";
export function NoticeForm({ kind, noticeId, version, operationId, scope, sources = [], matchId, canSubmit = true }: {
 kind: "REVIEW" | "MATCH" | "REVERSE_MATCH"; noticeId: string; version: number; operationId: string; scope: string; sources?: { id: string; label: string }[]; matchId?: string; canSubmit?: boolean;
}) {
 const command = kind === "REVIEW" ? "review_payment_notice" : kind === "MATCH" ? "match_payment_notice" : "reverse_payment_notice_match";
 return <ReliableCommandForm action={paymentNoticeCommandAction} command={command} operationId={operationId} scope={scope} className="command-panel">
  <input type="hidden" name="kind" value={kind} /><input type="hidden" name="noticeId" value={noticeId} /><input type="hidden" name="version" value={version} />
  {kind === "REVIEW" && <div className="field"><label htmlFor={`notice-review-${noticeId}`}>Rà soát chứng từ thông báo</label><select id={`notice-review-${noticeId}`} name="state"><option value="UNDER_REVIEW">Đang rà soát</option><option value="ACCEPTED">Tiếp nhận chứng từ, chưa là tiền</option><option value="REJECTED">Từ chối chứng từ</option></select></div>}
  {kind === "MATCH" && <><div className="field"><label htmlFor={`notice-source-${noticeId}`}>Phiếu thu đã đối chiếu ngân hàng</label><select id={`notice-source-${noticeId}`} name="reconciliationId" required><option value="">Chọn nguồn cùng khách còn khả dụng đối chiếu</option>{sources.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div><div className="field"><label htmlFor={`notice-amount-${noticeId}`}>Số tiền nối với thông báo</label><MoneyInput id={`notice-amount-${noticeId}`} name="amount" required /></div></>}
  {kind === "REVERSE_MATCH" && <input type="hidden" name="matchId" value={matchId} />}
  <div className="field"><label htmlFor={`notice-reason-${noticeId}-${kind}-${matchId || ""}`}>Căn cứ đối chiếu</label><input id={`notice-reason-${noticeId}-${kind}-${matchId || ""}`} name="reason" minLength={3} maxLength={500} required /></div>
  <button className="button button-secondary" type="submit" disabled={!canSubmit}>{kind === "REVIEW" ? "Lưu rà soát chứng từ" : kind === "MATCH" ? "Nối tiền thực với thông báo" : "Sửa liên kết đối chiếu"}</button>
 </ReliableCommandForm>;
}
