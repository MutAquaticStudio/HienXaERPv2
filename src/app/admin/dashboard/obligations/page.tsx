import { financeSourceLabel } from "@/modules/finance/presentation";
import Link from "next/link";
import { requireInternalPermission } from "@/lib/access/context";
import { formatVnd, vnd } from "@/lib/core/money";
import { createServerSupabase } from "@/lib/supabase/server";
import { formatBusinessDate, formatBusinessDateTime } from "@/lib/core/business-time";
import { dashboardSnapshotCutoff } from "@/modules/reports/dashboard-snapshot-cutoff";

const PAGE_SIZE = 25;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Query = {
  side?: string;
  customer?: string;
  site?: string;
  sales?: string;
  to?: string;
  page?: string;
};

type Obligation = {
  obligation_id: string;
  party_name: string;
  site_name: string | null;
  source_type: string;
  due_date: string;
  outstanding_amount_vnd: string;
};

function dateInstant(value: string) {
  return `${value}T00:00:00+07:00`;
}

function pageHref(query: Query, page: number) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...query, page: String(page) })) {
    if (value) params.set(key, value);
  }
  return `/admin/dashboard/obligations?${params.toString()}`;
}

export default async function DashboardObligationsPage({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const query = await searchParams;
  const side = query.side === "AP" ? "AP" : "AR";
  const access = await requireInternalPermission(side === "AR" ? "finance.ar.read" : "finance.ap.read");
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const knowledgeCutoff = new Date().toISOString();
  const effectiveCutoff = dashboardSnapshotCutoff(query.to, knowledgeCutoff);
  const customer = side === "AR" && UUID.test(query.customer ?? "") ? query.customer! : null;
  const site = side === "AR" && UUID.test(query.site ?? "") ? query.site! : null;
  const sales = side === "AR" && UUID.test(query.sales ?? "") ? query.sales! : null;
  const supabase = await createServerSupabase();
  const offset = (page - 1) * PAGE_SIZE;
  const { data, error } = await supabase
    .rpc("finance_obligation_snapshot", {
      target_branch_id: access.branchId,
      target_side: side,
      as_of: effectiveCutoff,
      knowledge_cutoff: knowledgeCutoff,
      target_customer_id: customer,
      target_site_id: site,
      target_sales_employee_id: sales,
    })
    .gt("outstanding_amount_vnd", 0)
    .order("outstanding_amount_vnd", { ascending: false })
    .order("obligation_id", { ascending: true })
    .range(offset, offset + PAGE_SIZE);
  const rows = ((data ?? []) as Obligation[]);
  const hasNext = rows.length > PAGE_SIZE;
  const visibleRows = rows.slice(0, PAGE_SIZE);
  const detailBase = side === "AR" ? "/admin/receivables" : "/admin/payables";

  return <>
    <header className="page-heading"><div><p className="eyebrow">Chi tiết tổng quan</p><h1>{side === "AR" ? "Công nợ phải thu tại thời điểm chốt" : "Công nợ phải trả tại thời điểm chốt"}</h1><p className="lede">Số dư tính đến {formatBusinessDateTime(effectiveCutoff)}; giữ nguyên các bộ lọc đã chọn từ Tổng quan.</p></div><Link className="button button-secondary" href="/admin">Về Tổng quan</Link></header>
    {(customer || site || sales) && <p className="report-cutoff">Bộ lọc đang giữ: {customer ? "khách hàng " : ""}{site ? "· công trình " : ""}{sales ? "· nhân viên kinh doanh" : ""}</p>}
    {error && <p className="quality-callout">Không tải được công nợ tại thời điểm chốt. Vui lòng thử lại.</p>}
    <section className="card"><div className="section-head"><h2>{side === "AR" ? "Khách / công trình đang nợ" : "Nhà cung cấp đang phải trả"}</h2><span className="scope-chip">Tối đa {PAGE_SIZE} dòng / trang</span></div><ul className="rank-list">{visibleRows.map((item) => <li key={item.obligation_id}><Link href={`${detailBase}/${item.obligation_id}`}><span><strong>{item.party_name}</strong><small>{item.site_name ? `${item.site_name} · ` : ""}{financeSourceLabel(item.source_type)} · hạn {formatBusinessDate(dateInstant(item.due_date))}</small></span><b>{formatVnd(vnd(String(item.outstanding_amount_vnd)))}</b></Link></li>)}</ul>{!error && !visibleRows.length && <p className="empty-inline">Không có khoản mở trong phạm vi này.</p>}</section>
    <nav className="pager" aria-label="Phân trang"><span>Trang {page}</span><div>{page > 1 && <Link className="button button-secondary" href={pageHref(query, page - 1)}>Trang trước</Link>}{hasNext && <Link className="button button-secondary" href={pageHref(query, page + 1)}>Trang sau</Link>}</div></nav>
  </>;
}
