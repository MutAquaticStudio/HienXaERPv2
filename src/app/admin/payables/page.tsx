import Link from "next/link";
import { randomUUID } from "node:crypto";
import { ActionNotice } from "@/components/sales/action-notice";
import { requireInternalPermission } from "@/lib/access/context";
import { formatVnd, vnd } from "@/lib/core/money";
import { createServerSupabase } from "@/lib/supabase/server";
import { PaymentForm, type PaymentTarget } from "@/modules/finance/payment-form";

type Payable = {
  id: string; supplier_id: string; supplier_name: string; source_label: string; original_amount_vnd: string;
  outstanding_amount_vnd: string; due_date: string; recorded_at: string; state: string;
};
type Account = { id: string; code: string; name: string };

function localNow() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()).replace(" ", "T");
}

export default async function PayablesPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string; payment?: string; supplier?: string; state?: string }> }) {
  const access = await requireInternalPermission("finance.ap.read");
  const query = await searchParams;
  const supabase = await createServerSupabase();
  let request = supabase.from("payable_read").select("id, supplier_id, supplier_name, source_label, original_amount_vnd, outstanding_amount_vnd, due_date, recorded_at, state").eq("branch_id", access.branchId).order("due_date");
  if (query.state === "OVERDUE") request = request.eq("state", "OVERDUE");
  const [{ data }, { data: accountData }] = await Promise.all([
    request,
    supabase.from("finance_accounts").select("id, code, name").eq("branch_id", access.branchId).eq("active", true).order("code"),
  ]);
  const rows = (data ?? []) as Payable[];
  const accounts = (accountData ?? []) as Account[];
  const openRows = rows.filter((item) => BigInt(item.outstanding_amount_vnd) > 0n);
  const selected = query.supplier ? openRows.filter((item) => item.supplier_id === query.supplier) : [];
  const suppliers = [...new Map(openRows.map((item) => [item.supplier_id, item.supplier_name])).entries()];
  const selectedName = selected[0]?.supplier_name;

  return <><header className="page-heading"><div><p className="eyebrow">Finance · AP</p><h1>Phải trả nhà cung cấp</h1><p className="lede">AP theo đúng receipt, supplier fulfillment hoặc expense đã duyệt; không gọi là chi phí.</p></div><div className="action-cluster"><Link className="button button-secondary" href="/admin/expenses">Chi phí</Link><Link className="button button-secondary" href="/admin/cashbook">Sổ tiền</Link></div></header>
    <ActionNotice notice={query.notice} error={query.error} reference={query.payment} />
    <form className="filter-bar"><label>Trạng thái<select name="state" defaultValue={query.state ?? ""}><option value="">Tất cả</option><option value="OVERDUE">Quá hạn</option></select></label><label>Nhà cung cấp<select name="supplier" defaultValue={query.supplier ?? ""}><option value="">Tất cả</option>{suppliers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><button className="button button-secondary" type="submit">Áp dụng</button></form>
    {query.supplier && selectedName && access.permissions.has("finance.payment.post") && accounts.length > 0 && <PaymentForm direction="DISBURSEMENT" partyId={query.supplier} partyName={selectedName} accounts={accounts} obligations={selected.map((item): PaymentTarget => ({ id: item.id, sourceLabel: item.source_label, dueDate: item.due_date, outstandingAmountVnd: item.outstanding_amount_vnd }))} defaultEffectiveAt={localNow()} redirectTo={`/admin/payables?supplier=${query.supplier}`} operationId={randomUUID()} />}
    {query.supplier && selectedName && !accounts.length && <p className="form-message">Cần tạo tài khoản tiền tại Sổ tiền trước khi ghi nhận chi.</p>}
    <section className="card"><div className="section-head"><h2>{openRows.length} khoản còn dư</h2><span className="scope-chip">Hiện tại</span></div><div className="table-wrap"><table><thead><tr><th>Nhà cung cấp</th><th>Nguồn</th><th>Phát sinh</th><th>Hạn</th><th>Gốc</th><th>Còn lại</th><th></th></tr></thead><tbody>{openRows.map((item) => <tr key={item.id}><td>{item.supplier_name}</td><td>{item.source_label}</td><td>{new Intl.DateTimeFormat("vi-VN").format(new Date(item.recorded_at))}</td><td>{new Intl.DateTimeFormat("vi-VN").format(new Date(item.due_date))}</td><td className="mono">{formatVnd(vnd(String(item.original_amount_vnd)))}</td><td className="mono"><strong>{formatVnd(vnd(String(item.outstanding_amount_vnd)))}</strong><small className="table-subline">{item.state === "OVERDUE" ? "Quá hạn" : "Còn hạn"}</small></td><td><Link className="code-link" href={`/admin/payables/${item.id}`}>Chi tiết</Link> · <Link className="code-link" href={`/admin/payables?supplier=${item.supplier_id}`}>Ghi chi</Link></td></tr>)}</tbody></table>{!openRows.length && <p className="empty-inline">Không có khoản phải trả đang mở.</p>}</div></section>
  </>;
}
