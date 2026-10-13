import { activityKindLabel } from "@/modules/finance/presentation";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { ActionNotice } from "@/components/sales/action-notice";
import { ListPager } from "@/components/ui/list-pager";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireInternalPermission } from "@/lib/access/context";
import { CORE_LIST_PAGE_SIZE, ilikePattern, parseCoreListQuery } from "@/lib/core-list";
import { formatVnd, vnd } from "@/lib/core/money";
import { formatBusinessDate } from "@/lib/core/business-time";
import { createServerSupabase } from "@/lib/supabase/server";
import { createExpenseAction, createExpenseCategoryAction } from "@/modules/finance/actions";

import { DeliveryExpenseForm, ExpenseApprovalForm } from "@/modules/finance/delivery-expense-form";

type Expense = { id: string; expense_number: string; category_name: string; supplier_name: string; amount_vnd: string; effective_at: string; due_date: string; description: string; activity_kind: string; approval_state: string; version: number };
function localNow() { return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()).replace(" ", "T"); }
function localDate() { return localNow().slice(0, 10); }

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string; focus?: string; q?: string; state?: string; page?: string }> }) {
  const access = await requireInternalPermission("finance.expense.read");
  const query = await searchParams;
  const list = parseCoreListQuery(query);
  const state = list.state === "DRAFT" || list.state === "APPROVED" ? list.state : "";
  const focusId = /^[0-9a-f-]{36}$/i.test(query.focus ?? "") ? query.focus : undefined;
  const canManage = access.permissions.has("finance.expense.manage");
  const supabase = await createServerSupabase();
  const fields = "id, expense_number, category_name, supplier_name, amount_vnd::text, effective_at, due_date, description, activity_kind, approval_state, version";
  let request = supabase.from("expense_read").select(fields).eq("branch_id", access.branchId);
  if (list.q) request = request.or(`expense_number.ilike.${ilikePattern(list.q)},category_name.ilike.${ilikePattern(list.q)},supplier_name.ilike.${ilikePattern(list.q)},description.ilike.${ilikePattern(list.q)}`);
  if (state) request = request.eq("approval_state", state);
  const [pageResult, categoryResult, supplierResult, orderResult, focusedResult, assignmentResult, sourceResult] = await Promise.all([
    request.order("effective_at", { ascending: false }).order("id", { ascending: false }).range(list.from, list.to + 1),
    canManage ? supabase.from("expense_categories").select("id, code, name").eq("branch_id", access.branchId).eq("active", true).order("name") : Promise.resolve({ data: [] }),
    canManage ? supabase.from("suppliers").select("id, code, name").eq("branch_id", access.branchId).eq("active", true).order("name") : Promise.resolve({ data: [] }),
    canManage ? supabase.from("sales_order_read").select("id, order_number, customer_name_snapshot, site_name_snapshot").eq("branch_id", access.branchId).order("created_at", { ascending: false }).limit(50) : Promise.resolve({ data: [] }),
    focusId ? supabase.from("expense_read").select(fields).eq("branch_id", access.branchId).eq("id", focusId).maybeSingle() : Promise.resolve({ data: null }),
    canManage ? supabase.from("delivery_expense_assignment_read").select("assignment_id, delivery_id, delivery_number, delivery_version, assignment_version, plate_number, external_carrier_name, execution_state").eq("branch_id", access.branchId).order("handed_off_at", { ascending: false }).limit(100) : Promise.resolve({ data: [], error: null }),
    supabase.from("delivery_expense_sources").select("expense_id, assignment_id, cost_scope, supplier_reference").eq("branch_id", access.branchId),
  ]);
  if (pageResult.error) throw new Error("Không thể tải chi phí.");
  const pageRows = (pageResult.data ?? []) as Expense[];
  const hasNext = pageRows.length > CORE_LIST_PAGE_SIZE;
  const visibleRows = pageRows.slice(0, CORE_LIST_PAGE_SIZE);
  const focused = focusedResult.data as Expense | null;
  const pinned = focused && !visibleRows.some((item) => item.id === focused.id) ? focused : null;
  const rows = pinned ? [pinned, ...visibleRows] : visibleRows;
  const categories = categoryResult.data;
  const suppliers = supplierResult.data;
  const orders = orderResult.data;
  if (assignmentResult.error || sourceResult.error) throw new Error("Không thể tải nguồn chi phí chuyến.");
  const sources = new Map((sourceResult.data ?? []).map(item => [item.expense_id, item]));
  const assignments = (assignmentResult.data ?? []).map(item => ({ id: item.assignment_id, version: item.delivery_version, label: `${item.delivery_number} · lần ${item.assignment_version} · ${item.plate_number || item.external_carrier_name} · ${item.execution_state}` }));
  const assignmentLabels = new Map(assignments.map(item => [item.id, item.label]));
  return <div className="page-stack"><header className="page-heading"><div><p className="eyebrow">Chi phí vận hành</p><h1>Chi phí vận hành</h1><p className="lede">Chi phí ghi nhận sau duyệt; thanh toán theo khoản phải trả.</p></div></header><ActionNotice notice={query.notice} error={query.error} />
    {canManage && <div className="two-column"><details className="card card-pad quick-create"><summary>Tạo nhóm chi phí</summary><form className="command-panel" action={createExpenseCategoryAction}><input type="hidden" name="operationId" value={randomUUID()} /><div className="field"><label>Mã nhóm</label><input name="code" required /></div><div className="field"><label>Tên nhóm</label><input name="name" required /></div><button className="button button-secondary" type="submit">Tạo nhóm</button></form></details><details className="card card-pad quick-create" open><summary>Ghi chi phí chờ duyệt</summary><form className="command-panel" action={createExpenseAction}><input type="hidden" name="operationId" value={randomUUID()} /><div className="field"><label>Nhóm</label><select name="categoryId" required><option value="">Chọn nhóm</option>{(categories ?? []).map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></div><div className="field"><label>Nhà cung cấp</label><select name="supplierId" required><option value="">Chọn NCC</option>{(suppliers ?? []).map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></div><div className="field"><label>Số tiền</label><input name="amount" inputMode="numeric" required /></div><div className="field"><label>Ngày phát sinh</label><input name="effectiveAt" type="datetime-local" defaultValue={localNow()} required /></div><div className="field"><label>Hạn trả</label><input name="dueDate" type="date" defaultValue={localDate()} required /></div><div className="field"><label>Loại hoạt động</label><select name="activityKind"><option value="OPERATIONS">Vận hành</option><option value="SALES">Bán hàng</option><option value="DELIVERY">Giao hàng</option><option value="SERVICE">Dịch vụ</option><option value="ADMIN">Hành chính</option></select></div><div className="field"><label>Đơn bán liên quan</label><select name="salesOrderId"><option value="">Chi phí chung chưa phân bổ</option>{(orders ?? []).map((item) => <option key={item.id} value={item.id}>{item.order_number} · {item.customer_name_snapshot} / {item.site_name_snapshot}</option>)}</select></div><div className="field"><label>Mô tả</label><textarea name="description" minLength={3} required /></div><div className="field"><label>Mã minh chứng đã xác minh</label><input name="evidenceId" /></div><button className="button button-primary" type="submit" disabled={!categories?.length || !suppliers?.length}>Tạo chi phí nháp</button></form></details></div>}
    {canManage && <details className="card card-pad quick-create"><summary>Chi phí theo phiếu giao và xe</summary><DeliveryExpenseForm operationId={randomUUID()} scope={`${access.authUserId}:${access.branchId}:trip-expense`} assignments={assignments} categories={(categories ?? []).map(item => ({ id: item.id, label: `${item.code} · ${item.name}` }))} suppliers={(suppliers ?? []).map(item => ({ id: item.id, label: `${item.code} · ${item.name}` }))} now={localNow()} today={localDate()} /></details>}
    <form className="filter-bar"><label>Tìm kiếm<input name="q" defaultValue={list.q} placeholder="Mã, nhóm, NCC, mô tả" /></label><label>Trạng thái<select name="state" defaultValue={state}><option value="">Tất cả</option><option value="DRAFT">Chờ duyệt</option><option value="APPROVED">Đã duyệt</option></select></label><button className="button button-secondary" type="submit">Áp dụng</button>{(list.q || state) && <Link className="code-link" href="/admin/expenses">Xóa lọc</Link>}</form>
    <section className="card"><div className="section-head"><h2>{visibleRows.length} khoản chi phí trên trang này{pinned ? " + 1 khoản được ghim" : ""}</h2><span className="scope-chip">Chỉ tính chi phí đã duyệt</span></div><div className="table-wrap"><table><thead><tr><th>Mã</th><th>Ngày</th><th>Nhóm / mô tả</th><th>NCC</th><th>Phạm vi</th><th>Số tiền</th><th>Trạng thái</th><th></th></tr></thead><tbody>{rows.map((item) => <tr className={focusId === item.id ? "row-focus" : undefined} key={item.id}><td className="mono">{item.expense_number}{focusId === item.id && <small className="table-subline">Được ghim</small>}</td><td>{formatBusinessDate(item.effective_at)}</td><td>{item.category_name}<small className="table-subline">{item.description}</small></td><td>{item.supplier_name}</td><td>{activityKindLabel(item.activity_kind)}{sources.get(item.id) && <small className="table-subline">{sources.get(item.id)?.cost_scope === "DIRECT_DELIVERY" ? "Trực tiếp" : "Chi phí chung"} · {assignmentLabels.get(sources.get(item.id)!.assignment_id) || sources.get(item.id)?.assignment_id} · {sources.get(item.id)?.supplier_reference}</small>}</td><td className="mono">{formatVnd(vnd(String(item.amount_vnd)))}</td><td><StatusBadge tone={item.approval_state === "APPROVED" ? "success" : "warning"}>{item.approval_state === "APPROVED" ? "Đã duyệt" : "Chờ duyệt"}</StatusBadge></td><td>{item.approval_state === "DRAFT" && canManage && <ExpenseApprovalForm expenseId={item.id} version={item.version} operationId={randomUUID()} scope={`${access.authUserId}:${access.branchId}:expense:${item.id}`} />}</td></tr>)}</tbody></table>{!rows.length && <p className="empty-inline">Chưa có chi phí.</p>}</div><ListPager page={list.page} hasNext={hasNext} params={{ q: list.q, state }} /></section>
  </div>;
}
