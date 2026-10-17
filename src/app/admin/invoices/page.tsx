import { randomUUID } from "node:crypto";
import { CommandRecoveryNotice } from "@/components/reliable-command-form";
import { formatVnd, vnd } from "@/lib/core/money";
import { formatBusinessDateTime } from "@/lib/core/business-time";
import { invoiceStateLabel } from "@/modules/invoicing/presentation";
import { financeSourceLabel } from "@/modules/finance/presentation";
import Link from "next/link";
import { InvoiceCommand } from "@/components/invoicing/invoice-command";
import { requireInternalAccess, requireInternalPermission } from "@/lib/access/context";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { InvoiceTabs } from "@/components/finance/finance-tabs";
import { AutoFilterForm } from "@/components/ui/auto-filter-form";

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; page?: string }> }) {
  const params = await searchParams;
  // "Hóa đơn" opens here; an actor who only reads payables lands on the supplier documents tab.
  const base = await requireInternalAccess();
  if (!base.permissions.has("finance.ar.read") && base.permissions.has("finance.ap.read")) redirect("/admin/invoices/purchases");
  const access = await requireInternalPermission("finance.ar.read");
  const supabase = await createServerSupabase();
  const status = ["DRAFT", "BUSINESS_APPROVED", "CANCELLED"].includes(params.status ?? "") ? params.status! : "";
  const q = (params.q ?? "").trim().replace(/[%_]/g, "").slice(0, 80);
  const page = Math.max(1, Math.min(10000, Number.parseInt(params.page ?? "1", 10) || 1));
  let query = supabase.from("invoice_intent_read")
    .select("id,source_obligation_id,customer_name_snapshot,source_type,source_id,source_amount_vnd::text,billing_verified_at,invoice_due_at,status,provider_state,legal_invoice_number,issued_at,created_at", { count: "exact" })
    .eq("branch_id", access.branchId);
  if (status) query = query.eq("status", status);
  if (q) query = query.ilike("customer_name_snapshot", `%${q}%`);
  const [{ data, error, count }, { data: eligible, error: eligibleError }] = await Promise.all([
    query.order("created_at", { ascending: false }).order("id", { ascending: false }).range((page - 1) * 25, page * 25 - 1),
    supabase.rpc("invoice_eligible_sources_exact", { target_branch_id: access.branchId, page_size: 25 }),
  ]);
  if (error || eligibleError) throw error ?? eligibleError;
  const canDraft = access.permissions.has("finance.ar.adjust");
  const queryHref = (target: number) => `/admin/invoices?${new URLSearchParams({ ...(status ? { status } : {}), ...(q ? { q } : {}), page: String(target) })}`;
  return <div className="page-stack">
    <header className="page-heading"><div><p className="eyebrow">Tài chính · chuẩn bị chứng từ</p><h1>Hồ sơ lập hóa đơn</h1><p className="lede">Chứng từ nội bộ, chưa phát hành hóa đơn điện tử.</p></div></header><InvoiceTabs active="/admin/invoices" permissions={access.permissions} />
    <AutoFilterForm aria-label="Bộ lọc hồ sơ hóa đơn"><label>Khách hàng<input name="q" defaultValue={q} placeholder="Tìm tên" /></label><label>Trạng thái<select name="status" defaultValue={status}><option value="">Tất cả</option><option value="DRAFT">Nháp</option><option value="BUSINESS_APPROVED">Đã duyệt nguồn · chờ chính sách phát hành</option><option value="CANCELLED">Đã hủy</option></select></label>{(q || status) && <Link className="code-link" href="/admin/invoices">Xóa lọc</Link>}</AutoFilterForm>
    <section className="card card-pad"><h2>Hồ sơ hiện có</h2><div className="table-wrap"><table><thead><tr><th>Mã hồ sơ</th><th>Khách hàng</th><th>Nguồn</th><th>Số tiền nguồn</th><th>Trạng thái</th><th>Dịch vụ phát hành / pháp lý</th></tr></thead><tbody>{(data ?? []).map((row) => <tr key={row.id}><td><Link className="code-link" href={`/admin/invoices/${row.id}`}>{row.id.slice(0, 8)}</Link></td><td>{row.customer_name_snapshot}</td><td>{financeSourceLabel(row.source_type)} · {row.source_id.slice(0, 8)}</td><td>{formatVnd(vnd(String(row.source_amount_vnd)))}</td><td>{invoiceStateLabel(row.status)}{canDraft && <CommandRecoveryNotice command="create_invoice_draft" scope={`${access.authUserId}:${access.branchId}:invoice:draft:${row.source_obligation_id}`} />}</td><td>Chưa cấu hình · chưa phát hành</td></tr>)}</tbody></table></div>{!data?.length && <p className="empty-inline">Chưa có hồ sơ phù hợp.</p>}
      <nav className="list-pagination"><span>{count ?? 0} hồ sơ · trang {page}</span>{page > 1 && <Link className="button button-secondary" href={queryHref(page - 1)}>Trang trước</Link>}{page * 25 < (count ?? 0) && <Link className="button button-secondary" href={queryHref(page + 1)}>Trang sau</Link>}</nav>
    </section>
    <section className="card card-pad"><h2>Nguồn đã xác minh chưa lập nháp</h2><p className="muted">Thời điểm xác minh khác với hạn xuất hóa đơn; hạn xuất đang chờ chính sách được xác nhận.</p><div className="table-wrap"><table><thead><tr><th>Khách hàng</th><th>Nguồn</th><th>Xác minh</th><th>Số tiền nguồn</th><th>Thao tác</th></tr></thead><tbody>{(eligible ?? []).map((row: { obligation_id: string; customer_name: string; source_type: string; source_id: string; billing_verified_at: string; source_amount_vnd: string }) => <tr key={row.obligation_id}><td>{row.customer_name}</td><td>{financeSourceLabel(row.source_type)} · {row.source_id.slice(0, 8)}</td><td>{formatBusinessDateTime(row.billing_verified_at)}</td><td>{formatVnd(vnd(String(row.source_amount_vnd)))}</td><td>{canDraft ? <InvoiceCommand kind="draft" sourceId={row.obligation_id} operationId={randomUUID()} scope={`${access.authUserId}:${access.branchId}:invoice:draft:${row.obligation_id}`} /> : "Không có quyền lập nháp"}</td></tr>)}</tbody></table></div>{!eligible?.length && <p className="empty-inline">Không có nguồn đủ điều kiện trong trang hiện tại.</p>}</section>
  </div>;
}
