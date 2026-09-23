import Link from "next/link";
import { randomUUID } from "node:crypto";
import { ActionNotice } from "@/components/sales/action-notice";
import { ListPager } from "@/components/ui/list-pager";
import { requireInternalPermission } from "@/lib/access/context";
import { CORE_LIST_PAGE_SIZE, parseCoreListQuery, ilikePattern } from "@/lib/core-list";
import { formatVnd, vnd } from "@/lib/core/money";
import { createServerSupabase } from "@/lib/supabase/server";
import { PaymentForm, type PaymentTarget } from "@/modules/finance/payment-form";

type Payable = { id: string; supplier_id: string; supplier_name: string; source_label: string; original_amount_vnd: string; outstanding_amount_vnd: string; due_date: string; recorded_at: string; state: string };
type Account = { id: string; code: string; name: string };
type Query = { notice?: string; error?: string; payment?: string; supplier?: string; state?: string; q?: string; page?: string };

function localNow() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()).replace(" ", "T");
}

export default async function PayablesPage({ searchParams }: { searchParams: Promise<Query> }) {
  const access = await requireInternalPermission("finance.ap.read");
  const query = await searchParams;
  const list = parseCoreListQuery(query);
  const supplierId = /^[0-9a-f-]{36}$/i.test(query.supplier ?? "") ? query.supplier : undefined;
  const supabase = await createServerSupabase();
  let request = supabase.from("payable_read").select("id, supplier_id, supplier_name, source_label, original_amount_vnd, outstanding_amount_vnd, due_date, recorded_at, state").eq("branch_id", access.branchId).gt("outstanding_amount_vnd", 0);
  if (list.q) request = request.or(`supplier_name.ilike.${ilikePattern(list.q)},source_label.ilike.${ilikePattern(list.q)}`);
  if (list.state) request = request.eq("state", list.state);
  if (supplierId) request = request.eq("supplier_id", supplierId);
  const canPost = access.permissions.has("finance.payment.post");
  const [pageResult, selectedResult, accountResult] = await Promise.all([
    request.order("due_date").order("id").range(list.from, list.to + 1),
    supplierId ? supabase.from("payable_read").select("id, supplier_id, supplier_name, source_label, outstanding_amount_vnd, due_date").eq("branch_id", access.branchId).eq("supplier_id", supplierId).gt("outstanding_amount_vnd", 0).order("due_date").order("id").limit(100) : Promise.resolve({ data: [] }),
    supplierId && canPost ? supabase.from("finance_accounts").select("id, code, name").eq("branch_id", access.branchId).eq("active", true).order("code").limit(100) : Promise.resolve({ data: [] }),
  ]);
  if (pageResult.error) throw new Error("Không thể tải phải trả.");
  const pageRows = (pageResult.data ?? []) as Payable[];
  const hasNext = pageRows.length > CORE_LIST_PAGE_SIZE;
  const rows = pageRows.slice(0, CORE_LIST_PAGE_SIZE);
  const selected = (selectedResult.data ?? []) as Payable[];
  const accounts = (accountResult.data ?? []) as Account[];
  const selectedName = selected[0]?.supplier_name;
  return <><header className="page-heading"><div><p className="eyebrow">Finance · AP</p><h1>Phải trả nhà cung cấp</h1><p className="lede">AP theo đúng receipt, supplier fulfillment hoặc expense đã duyệt; không gọi là chi phí.</p></div><div className="action-cluster"><Link className="button button-secondary" href="/admin/expenses">Chi phí</Link><Link className="button button-secondary" href="/admin/cashbook">Sổ tiền</Link></div></header>
    <ActionNotice notice={query.notice} error={query.error} reference={query.payment} />
    <form className="filter-bar">{supplierId && <input type="hidden" name="supplier" value={supplierId} />}<label>Tìm kiếm<input name="q" defaultValue={list.q} placeholder="Nhà cung cấp, nguồn" /></label><label>Trạng thái<select name="state" defaultValue={list.state}><option value="">Tất cả còn dư</option><option value="OVERDUE">Quá hạn</option></select></label><button className="button button-secondary" type="submit">Áp dụng</button>{(list.q || list.state || supplierId) && <Link className="code-link" href="/admin/payables">Xóa lọc</Link>}</form>
    {supplierId && <p className="form-message">Đang khóa ngữ cảnh supplier: <span className="mono">{supplierId}</span>. Tối đa 100 nghĩa vụ được đưa vào form phân bổ.</p>}
    {supplierId && selectedName && canPost && accounts.length > 0 && <PaymentForm direction="DISBURSEMENT" partyId={supplierId} partyName={selectedName} accounts={accounts} obligations={selected.map((item): PaymentTarget => ({ id: item.id, sourceLabel: item.source_label, dueDate: item.due_date, outstandingAmountVnd: item.outstanding_amount_vnd }))} defaultEffectiveAt={localNow()} redirectTo={`/admin/payables?supplier=${supplierId}`} operationId={randomUUID()} />}
    {supplierId && selectedName && canPost && !accounts.length && <p className="form-message">Cần tạo tài khoản tiền tại Sổ tiền trước khi ghi nhận chi.</p>}
    <section className="card"><div className="section-head"><h2>{rows.length} khoản còn dư trên trang này</h2><span className="scope-chip">25 / trang</span></div><div className="table-wrap"><table><thead><tr><th>Nhà cung cấp</th><th>Nguồn</th><th>Phát sinh</th><th>Hạn</th><th>Gốc</th><th>Còn lại</th><th></th></tr></thead><tbody>{rows.map((item) => <tr key={item.id}><td>{item.supplier_name}</td><td>{item.source_label}</td><td>{new Intl.DateTimeFormat("vi-VN").format(new Date(item.recorded_at))}</td><td>{new Intl.DateTimeFormat("vi-VN").format(new Date(item.due_date))}</td><td className="mono">{formatVnd(vnd(item.original_amount_vnd))}</td><td className="mono"><strong>{formatVnd(vnd(item.outstanding_amount_vnd))}</strong><small className="table-subline">{item.state === "OVERDUE" ? "Quá hạn" : "Còn hạn"}</small></td><td><Link className="code-link" href={`/admin/payables/${item.id}`}>Chi tiết</Link> · <Link className="code-link" href={`/admin/payables?supplier=${item.supplier_id}`}>Ghi chi</Link></td></tr>)}</tbody></table>{!rows.length && <p className="empty-inline">Không có khoản phải trả phù hợp.</p>}</div><ListPager page={list.page} hasNext={hasNext} params={{ q: list.q, state: list.state, supplier: supplierId }} /></section>
  </>;
}
