"use client";

import { ReliableCommandForm } from "@/components/reliable-command-form";
import { createSupplierReturnAction, recordSupplierReturnAction, approveSupplierCreditAction, settleSupplierCreditAction } from "./supplier-return-actions";

type Option = { id: string; label: string };
export function SupplierReturnCreateForm({ operationId, scope, sources }: { operationId: string; scope: string; sources: Option[] }) {
 return <ReliableCommandForm action={createSupplierReturnAction} command="create_supplier_return" operationId={operationId} scope={scope} className="command-panel">
  <div className="field"><label htmlFor="supplier-return-source">Nguồn nhận hàng hoặc giao thẳng</label><select id="supplier-return-source" name="source" required><option value="">Chọn nguồn đã ghi</option>{sources.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div>
  <div className="field"><label htmlFor="supplier-return-qty">Lượng dự kiến trả theo đơn vị cơ sở</label><input id="supplier-return-qty" name="quantity" inputMode="decimal" required /></div>
  <div className="field"><label htmlFor="supplier-return-reason">Lý do trả nhà cung cấp</label><input id="supplier-return-reason" name="reason" minLength={3} maxLength={500} required /></div>
  <p className="muted">Giao thẳng cần hồ sơ hàng trả đang mở trên đúng phiếu giao. Lượng phải bằng hồ sơ đó; xác nhận trả thẳng về nhà cung cấp sẽ giữ kho nội bộ đúng thực tế.</p>
  <button className="button button-primary" type="submit" disabled={!sources.length}>Mở hồ sơ trả nhà cung cấp</button>
 </ReliableCommandForm>;
}
export function SupplierReturnEventForm({ caseId, kind, version, operationId, scope, canRecord }: { caseId: string; kind: "PHYSICAL_RETURN" | "SUPPLIER_ACCEPTANCE" | "CLOSE_DISPATCH"; version: number; operationId: string; scope: string; canRecord: boolean }) {
 const labels = { PHYSICAL_RETURN: "Xác nhận lượng thực trả", SUPPLIER_ACCEPTANCE: "Ghi nhà cung cấp chấp nhận", CLOSE_DISPATCH: "Đóng phần chưa trả" };
 return <ReliableCommandForm action={recordSupplierReturnAction} command="record_supplier_return_event" operationId={operationId} scope={scope} className="command-panel">
  <input type="hidden" name="caseId" value={caseId} /><input type="hidden" name="kind" value={kind} /><input type="hidden" name="version" value={version} />
  {kind === "CLOSE_DISPATCH" ? <input type="hidden" name="quantity" value="0" /> : <div className="field"><label htmlFor={`sr-qty-${kind}`}>Lượng thực tế theo đơn vị cơ sở</label><input id={`sr-qty-${kind}`} name="quantity" inputMode="decimal" required /></div>}
  {kind === "SUPPLIER_ACCEPTANCE" ? <div className="field"><label htmlFor="sr-supplier-reference">Tham chiếu nhà cung cấp chấp nhận</label><input id="sr-supplier-reference" name="supplierReference" minLength={3} maxLength={100} required /></div> : <input type="hidden" name="supplierReference" value="" />}
  <div className="field"><label htmlFor={`sr-reason-${kind}`}>Lý do / ghi nhận</label><input id={`sr-reason-${kind}`} name="reason" minLength={3} maxLength={500} required /></div>
  <button className="button button-primary" type="submit" disabled={!canRecord}>{labels[kind]}</button>
 </ReliableCommandForm>;
}
export function SupplierCreditApprovalForm({ caseId, acceptanceId, version, amount, operationId, scope, canRecord }: { caseId: string; acceptanceId: string; version: number; amount: string; operationId: string; scope: string; canRecord: boolean }) {
 return <ReliableCommandForm action={approveSupplierCreditAction} command="approve_supplier_return_credit" operationId={operationId} scope={scope} className="command-panel">
  <input type="hidden" name="caseId" value={caseId} /><input type="hidden" name="acceptanceId" value={acceptanceId} /><input type="hidden" name="version" value={version} />
  <div className="field"><label htmlFor={`sr-approval-amount-${acceptanceId}`}>Số tiền giảm phải trả được duyệt</label><input id={`sr-approval-amount-${acceptanceId}`} name="amount" inputMode="numeric" defaultValue={amount} required /></div>
  <div className="field"><label htmlFor={`sr-approval-reason-${acceptanceId}`}>Lý do quyết định giảm phải trả</label><input id={`sr-approval-reason-${acceptanceId}`} name="reason" minLength={3} maxLength={500} required /></div>
  <button className="button button-primary" type="submit" disabled={!canRecord}>Duyệt giảm phải trả theo chấp nhận</button>
 </ReliableCommandForm>;
}
export function SupplierCreditSettlementForm({ caseId, creditId, kind, operationId, scope, accounts, payables, now, canRecord }: { caseId: string; creditId: string; kind: "REFUND" | "OFFSET"; operationId: string; scope: string; accounts: Option[]; payables: Option[]; now: string; canRecord: boolean }) {
 const refund = kind === "REFUND";
 return <ReliableCommandForm action={settleSupplierCreditAction} command={refund ? "refund_supplier_credit" : "offset_supplier_credit"} operationId={operationId} scope={scope} className="command-panel">
  <input type="hidden" name="caseId" value={caseId} /><input type="hidden" name="creditId" value={creditId} /><input type="hidden" name="kind" value={kind} />
  <div className="field"><label htmlFor={`sr-settle-amount-${creditId}-${kind}`}>Số tiền {refund ? "đã nhận nhà cung cấp hoàn" : "bù trừ"}</label><input id={`sr-settle-amount-${creditId}-${kind}`} name="amount" inputMode="numeric" required /></div>
  {refund ? <><input type="hidden" name="obligationId" value="" /><div className="field"><label htmlFor={`sr-account-${creditId}`}>Tài khoản đã nhận tiền hoàn</label><select id={`sr-account-${creditId}`} name="accountId" required><option value="">Chọn tài khoản</option>{accounts.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div>
   <div className="field"><label htmlFor={`sr-time-${creditId}`}>Thời điểm nhận tiền hoàn</label><input id={`sr-time-${creditId}`} name="receivedAt" type="datetime-local" defaultValue={now} required /></div>
   <div className="field"><label htmlFor={`sr-method-${creditId}`}>Phương thức nhận tiền hoàn</label><select id={`sr-method-${creditId}`} name="method"><option value="BANK_TRANSFER">Chuyển khoản</option><option value="CASH">Tiền mặt</option><option value="CARD">Thẻ</option><option value="OTHER">Khác</option></select></div>
  </> : <><input type="hidden" name="accountId" value="" /><input type="hidden" name="receivedAt" value="" /><input type="hidden" name="method" value="BANK_TRANSFER" /><div className="field"><label htmlFor={`sr-offset-${creditId}`}>Phải trả cùng nhà cung cấp</label><select id={`sr-offset-${creditId}`} name="obligationId" required><option value="">Chọn nguồn còn phải trả</option>{payables.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div></>}
  <div className="field"><label htmlFor={`sr-settle-ref-${creditId}-${kind}`}>Tham chiếu đối chiếu</label><input id={`sr-settle-ref-${creditId}-${kind}`} name="reference" maxLength={160} /></div>
  <button className="button button-primary" type="submit" disabled={!canRecord}>{refund ? "Ghi tiền nhà cung cấp đã hoàn" : "Bù trừ vào phải trả cùng nhà cung cấp"}</button>
 </ReliableCommandForm>;
}
