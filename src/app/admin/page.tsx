import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { DashboardDetails, type DashboardDetail } from "@/components/dashboard/dashboard-details";
import { requireInternalPermission } from "@/lib/access/context";
import { formatVnd, vnd } from "@/lib/core/money";
import { createServerSupabase } from "@/lib/supabase/server";

type Quality = "READY" | "INCOMPLETE" | "NOT_APPLICABLE" | "FORBIDDEN" | "UNAVAILABLE";
type Metric = { value_vnd?: string | number | null; value?: string | number | null; quality: Quality };
type Snapshot = {
  scope: { from: string; to: string; as_of: string; branch_id: string };
  revenue: Metric; direct_cost: Metric; gross_profit: Metric; operating_expense: Metric;
  operating_profit: Metric; operating_margin_bps: Metric; receivable: Metric; payable: Metric;
  salary_payable: Metric; commission_payable: Metric;
};
type Receivable = { obligation_id: string; party_name: string; site_name: string | null; outstanding_amount_vnd: string; due_date: string };
type Payable = { obligation_id: string; party_name: string; outstanding_amount_vnd: string; due_date: string };

function localParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}
function monthRange() {
  const current = localParts();
  const year = Number(current.year);
  const month = Number(current.month);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return { from: `${year}-${String(month).padStart(2, "0")}-01`, to: `${nextYear}-${String(nextMonth).padStart(2, "0")}-01` };
}
function instant(date: string) { return `${date}T00:00:00+07:00`; }
function listHref(path: string, params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}
function qualityText(quality: Quality) {
  if (quality === "INCOMPLETE") return "Chưa đủ giá vốn/chi phí";
  if (quality === "NOT_APPLICABLE") return "Chi phí chung chưa phân bổ theo bộ lọc này";
  if (quality === "FORBIDDEN") return "Không có quyền xem";
  if (quality === "UNAVAILABLE") return "Chưa tải được. Thử lại";
  return null;
}
function moneyMetric(metric: Metric) {
  return metric.quality === "READY" && metric.value_vnd != null ? formatVnd(vnd(String(metric.value_vnd))) : "—";
}
function Kpi({ label, metric, children }: { label: string; metric: Metric; children?: ReactNode }) {
  if (metric.quality === "FORBIDDEN") return null;
  return <article className="card metric-card"><span className="metric-label">{label}</span><strong className="metric-value">{children ?? moneyMetric(metric)}</strong>{qualityText(metric.quality) && <span className="metric-note">{qualityText(metric.quality)}</span>}</article>;
}

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; customer?: string; site?: string; sales?: string; activity?: string }> }) {
  const access = await requireInternalPermission("dashboard.read");
  const query = await searchParams;
  const defaults = monthRange();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(query.from ?? "") ? query.from! : defaults.from;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(query.to ?? "") ? query.to! : defaults.to;
  const supabase = await createServerSupabase();
  const cutoff = new Date().toISOString();
  const dashboardArgs = {
    target_branch_id: access.branchId,
    from_inclusive: instant(from),
    to_exclusive: instant(to),
    knowledge_cutoff: cutoff,
    target_customer_id: query.customer || null,
    target_site_id: query.site || null,
    target_sales_employee_id: query.sales || null,
    target_activity_kind: query.activity || null,
  };
  const [snapshotResult, dashboardDetailResult, customerResult, siteResult, salesResult, receivableResult, payableResult, lowStockResult] = await Promise.all([
    supabase.rpc("finance_dashboard_snapshot", dashboardArgs),
    supabase.rpc("finance_dashboard_detail", dashboardArgs),
    supabase.from("customers").select("id, display_name").eq("branch_id", access.branchId).eq("active", true).order("display_name").limit(200),
    supabase.from("customer_sites").select("id, customer_id, name, customers!inner(branch_id)").eq("customers.branch_id", access.branchId).eq("active", true).order("name").limit(300),
    supabase.from("employees").select("id, display_name").eq("active", true).order("display_name").limit(200),
    access.permissions.has("finance.ar.read") ? supabase.rpc("finance_obligation_snapshot", { target_branch_id: access.branchId, target_side: "AR", as_of: instant(to), knowledge_cutoff: cutoff, target_customer_id: query.customer || null, target_site_id: query.site || null, target_sales_employee_id: query.sales || null }).gt("outstanding_amount_vnd", 0).order("outstanding_amount_vnd", { ascending: false }).limit(6) : Promise.resolve({ data: [] }),
    access.permissions.has("finance.ap.read") ? supabase.rpc("finance_obligation_snapshot", { target_branch_id: access.branchId, target_side: "AP", as_of: instant(to), knowledge_cutoff: cutoff, target_customer_id: query.customer || null, target_site_id: query.site || null, target_sales_employee_id: query.sales || null }).gt("outstanding_amount_vnd", 0).order("outstanding_amount_vnd", { ascending: false }).limit(6) : Promise.resolve({ data: [] }),
    access.permissions.has("inventory.read") ? supabase.from("low_stock_alert_read").select("threshold_id", { count: "exact", head: true }).eq("branch_id", access.branchId) : Promise.resolve({ count: 0 }),
  ]);
  const fallback: Snapshot = {
    scope: { from: instant(from), to: instant(to), as_of: new Date().toISOString(), branch_id: access.branchId },
    revenue: { quality: "UNAVAILABLE" }, direct_cost: { quality: "UNAVAILABLE" }, gross_profit: { quality: "UNAVAILABLE" },
    operating_expense: { quality: "UNAVAILABLE" }, operating_profit: { quality: "UNAVAILABLE" }, operating_margin_bps: { quality: "UNAVAILABLE" },
    receivable: { quality: "UNAVAILABLE" }, payable: { quality: "UNAVAILABLE" }, salary_payable: { quality: "INCOMPLETE" }, commission_payable: { quality: "INCOMPLETE" },
  };
  const snapshot = (snapshotResult.data ?? fallback) as Snapshot;
  const receivables = (receivableResult.data ?? []) as Receivable[];
  const payables = (payableResult.data ?? []) as Payable[];
  const profitBars = [
    { label: "Doanh thu", metric: snapshot.revenue },
    { label: "LN gộp quản trị", metric: snapshot.gross_profit },
    { label: "LN hoạt động", metric: snapshot.operating_profit },
  ].filter((item) => item.metric.quality === "READY" && item.metric.value_vnd != null);
  const maxBar = profitBars.reduce((max, item) => {
    const value = BigInt(String(item.metric.value_vnd));
    const absolute = value < 0n ? -value : value;
    return absolute > max ? absolute : max;
  }, 1n);

  return <><header className="page-heading"><div><p className="eyebrow">Finance command center</p><h1>Tổng quan theo nguồn đã ghi nhận</h1><p className="lede">Kỳ phát sinh và số dư tại thời điểm được tách rõ; payment không được tính lại thành revenue.</p></div>{access.permissions.has("finance.ar.read") && <Link className="button button-secondary" href="/admin/cashbook">Mở sổ tiền</Link>}</header>
    {Number(lowStockResult.count ?? 0) > 0 && <Link className="quality-callout" href="/admin/inventory#low-stock-alerts">Có {lowStockResult.count} cảnh báo tồn kho dưới ngưỡng. Mở danh sách và tạo nháp PO khi cần.</Link>}
    <form className="filter-bar"><label>Từ ngày<input type="date" name="from" defaultValue={from} /></label><label>Đến trước ngày<input type="date" name="to" defaultValue={to} /></label><label>Khách hàng<select name="customer" defaultValue={query.customer ?? ""}><option value="">Tất cả</option>{(customerResult.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}</select></label><label>Công trình<select name="site" defaultValue={query.site ?? ""}><option value="">Tất cả</option>{(siteResult.data ?? []).filter((item) => !query.customer || item.customer_id === query.customer).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Sales<select name="sales" defaultValue={query.sales ?? ""}><option value="">Tất cả</option>{(salesResult.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}</select></label><label>Hoạt động<select name="activity" defaultValue={query.activity ?? ""}><option value="">Tất cả</option><option value="DELIVERY">Giao hàng</option><option value="SALES">Bán hàng</option><option value="SERVICE">Dịch vụ</option><option value="ADMIN">Hành chính</option></select></label><button className="button button-primary" type="submit">Làm mới</button></form>
    <p className="report-cutoff">Kỳ {new Intl.DateTimeFormat("vi-VN").format(new Date(instant(from)))} đến trước {new Intl.DateTimeFormat("vi-VN").format(new Date(instant(to)))} · số dư tính đến {new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(snapshot.scope.as_of))}</p>
    <section className="metric-grid finance-metrics"><Kpi label="Doanh thu" metric={snapshot.revenue} /><Kpi label="Lợi nhuận gộp quản trị" metric={snapshot.gross_profit} /><Kpi label="Chi phí vận hành" metric={snapshot.operating_expense} /><Kpi label="Lợi nhuận hoạt động" metric={snapshot.operating_profit} /><Kpi label="Biên lợi nhuận" metric={snapshot.operating_margin_bps}>{snapshot.operating_margin_bps.quality === "READY" && snapshot.operating_margin_bps.value != null ? `${(Number(snapshot.operating_margin_bps.value) / 100).toLocaleString("vi-VN")}%` : "—"}</Kpi></section>
    <section className="card card-pad result-chart"><div className="section-head flush"><h2>Biểu đồ kết quả kinh doanh</h2><span className="scope-chip">Cùng snapshot</span></div>{profitBars.map((item) => { const value = BigInt(String(item.metric.value_vnd)); const absolute = value < 0n ? -value : value; const width = Number((absolute * 100n) / maxBar); return <div className="bar-row" key={item.label}><span>{item.label}</span><div className="bar-track"><i style={{ "--bar-width": `${Math.max(width, 2)}%` } as CSSProperties} /></div><strong>{moneyMetric(item.metric)}</strong></div>; })}{!profitBars.length && <p className="empty-inline">Chưa có metric READY để vẽ; xem lý do tại các KPI.</p>}</section>
    <DashboardDetails detail={(dashboardDetailResult.data as DashboardDetail | null) ?? null} expenseMetric={snapshot.operating_expense} commissionMetric={snapshot.commission_payable} />
    <section className="metric-grid obligations-grid"><Kpi label="Khách hàng phải thu" metric={snapshot.receivable} /><Kpi label="Nhà cung cấp phải trả" metric={snapshot.payable} /><Kpi label="Lương phải chi" metric={snapshot.salary_payable} /><Kpi label="Hoa hồng phải chi" metric={snapshot.commission_payable} /></section>
    <div className="two-column"><section className="card"><div className="section-head"><h2>Khách / công trình đang nợ</h2>{access.permissions.has("finance.ar.read") && <Link className="code-link" href={listHref("/admin/dashboard/obligations", { side: "AR", customer: query.customer, site: query.site, sales: query.sales, to })}>Tất cả</Link>}</div><ul className="rank-list">{receivables.map((item) => <li key={item.obligation_id}><Link href={`/admin/receivables/${item.obligation_id}`}><span><strong>{item.party_name}</strong><small>{item.site_name ?? "Chưa gắn công trình"} · hạn {new Intl.DateTimeFormat("vi-VN").format(new Date(item.due_date))}</small></span><b>{formatVnd(vnd(String(item.outstanding_amount_vnd)))}</b></Link></li>)}</ul>{!receivables.length && <p className="empty-inline">Không có khoản mở hoặc không có quyền xem.</p>}<p className="card-scope-note">Cùng cutoff và bộ lọc với snapshot phía trên.</p></section>
      <section className="card"><div className="section-head"><h2>NCC đang phải trả</h2>{query.customer || query.site || query.sales ? <span className="scope-chip">Không áp dụng theo dimension</span> : access.permissions.has("finance.ap.read") && <Link className="code-link" href={listHref("/admin/dashboard/obligations", { side: "AP", to })}>Tất cả</Link>}</div>{query.customer || query.site || query.sales ? <p className="quality-callout">Danh sách AP không áp bộ lọc khách/công trình/sales nếu nguồn không có dimension chính xác.</p> : <ul className="rank-list">{payables.map((item) => <li key={item.obligation_id}><Link href={`/admin/payables/${item.obligation_id}`}><span><strong>{item.party_name}</strong><small>Hạn {new Intl.DateTimeFormat("vi-VN").format(new Date(item.due_date))}</small></span><b>{formatVnd(vnd(String(item.outstanding_amount_vnd)))}</b></Link></li>)}</ul>} {!payables.length && !query.customer && !query.site && !query.sales && <p className="empty-inline">Không có khoản mở hoặc không có quyền xem.</p>}<p className="card-scope-note">Cùng cutoff với snapshot phía trên.</p></section></div>
  </>;
}
