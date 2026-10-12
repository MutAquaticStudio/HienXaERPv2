import { formatBusinessDate } from "@/lib/core/business-time";
import Link from "next/link";
import { ActionNotice } from "@/components/sales/action-notice";
import { ButtonLink } from "@/components/ui/button-link";
import { ListPager } from "@/components/ui/list-pager";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireInternalPermission } from "@/lib/access/context";
import { CORE_LIST_PAGE_SIZE, parseCoreListQuery, ilikePattern } from "@/lib/core-list";
import { formatVnd, vnd } from "@/lib/core/money";
import { createServerSupabase } from "@/lib/supabase/server";
import { salesStateLabel, salesStateTone } from "@/modules/sales/presentation";

type Quote = { id: string; quotation_number: string; revision_number: number; state: string; total_vnd: string; customer_name_snapshot: string; site_name_snapshot: string; expires_at: string | null; created_at: string };
type Query = { notice?: string; error?: string; q?: string; state?: string; page?: string };

export default async function QuotationsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const access = await requireInternalPermission("quotation.read");
  const query = await searchParams;
  const list = parseCoreListQuery(query);
  const supabase = await createServerSupabase();
  let request = supabase.from("quotation_read").select("id, quotation_number, revision_number, state, total_vnd::text, customer_name_snapshot, site_name_snapshot, expires_at, created_at").eq("branch_id", access.branchId);
  if (list.q) request = request.or(`quotation_number.ilike.${ilikePattern(list.q)},customer_name_snapshot.ilike.${ilikePattern(list.q)},site_name_snapshot.ilike.${ilikePattern(list.q)}`);
  if (list.state) request = request.eq("state", list.state);
  const { data, error } = await request.order("created_at", { ascending: false }).order("id", { ascending: false }).range(list.from, list.to + 1);
  if (error) throw new Error("Không thể tải báo giá.");
  const pageRows = (data ?? []) as Quote[];
  const hasNext = pageRows.length > CORE_LIST_PAGE_SIZE;
  const rows = pageRows.slice(0, CORE_LIST_PAGE_SIZE);
  return <><header className="page-heading"><div><p className="eyebrow">Bán hàng</p><h1>Báo giá</h1><p className="lede">Mỗi lần gửi khóa một phiên bản; xác nhận chấp nhận áp dụng đúng phiên bản khách đã xem.</p></div>{access.permissions.has("quotation.create") && <ButtonLink href="/admin/quotations/new">Tạo báo giá</ButtonLink>}</header><ActionNotice notice={query.notice} error={query.error} />
    <form className="filter-bar"><label>Tìm kiếm<input name="q" defaultValue={list.q} placeholder="Số báo giá, khách, công trình" /></label><label>Trạng thái<select name="state" defaultValue={list.state}><option value="">Tất cả</option><option value="DRAFT">Nháp</option><option value="SENT">Đã gửi</option><option value="ACCEPTED">Đã chấp nhận</option><option value="EXPIRED">Hết hiệu lực</option><option value="CANCELLED">Đã hủy</option></select></label><button className="button button-secondary" type="submit">Áp dụng</button>{(list.q || list.state) && <Link className="code-link" href="/admin/quotations">Xóa lọc</Link>}</form>
    <section className="card"><div className="section-head"><h2>{rows.length} báo giá trên trang này</h2><span className="scope-chip">25 / trang</span></div><div className="table-wrap"><table><thead><tr><th>Số báo giá</th><th>Phiên bản</th><th>Khách hàng / công trình</th><th>Giá trị</th><th>Trạng thái</th><th>Hiệu lực đến</th></tr></thead><tbody>{rows.map((quote) => <tr key={quote.id}><td><Link className="mono code-link" href={`/admin/quotations/${quote.id}`}>{quote.quotation_number}</Link></td><td>R{quote.revision_number}</td><td>{quote.customer_name_snapshot}<small className="table-subline">{quote.site_name_snapshot}</small></td><td className="mono">{formatVnd(vnd(quote.total_vnd))}</td><td><StatusBadge tone={salesStateTone(quote.state)}>{salesStateLabel(quote.state)}</StatusBadge></td><td>{quote.expires_at ? formatBusinessDate(quote.expires_at) : "Không giới hạn"}</td></tr>)}</tbody></table>{!rows.length && <p className="empty-inline">Không có báo giá phù hợp.</p>}</div><ListPager page={list.page} hasNext={hasNext} params={{ q: list.q, state: list.state }} /></section></>;
}
