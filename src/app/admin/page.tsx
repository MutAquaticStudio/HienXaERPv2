import { formatBusinessDate, formatBusinessDateTime } from "@/lib/core/business-time";
import { Suspense, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { DashboardDetails, type DashboardDetail } from "@/components/dashboard/dashboard-details";
import { requireInternalPermission } from "@/lib/access/context";
import { formatVnd, vnd } from "@/lib/core/money";
import { createServerSupabase } from "@/lib/supabase/server";
import { dashboardSnapshotCutoff } from "@/modules/reports/dashboard-snapshot-cutoff";
import { recordingScopeText } from "@/modules/operations/state";

type Quality = "READY" | "INCOMPLETE" | "NOT_APPLICABLE" | "FORBIDDEN" | "UNAVAILABLE";
type Metric = { value_vnd?: string | number | null; value?: string | number | null; quality: Quality };
type Snapshot = {
  scope: { from: string; to: string; as_of: string; branch_id: string; historical_quality?: string };
  revenue: Metric; direct_cost: Metric; gross_profit: Metric; operating_expense: Metric;
  operating_profit: Metric; operating_margin_bps: Metric; receivable: Metric; payable: Metric;
  salary_payable: Metric; commission_payable: Metric;
};
type Receivable = { obligation_id: string; party_name: string; site_name: string | null; outstanding_amount_vnd: string; due_date: string };
type Payable = { obligation_id: string; party_name: string; outstanding_amount_vnd: string; due_date: string };
type DashboardQuery = { from?: string; to?: string; customer?: string; customerSearch?: string; site?: string; sales?: string; activity?: string; uatTimingNonce?: string };
type DashboardAccess = Awaited<ReturnType<typeof requireInternalPermission>>;
type DashboardArgs = { target_branch_id: string; from_inclusive: string; to_exclusive: string; knowledge_cutoff: string; target_customer_id: string | null; target_site_id: string | null; target_sales_employee_id: string | null; target_activity_kind: string | null };

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
  if (quality === "INCOMPLETE") return "Chưa đủ hoặc chưa khớp giá vốn theo dòng và nguồn";
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

async function LowStockAlert({ access }: { access: DashboardAccess }) {
  if (!access.permissions.has("inventory.read")) return null;
  const supabase = await createServerSupabase();
  const { count } = await supabase.from("low_stock_alert_read").select("threshold_id", { count: "exact", head: true }).eq("branch_id", access.branchId);
  return Number(count ?? 0) > 0 ? <Link className="quality-callout" href="/admin/inventory#low-stock-alerts">Có {count} cảnh báo tồn kho dưới ngưỡng. Mở danh sách và tạo đơn mua nháp khi cần.</Link> : null;
}

async function DashboardFilters({ access, query, from, to }: { access: DashboardAccess; query: DashboardQuery; from: string; to: string }) {
  const supabase = await createServerSupabase();
  const customerSearch = query.customerSearch?.trim().slice(0, 120) ?? "";
  let customerRequest = supabase.from("customers").select("id, display_name").eq("branch_id", access.branchId).eq("active", true);
  if (customerSearch) customerRequest = customerRequest.ilike("display_name", `%${customerSearch.replace(/[\\%_]/g, "\\$&")}%`);
  const [customerResult, selectedCustomerResult, siteResult, salesResult] = await Promise.all([
    customerRequest.order("display_name").order("id").limit(200),
    query.customer ? supabase.from("customers").select("id, display_name").eq("branch_id", access.branchId).eq("active", true).eq("id", query.customer).maybeSingle() : Promise.resolve({ data: null, error: null }),
    supabase.rpc("dashboard_site_options", { target_branch_id: access.branchId }),
    supabase.from("employees").select("id, display_name").eq("active", true).order("display_name").limit(200),
  ]);
  const customers = [...(customerResult.data ?? [])];
  const selectedCustomer = selectedCustomerResult.data;
  if (selectedCustomer && !customers.some((item) => item.id === selectedCustomer.id)) customers.unshift(selectedCustomer);
  const siteOptions = (siteResult.data ?? []) as Array<{ id: string; customer_id: string; name: string }>;
  return <form className="filter-bar" method="get" data-uat-dashboard-filters={(customerResult.error || selectedCustomerResult.error || siteResult.error || salesResult.error) ? "error" : "ready"}><label>Từ ngày<input type="date" name="from" defaultValue={from} /></label><label>Đến trước ngày<input type="date" name="to" defaultValue={to} /></label><label>Tìm khách hàng<input type="search" name="customerSearch" defaultValue={customerSearch} maxLength={120} placeholder="Nhập tên khách rồi bấm Tìm khách" /></label><button className="button button-secondary" type="submit">Tìm khách</button><label>Khách hàng<select name="customer" defaultValue={query.customer ?? ""}><option value="">Tất cả</option>{customers.map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}</select></label><label>Công trình<select name="site" defaultValue={query.site ?? ""}><option value="">Tất cả</option>{siteOptions.filter((item) => !query.customer || item.customer_id === query.customer).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Nhân viên bán hàng<select name="sales" defaultValue={query.sales ?? ""}><option value="">Tất cả</option>{(salesResult.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}</select></label><label>Hoạt động<select name="activity" defaultValue={query.activity ?? ""}><option value="">Tất cả</option><option value="DELIVERY">Giao hàng</option><option value="SALES">Bán hàng</option><option value="SERVICE">Dịch vụ</option><option value="ADMIN">Hành chính</option></select></label><button className="button button-primary" type="submit">Làm mới</button>{(customerResult.error || selectedCustomerResult.error) && <p role="status">Không thể tải danh sách khách hàng. Hãy thử lại.</p>}{!customerResult.error && customerSearch && customerResult.data?.length === 0 && <p role="status">Không tìm thấy khách phù hợp; khách đang chọn vẫn được giữ.</p>}{customerResult.data?.length === 200 && <p className="muted">Danh sách có giới hạn; hãy nhập tên cụ thể hơn để tìm khách chưa hiển thị.</p>}</form>;
}

async function DashboardSecondary({ access, query, to, dashboardArgs, snapshot }: { access: DashboardAccess; query: DashboardQuery; to: string; dashboardArgs: DashboardArgs; snapshot: Snapshot }) {
  const supabase = await createServerSupabase();
  const effectiveCutoff = dashboardSnapshotCutoff(to, dashboardArgs.knowledge_cutoff);
  const [dashboardDetailResult, receivableResult, payableResult] = await Promise.all([
    supabase.rpc("finance_dashboard_detail", dashboardArgs),
    access.permissions.has("finance.ar.read") ? supabase.rpc("finance_obligation_snapshot", { target_branch_id: access.branchId, target_side: "AR", as_of: effectiveCutoff, knowledge_cutoff: dashboardArgs.knowledge_cutoff, target_customer_id: query.customer || null, target_site_id: query.site || null, target_sales_employee_id: query.sales || null }).select("obligation_id,party_id,party_name,site_id,site_name,source_type,source_id,due_date,outstanding_amount_vnd::text").gt("outstanding_amount_vnd", 0).order("outstanding_amount_vnd", { ascending: false }).limit(6) : Promise.resolve({ data: [] }),
    access.permissions.has("finance.ap.read") ? supabase.rpc("finance_obligation_snapshot", { target_branch_id: access.branchId, target_side: "AP", as_of: effectiveCutoff, knowledge_cutoff: dashboardArgs.knowledge_cutoff, target_customer_id: query.customer || null, target_site_id: query.site || null, target_sales_employee_id: query.sales || null }).select("obligation_id,party_id,party_name,site_id,site_name,source_type,source_id,due_date,outstanding_amount_vnd::text").gt("outstanding_amount_vnd", 0).order("outstanding_amount_vnd", { ascending: false }).limit(6) : Promise.resolve({ data: [] }),
  ]);
  const receivables = (receivableResult.data ?? []) as Receivable[];
  const payables = (payableResult.data ?? []) as Payable[];
  return <div style={{ display: "contents" }} data-uat-dashboard-content={dashboardDetailResult.error || !dashboardDetailResult.data || ("error" in receivableResult && receivableResult.error) || ("error" in payableResult && payableResult.error) ? "error" : "ready"}>
    <DashboardDetails detail={(dashboardDetailResult.data as DashboardDetail | null) ?? null} expenseMetric={snapshot.operating_expense} commissionMetric={snapshot.commission_payable} />
    <section className="metric-grid obligations-grid"><Kpi label="Khách hàng phải thu" metric={snapshot.receivable} /><Kpi label="Nhà cung cấp phải trả" metric={snapshot.payable} /><Kpi label="Lương phải chi" metric={snapshot.salary_payable} /><Kpi label="Hoa hồng phải chi" metric={snapshot.commission_payable} /></section>
    <div className="two-column"><section className="card"><div className="section-head"><h2>Khách / công trình đang nợ</h2>{access.permissions.has("finance.ar.read") && <Link className="code-link" href={listHref("/admin/dashboard/obligations", { side: "AR", customer: query.customer, site: query.site, sales: query.sales, to })}>Tất cả</Link>}</div><ul className="rank-list">{receivables.map((item) => <li key={item.obligation_id}><Link href={`/admin/receivables/${item.obligation_id}`}><span><strong>{item.party_name}</strong><small>{item.site_name ?? "Chưa gắn công trình"} · hạn {formatBusinessDate(item.due_date)}</small></span><b>{formatVnd(vnd(String(item.outstanding_amount_vnd)))}</b></Link></li>)}</ul>{!receivables.length && <p className="empty-inline">Không có khoản mở hoặc không có quyền xem.</p>}<p className="card-scope-note">Cùng thời điểm chốt và bộ lọc với các chỉ số phía trên.</p></section>
      <section className="card"><div className="section-head"><h2>Nhà cung cấp đang phải trả</h2>{query.customer || query.site || query.sales ? <span className="scope-chip">Không áp dụng bộ lọc này</span> : access.permissions.has("finance.ap.read") && <Link className="code-link" href={listHref("/admin/dashboard/obligations", { side: "AP", to })}>Tất cả</Link>}</div>{query.customer || query.site || query.sales ? <p className="quality-callout">Công nợ nhà cung cấp không áp dụng bộ lọc khách hàng, công trình hoặc nhân viên bán hàng khi chưa có dữ liệu liên kết chính xác.</p> : <ul className="rank-list">{payables.map((item) => <li key={item.obligation_id}><Link href={`/admin/payables/${item.obligation_id}`}><span><strong>{item.party_name}</strong><small>Hạn {formatBusinessDate(item.due_date)}</small></span><b>{formatVnd(vnd(String(item.outstanding_amount_vnd)))}</b></Link></li>)}</ul>} {!payables.length && !query.customer && !query.site && !query.sales && <p className="empty-inline">Không có khoản mở hoặc không có quyền xem.</p>}<p className="card-scope-note">Cùng thời điểm chốt với các chỉ số phía trên.</p></section></div>
  </div>;
}

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<DashboardQuery> }) {
  const access = await requireInternalPermission("dashboard.read");
  const query = await searchParams;
  const defaults = monthRange();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(query.from ?? "") ? query.from! : defaults.from;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(query.to ?? "") ? query.to! : defaults.to;
  const supabase = await createServerSupabase();
  const cutoff = new Date().toISOString();
  const effectiveCutoff = dashboardSnapshotCutoff(to, cutoff);
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
  const snapshotResult = await supabase.rpc("finance_dashboard_snapshot", dashboardArgs);
  const fallback: Snapshot = {
    scope: { from: instant(from), to: instant(to), as_of: effectiveCutoff, branch_id: access.branchId },
    revenue: { quality: "UNAVAILABLE" }, direct_cost: { quality: "UNAVAILABLE" }, gross_profit: { quality: "UNAVAILABLE" },
    operating_expense: { quality: "UNAVAILABLE" }, operating_profit: { quality: "UNAVAILABLE" }, operating_margin_bps: { quality: "UNAVAILABLE" },
    receivable: { quality: "UNAVAILABLE" }, payable: { quality: "UNAVAILABLE" }, salary_payable: { quality: "INCOMPLETE" }, commission_payable: { quality: "INCOMPLETE" },
  };
  const snapshot = (snapshotResult.data ?? fallback) as Snapshot;
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

  return <><header className="page-heading" data-uat-dashboard-request={typeof query.uatTimingNonce === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(query.uatTimingNonce) ? query.uatTimingNonce : ""}><div><p className="eyebrow">Tổng quan kinh doanh</p><h1>Tổng quan</h1><p className="lede">Doanh thu theo kỳ và công nợ tại thời điểm đã chọn. Thu tiền không làm tăng doanh thu lần nữa.</p></div>{access.permissions.has("finance.ar.read") && <Link className="button button-secondary" href="/admin/cashbook">Mở sổ tiền</Link>}</header>
    <Suspense fallback={null}><LowStockAlert access={access} /></Suspense>
    <Suspense fallback={<section className="card card-pad"><p className="muted">Đang tải bộ lọc...</p></section>}><DashboardFilters access={access} query={query} from={from} to={to} /></Suspense>
    <p className="report-cutoff">Kỳ {formatBusinessDate(instant(from))} đến trước {formatBusinessDate(instant(to))} · số dư tính đến {formatBusinessDateTime(effectiveCutoff)}</p>
    <p className="quality-callout" data-recording-scope="RECORDED_TRANSACTIONS">{recordingScopeText(snapshot.scope.historical_quality)}</p>
    <section className="metric-grid finance-metrics" data-uat-dashboard-kpi={snapshotResult.error || !snapshotResult.data ? "error" : "ready"}><Kpi label="Doanh thu" metric={snapshot.revenue} /><Kpi label="Lợi nhuận gộp quản trị" metric={snapshot.gross_profit} /><Kpi label="Chi phí vận hành" metric={snapshot.operating_expense} /><Kpi label="Lợi nhuận hoạt động" metric={snapshot.operating_profit} /><Kpi label="Biên lợi nhuận" metric={snapshot.operating_margin_bps}>{snapshot.operating_margin_bps.quality === "READY" && snapshot.operating_margin_bps.value != null ? `${(Number(snapshot.operating_margin_bps.value) / 100).toLocaleString("vi-VN")}%` : "—"}</Kpi></section>
    <section className="card card-pad result-chart"><div className="section-head flush"><h2>Biểu đồ kết quả kinh doanh</h2><span className="scope-chip">Cùng kỳ và phạm vi</span></div>{profitBars.map((item) => { const value = BigInt(String(item.metric.value_vnd)); const absolute = value < 0n ? -value : value; const width = Number((absolute * 100n) / maxBar); return <div className="bar-row" key={item.label}><span>{item.label}</span><div className="bar-track" aria-hidden="true"><i style={{ "--bar-width": `${Math.max(width, 2)}%` } as CSSProperties} /></div><strong>{moneyMetric(item.metric)}</strong></div>; })}{!profitBars.length && <p className="empty-inline">Chưa có chỉ số đủ điều kiện hiển thị biểu đồ. Xem thông báo tại từng chỉ số.</p>}</section>
    <Suspense fallback={<section className="card card-pad"><p className="muted">Đang tải phân tích và công nợ chi tiết...</p></section>}><DashboardSecondary access={access} query={query} to={to} dashboardArgs={dashboardArgs} snapshot={snapshot} /></Suspense>
  </>;
}
