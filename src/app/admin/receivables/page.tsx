import Link from "next/link";
import { randomUUID } from "node:crypto";
import { ActionNotice } from "@/components/sales/action-notice";
import { ListPager } from "@/components/ui/list-pager";
import { requireInternalPermission } from "@/lib/access/context";
import { CORE_LIST_PAGE_SIZE, parseCoreListQuery, ilikePattern } from "@/lib/core-list";
import { formatVnd, vnd } from "@/lib/core/money";
import { createServerSupabase } from "@/lib/supabase/server";
import { PaymentForm, type PaymentTarget } from "@/modules/finance/payment-form";

type Receivable = { id: string; customer_id: string; site_id: string | null; customer_name: string; site_name: string | null; source_label: string; original_amount_vnd: string; outstanding_amount_vnd: string; due_date: string; recorded_at: string; state: string };
type Account = { id: string; code: string; name: string };
type Query = { notice?: string; error?: string; payment?: string; customer?: string; state?: string; q?: string; page?: string };

function localNow() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()).replace(" ", "T");
}

export default async function ReceivablesPage({ searchParams }: { searchParams: Promise<Query> }) {
  const access = await requireInternalPermission("finance.ar.read");
  const query = await searchParams;
  const list = parseCoreListQuery(query);
  const customerId = /^[0-9a-f-]{36}$/i.test(query.customer ?? "") ? query.customer : undefined;
  const supabase = await createServerSupabase();
  let request = supabase.from("receivable_read").select("id, customer_id, site_id, customer_name, site_name, source_label, original_amount_vnd, outstanding_amount_vnd, due_date, recorded_at, state").eq("branch_id", access.branchId).gt("outstanding_amount_vnd", 0);
  if (list.q) request = request.or(`customer_name.ilike.${ilikePattern(list.q)},site_name.ilike.${ilikePattern(list.q)},source_label.ilike.${ilikePattern(list.q)}`);
  if (list.state) request = request.eq("state", list.state);
  if (customerId) request = request.eq("customer_id", customerId);
  const canPost = access.permissions.has("finance.payment.post");
  const [pageResult, selectedResult, accountResult] = await Promise.all([
    request.order("due_date").order("id").range(list.from, list.to + 1),
    customerId ? supabase.from("receivable_read").select("id, customer_id, customer_name, site_name, source_label, outstanding_amount_vnd, due_date").eq("branch_id", access.branchId).eq("customer_id", customerId).gt("outstanding_amount_vnd", 0).order("due_date").order("id").limit(100) : Promise.resolve({ data: [] }),
    customerId && canPost ? supabase.from("finance_accounts").select("id, code, name").eq("branch_id", access.branchId).eq("active", true).order("code").limit(100) : Promise.resolve({ data: [] }),
  ]);
  if (pageResult.error) throw new Error("Không thể tải phải thu.");
  const pageRows = (pageResult.data ?? []) as Receivable[];
  const hasNext = pageRows.length > CORE_LIST_PAGE_SIZE;
  const rows = pageRows.slice(0, CORE_LIST_PAGE_SIZE);
  const selected = (selectedResult.data ?? []) as Receivable[];
  const accounts = (accountResult.data ?? []) as Account[];
  const selectedName = selected[0]?.customer_name;
  return <><header className="page-heading"><div><p className="eyebrow">Finance · AR</p><h1>Phải thu khách hàng</h1><p className="lede">Số dư suy ra từ nghĩa vụ, điều chỉnh và phân bổ; không có cột tổng sửa tay.</p></div><Link className="button button-secondary" href="/admin/cashbook">Mở sổ tiền</Link></header>
    <ActionNotice notice={query.notice} error={query.error} reference={query.payment} />
    <form className="filter-bar">{customerId && <input type="hidden" name="customer" value={customerId} />}<label>Tìm kiếm<input name="q" defaultValue={list.q} placeholder="Khách, công trình, nguồn" /></label><label>Trạng thái<select name="state" defaultValue={list.state}><option value="">Tất cả còn dư</option><option value="OVERDUE">Quá hạn</option></select></label><button className="button button-secondary" type="submit">Áp dụng</button>{(list.q || list.state || customerId) && <Link className="code-link" href="/admin/receivables">Xóa lọc</Link>}</form>
    {customerId && <p className="form-message">Đang khóa ngữ cảnh customer: <span className="mono">{customerId}</span>. Tối đa 100 nghĩa vụ được đưa vào form phân bổ.</p>}
    {customerId && selectedName && canPost && accounts.length > 0 && <PaymentForm direction="RECEIPT" partyId={customerId} partyName={selectedName} accounts={accounts} obligations={selected.map((item): PaymentTarget => ({ id: item.id, sourceLabel: `${item.source_label} · ${item.site_name ?? "Chưa gắn công trình"}`, dueDate: item.due_date, outstandingAmountVnd: item.outstanding_amount_vnd }))} defaultEffectiveAt={localNow()} redirectTo={`/admin/receivables?customer=${customerId}`} operationId={randomUUID()} />}
    {customerId && selectedName && canPost && !accounts.length && <p className="form-message">Cần tạo tài khoản tiền tại Sổ tiền trước khi ghi nhận thu.</p>}
    <section className="card"><div className="section-head"><h2>{rows.length} khoản còn dư trên trang này</h2><span className="scope-chip">25 / trang</span></div><div className="table-wrap"><table><thead><tr><th>Khách / công trình</th><th>Nguồn</th><th>Phát sinh</th><th>Hạn</th><th>Gốc</th><th>Còn lại</th><th></th></tr></thead><tbody>{rows.map((item) => <tr key={item.id}><td>{item.customer_name}<small className="table-subline">{item.site_name ?? "Chưa gắn công trình"}</small></td><td>{item.source_label}</td><td>{new Intl.DateTimeFormat("vi-VN").format(new Date(item.recorded_at))}</td><td>{new Intl.DateTimeFormat("vi-VN").format(new Date(item.due_date))}</td><td className="mono">{formatVnd(vnd(item.original_amount_vnd))}</td><td className="mono"><strong>{formatVnd(vnd(item.outstanding_amount_vnd))}</strong><small className="table-subline">{item.state === "OVERDUE" ? "Quá hạn" : "Còn hạn"}</small></td><td><Link className="code-link" href={`/admin/receivables/${item.id}`}>Chi tiết</Link> · <Link className="code-link" href={`/admin/receivables?customer=${item.customer_id}`}>Ghi thu</Link></td></tr>)}</tbody></table>{!rows.length && <p className="empty-inline">Không có khoản phải thu phù hợp.</p>}</div><ListPager page={list.page} hasNext={hasNext} params={{ q: list.q, state: list.state, customer: customerId }} /></section>
  </>;
}
