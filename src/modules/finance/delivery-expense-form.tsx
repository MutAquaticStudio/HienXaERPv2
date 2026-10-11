"use client";

import { ReliableCommandForm } from "@/components/reliable-command-form";
import { createDeliveryExpenseAction, approveExpenseWithOutcomeAction } from "./delivery-expense-actions";

type Option = { id: string; label: string };
export function DeliveryExpenseForm({ operationId, scope, assignments, categories, suppliers, now, today }: {
 operationId: string; scope: string; assignments: { id: string; version: number; label: string }[]; categories: Option[]; suppliers: Option[]; now: string; today: string;
}) {
 return <ReliableCommandForm action={createDeliveryExpenseAction} command="create_delivery_expense" operationId={operationId} scope={scope} className="command-panel">
  <label htmlFor="expense-assignment">Phiếu giao và lần phân xe đã bàn giao</label><select id="expense-assignment" name="assignment" required><option value="">Chọn lần giao thực tế</option>{assignments.map(item => <option key={item.id} value={`${item.id}:${item.version}`}>{item.label}</option>)}</select>
  <label htmlFor="trip-expense-category">Nhóm chi phí chuyến</label><select id="trip-expense-category" name="categoryId" required><option value="">Chọn nhóm</option>{categories.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
  <label htmlFor="trip-expense-supplier">Nhà cung cấp chi phí chuyến</label><select id="trip-expense-supplier" name="supplierId" required><option value="">Chọn NCC</option>{suppliers.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
  <label htmlFor="trip-expense-reference">Tham chiếu chứng từ nhà cung cấp</label><input id="trip-expense-reference" name="supplierReference" minLength={3} maxLength={100} required />
  <label htmlFor="trip-expense-scope">Cách tính chi phí</label><select id="trip-expense-scope" name="costScope"><option value="DIRECT_DELIVERY">Trực tiếp của phiếu giao</option><option value="OVERHEAD">Chi phí chung, giữ liên kết chuyến</option></select>
  <label htmlFor="trip-expense-amount">Số tiền chi phí chuyến</label><input id="trip-expense-amount" name="amount" inputMode="numeric" pattern="[1-9][0-9]*" required />
  <label htmlFor="trip-expense-time">Ngày phát sinh chi phí chuyến</label><input id="trip-expense-time" name="effectiveAt" type="datetime-local" defaultValue={now} required />
  <label htmlFor="trip-expense-due">Hạn trả chi phí chuyến</label><input id="trip-expense-due" name="dueDate" type="date" defaultValue={today} required />
  <label htmlFor="trip-expense-description">Mô tả chi phí chuyến</label><textarea id="trip-expense-description" name="description" minLength={3} maxLength={500} required />
  <label htmlFor="trip-expense-evidence">Minh chứng đã xác minh của chi phí chuyến</label><input id="trip-expense-evidence" name="evidenceId" />
  <p className="muted">Một khoản theo một lần giao; chuyến thất bại và giao lại giữ nguồn riêng. Thu nhập nhân viên ghi tại phân hệ thu nhập. Chi phí này cần chứng từ nhà cung cấp riêng.</p>
  <button className="button button-primary" type="submit" disabled={!assignments.length || !categories.length || !suppliers.length}>Ghi chi phí chuyến</button>
 </ReliableCommandForm>;
}
export function ExpenseApprovalForm({ expenseId, version, operationId, scope }: { expenseId: string; version: number; operationId: string; scope: string }) {
 return <ReliableCommandForm action={approveExpenseWithOutcomeAction} command="approve_expense" operationId={operationId} scope={scope}>
  <input type="hidden" name="expenseId" value={expenseId} /><input type="hidden" name="version" value={version} />
  <button className="button button-secondary" type="submit">Duyệt và ghi công nợ phải trả</button>
 </ReliableCommandForm>;
}
