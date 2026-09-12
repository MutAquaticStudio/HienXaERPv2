import Link from "next/link";
import { randomUUID } from "node:crypto";
import { ActionNotice } from "@/components/sales/action-notice";
import { requireInternalPermission } from "@/lib/access/context";
import { formatVnd, vnd } from "@/lib/core/money";
import { createServerSupabase } from "@/lib/supabase/server";
import { PaymentForm, type PaymentTarget } from "@/modules/finance/payment-form";

type Receivable = {
  id: string; customer_id: string; site_id: string | null; customer_name: string; site_name: string | null;
  source_label: string; original_amount_vnd: string; outstanding_amount_vnd: string; due_date: string;
  recorded_at: string; state: string;
};
type Account = { id: string; code: string; name: string };

function localNow() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()).replace(" ", "T");
}

export default async function ReceivablesPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string; payment?: string; customer?: string; state?: string }> }) {
  const access = await requireInternalPermission("finance.ar.read");
  const query = await searchParams;
  const supabase = await createServerSupabase();
  let request = supabase.from("receivable_read").select("id, customer_id, site_id, customer_name, site_name, source_label, original_amount_vnd, outstanding_amount_vnd, due_date, recorded_at, state").eq("branch_id", access.branchId).order("due_date");
  if (query.state === "OVERDUE") request = request.eq("state", "OVERDUE");
  const [{ data }, { data: accountData }] = await Promise.all([
    request,
    supabase.from("finance_accounts").select("id, code, name").eq("branch_id", access.branchId).eq("active", true).order("code"),
  ]);
  const rows = (data ?? []) as Receivable[];
  const accounts = (accountData ?? []) as Account[];
  const openRows = rows.filter((item) => BigInt(item.outstanding_amount_vnd) > 0n);
  const selected = query.customer ? openRows.filter((item) => item.customer_id === query.customer) : [];
  const customers = [...new Map(openRows.map((item) => [item.customer_id, item.customer_name])).entries()];
  const selectedName = selected[0]?.customer_name;

  return <><header className="page-heading"><div><p className="eyebrow">Finance · AR</p><h1>Phải thu khách hàng</h1><p className="lede">Số dư suy ra từ nghĩa vụ, điều chỉnh và phân bổ; không có cột tổng sửa tay.</p></div><Link className="button button-secondary" href="/admin/cashbook">Mở sổ tiền</Link></header>
    <ActionNotice notice={query.notice} error={query.error} reference={query.payment} />
    <form className="filter-bar"><label>Trạng thái<select name="state" defaultValue={query.state ?? ""}><option value="">Tất cả</option><option value="OVERDUE">Quá hạn</option></select></label><label>Khách hàng<select name="customer" defaultValue={query.customer ?? ""}><option value="">Tất cả</option>{customers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><button className="button button-secondary" type="submit">Áp dụng</button></form>
    {query.customer && selectedName && access.permissions.has("finance.payment.post") && accounts.length > 0 && <PaymentForm direction="RECEIPT" partyId={query.customer} partyName={selectedName} accounts={accounts} obligations={selected.map((item): PaymentTarget => ({ id: item.id, sourceLabel: `${item.source_label} · ${item.site_name ?? "Chưa gắn công trình"}`, dueDate: item.due_date, outstandingAmountVnd: item.outstanding_amount_vnd }))} defaultEffectiveAt={localNow()} redirectTo={`/admin/receivables?customer=${query.customer}`} operationId={randomUUID()} />}
    {query.customer && selectedName && !accounts.length && <p className="form-message">Cần tạo tài khoản tiền tại Sổ tiền trước khi ghi nhận thu.</p>}
    <section className="card"><div className="section-head"><h2>{openRows.length} khoản còn dư</h2><span className="scope-chip">Hiện tại</span></div><div className="table-wrap"><table><thead><tr><th>Khách / công trình</th><th>Nguồn</th><th>Phát sinh</th><th>Hạn</th><th>Gốc</th><th>Còn lại</th><th></th></tr></thead><tbody>{openRows.map((item) => <tr key={item.id}><td>{item.customer_name}<small className="table-subline">{item.site_name ?? "Chưa gắn công trình"}</small></td><td>{item.source_label}</td><td>{new Intl.DateTimeFormat("vi-VN").format(new Date(item.recorded_at))}</td><td>{new Intl.DateTimeFormat("vi-VN").format(new Date(item.due_date))}</td><td className="mono">{formatVnd(vnd(String(item.original_amount_vnd)))}</td><td className="mono"><strong>{formatVnd(vnd(String(item.outstanding_amount_vnd)))}</strong><small className="table-subline">{item.state === "OVERDUE" ? "Quá hạn" : "Còn hạn"}</small></td><td><Link className="code-link" href={`/admin/receivables/${item.id}`}>Chi tiết</Link> · <Link className="code-link" href={`/admin/receivables?customer=${item.customer_id}`}>Ghi thu</Link></td></tr>)}</tbody></table>{!openRows.length && <p className="empty-inline">Không có khoản phải thu đang mở.</p>}</div></section>
  </>;
}
