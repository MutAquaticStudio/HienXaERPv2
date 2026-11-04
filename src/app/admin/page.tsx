import { formatBusinessDate, formatBusinessDateTime } from "@/lib/core/business-time";
import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { DashboardDetails, type DashboardDetail } from "@/components/dashboard/dashboard-details";
import { ProfitLineChart } from "@/components/dashboard/profit-line-chart";
import { TodayList } from "@/components/dashboard/today-list";
import { MetricNumber } from "@/components/ui/metric-number";
import { requireInternalPermission } from "@/lib/access/context";
import { formatVnd, vnd } from "@/lib/core/money";
import { createServerSupabase } from "@/lib/supabase/server";
import { dashboardSnapshotCutoff } from "@/modules/reports/dashboard-snapshot-cutoff";
import { readyValue, totalCostMetric, type ProfitSeries } from "@/modules/reports/profit-series";
import { recordingScopeText } from "@/modules/operations/state";
import { AutoFilterForm } from "@/components/ui/auto-filter-form";
import { CASHBOOK_PERMISSIONS } from "@/lib/access/policy";
import { loadTodayFacts, todayItems } from "@/modules/dashboard/today";
import { changeAgainst, loadAccountBalances, loadDebtAging, loadDeliveryDay, loadSalesByGroup } from "@/modules/dashboard/overview";
import { shortVnd } from "@/modules/dashboard/format";

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
type DashboardQuery = { from?: string; to?: string; customer?: string; customerSearch?: string; site?: string; sales?: string; activity?: string; chart?: string; uatTimingNonce?: string };
type DashboardAccess = Awaited<ReturnType<typeof requireInternalPermission>>;
type DashboardArgs = { target_branch_id: string; from_inclusive: string; to_exclusive: string; knowledge_cutoff: string; target_customer_id: string | null; target_site_id: string | null; target_sales_employee_id: string | null; target_activity_kind: string | null };

const DAY = 86_400_000;
const iso = (time: number) => new Date(time).toISOString().slice(0, 10);
const dateTime = (date: string) => Date.parse(`${date}T00:00:00Z`);
function today() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date()); }
function monthRange() {
  const [year, month] = today().split("-").map(Number);
  return { from: `${year}-${String(month).padStart(2, "0")}-01`, to: month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01` };
}
/** Quick periods (D56): today, this week (Monday first), this month, this year — `to` is exclusive. */
function presets() {
  const day = today();
  const weekday = (new Date(dateTime(day)).getUTCDay() + 6) % 7;
  const monday = iso(dateTime(day) - weekday * DAY);
  const month = monthRange();
  const year = day.slice(0, 4);
  return [
    { label: "Hôm nay", from: day, to: iso(dateTime(day) + DAY) },
    { label: "Tuần này", from: monday, to: iso(dateTime(monday) + 7 * DAY) },
    { label: "Tháng này", ...month },
    { label: "Năm nay", from: `${year}-01-01`, to: `${Number(year) + 1}-01-01` },
  ];
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
const ready = (metric: Metric | undefined) => readyValue(metric as never);

/** One figure of the key-number strip: the short amount (exact one in its title) and a comparison or a margin line. */
function Figure({ label, metric, note, children }: { label: string; metric: Metric; note?: ReactNode; children?: ReactNode }) {
  if (metric.quality === "FORBIDDEN") return null;
  const value = ready(metric);
  return <article className="dash-figure">
    <span className="metric-label">{label}</span>
    <strong className="dash-figure-value" title={value === null ? undefined : formatVnd(vnd(value.toString()))}>{children ?? (value === null ? "—" : <MetricNumber value={shortVnd(value)} />)}</strong>
    {qualityText(metric.quality) ? <span className="metric-note">{qualityText(metric.quality)}</span> : note}
  </article>;
}
function Change({ current, previous, risingIsBad = false }: { current: Metric; previous: Metric | null; risingIsBad?: boolean }) {
  const change = changeAgainst(ready(current), previous ? ready(previous) : null);
  if (!change) return <span className="dash-figure-note">Chưa có kỳ trước để so</span>;
  const bad = change.up === risingIsBad && change.percent > 0;
  return <span className={`dash-figure-note dash-change${bad ? " bad" : change.percent ? " good" : ""}`}>
    <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true" style={{ transform: change.up ? undefined : "rotate(180deg)" }}><path d="M6 2 10 8H2z" fill="currentColor" /></svg>
    {change.up ? "Tăng" : "Giảm"} {change.percent.toLocaleString("vi-VN")}% so với kỳ trước</span>;
}
function margin(part: Metric, whole: Metric) {
  const numerator = ready(part), denominator = ready(whole);
  if (numerator === null || denominator === null || denominator <= 0n) return null;
  return `${(Number((numerator * 1000n) / denominator) / 10).toLocaleString("vi-VN")}%`;
}

async function TodayPanel({ access }: { access: DashboardAccess }) {
  const supabase = await createServerSupabase();
  const items = todayItems(await loadTodayFacts(supabase, access.branchId, access.permissions));
  const total = items.reduce((sum, item) => sum + item.count, 0);
  return <section className="card dash-today" aria-labelledby="dash-today-title">
    <div className="section-head"><h2 id="dash-today-title">Cần xử lý hôm nay</h2>{total > 0 && <span className="dash-today-total">{total} việc</span>}</div>
    <TodayList items={items} />
  </section>;
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
  return <AutoFilterForm aria-label="Bộ lọc tổng quan" data-uat-dashboard-filters={(customerResult.error || selectedCustomerResult.error || siteResult.error || salesResult.error) ? "error" : "ready"}>{query.chart && <input type="hidden" name="chart" value={query.chart} />}<label>Từ ngày<input type="date" name="from" defaultValue={from} /></label><label>Đến trước ngày<input type="date" name="to" defaultValue={to} /></label><label>Tìm khách hàng<input type="search" name="customerSearch" defaultValue={customerSearch} maxLength={120} placeholder="Gõ tên để lọc danh sách khách" /></label><label>Khách hàng<select name="customer" defaultValue={query.customer ?? ""}><option value="">Tất cả</option>{customers.map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}</select></label><label>Công trình<select name="site" defaultValue={query.site ?? ""}><option value="">Tất cả</option>{siteOptions.filter((item) => !query.customer || item.customer_id === query.customer).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Nhân viên bán hàng<select name="sales" defaultValue={query.sales ?? ""}><option value="">Tất cả</option>{(salesResult.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}</select></label><label>Hoạt động<select name="activity" defaultValue={query.activity ?? ""}><option value="">Tất cả</option><option value="DELIVERY">Giao hàng</option><option value="SALES">Bán hàng</option><option value="SERVICE">Dịch vụ</option><option value="ADMIN">Hành chính</option></select></label>{(customerResult.error || selectedCustomerResult.error) && <p role="status">Không thể tải danh sách khách hàng. Hãy thử lại.</p>}{!customerResult.error && customerSearch && customerResult.data?.length === 0 && <p role="status">Không tìm thấy khách phù hợp; khách đang chọn vẫn được giữ.</p>}{customerResult.data?.length === 200 && <p className="muted">Danh sách có giới hạn; hãy nhập tên cụ thể hơn để tìm khách chưa hiển thị.</p>}</AutoFilterForm>;
}

const CHART_STEPS = [{ key: "day", label: "Ngày" }, { key: "week", label: "Tuần" }, { key: "month", label: "Tháng" }] as const;
/** The chart's own window ending where the period ends: the period by day (31 days at most), 12 weeks, or 12 months. */
function chartRange(step: string, from: string, to: string) {
  if (step === "day") return { from: dateTime(to) - dateTime(from) > 31 * DAY ? iso(dateTime(to) - 31 * DAY) : from, to };
  if (step === "month") {
    const [year, month] = iso(dateTime(to) - DAY).split("-").map(Number);
    return { from: iso(Date.UTC(year, month - 12, 1)), to };
  }
  return { from: iso(dateTime(to) - 84 * DAY), to };
}

async function ProfitChartSection({ dashboardArgs, query, from, to }: { dashboardArgs: DashboardArgs; query: DashboardQuery; from: string; to: string }) {
  const supabase = await createServerSupabase();
  const step = CHART_STEPS.some((item) => item.key === query.chart) ? query.chart! : "week";
  const range = chartRange(step, from, to);
  const { data, error } = await supabase.rpc("finance_dashboard_series", { ...dashboardArgs, from_inclusive: instant(range.from), to_exclusive: instant(range.to) });
  const tooLong = error?.message?.includes("report_period_too_long");
  return <section className="card card-pad result-chart dash-chart" data-uat-dashboard-chart={error ? "error" : "ready"} aria-labelledby="dash-chart-title">
    <div className="section-head flush"><h2 id="dash-chart-title">Thu và chi theo {step === "day" ? "ngày" : step === "week" ? "tuần" : "tháng"}</h2>
      <nav className="segmented" aria-label="Độ chia biểu đồ">{CHART_STEPS.map((item) => <Link key={item.key} href={listHref("/admin", { ...query, uatTimingNonce: undefined, chart: item.key })} aria-current={item.key === step ? "true" : undefined} scroll={false}>{item.label}</Link>)}</nav></div>
    {error ? <p className="empty-inline">{tooLong ? "Kỳ quá dài để vẽ biểu đồ. Hãy chọn độ chia khác." : "Chưa tải được biểu đồ. Thử lại."}</p>
      : <ProfitLineChart series={data as ProfitSeries} bars />}
  </section>;
}

async function OperationsRow({ access, from, to }: { access: DashboardAccess; from: string; to: string }) {
  const supabase = await createServerSupabase();
  const [deliveries, groups, aging] = await Promise.all([
    access.permissions.has("delivery.read") ? loadDeliveryDay(supabase, access.branchId).catch(() => null) : Promise.resolve(undefined),
    access.permissions.has("orders.read") ? loadSalesByGroup(supabase, access.branchId, from, to).catch(() => null) : Promise.resolve(undefined),
    access.permissions.has("finance.ar.read") ? loadDebtAging(supabase, access.branchId).catch(() => null) : Promise.resolve(undefined),
  ]);
  const deliverySegments = deliveries ? [
    { key: "waiting", label: "Chờ phân giao", value: deliveries.waiting, className: "seg-waiting" },
    { key: "assigned", label: "Đã phân giao", value: deliveries.assigned, className: "seg-assigned" },
    { key: "onTheWay", label: "Đang giao", value: deliveries.onTheWay, className: "seg-moving" },
    { key: "done", label: "Đã giao", value: deliveries.done, className: "seg-done" },
  ] : [];
  const agingSegments = aging ? [
    { key: "notDue", label: "Chưa đến hạn", value: aging.notDueVnd, className: "age-0" },
    { key: "late30", label: "Quá hạn 1–30 ngày", value: aging.late30Vnd, className: "age-1" },
    { key: "late60", label: "31–60 ngày", value: aging.late60Vnd, className: "age-2" },
    { key: "late90", label: "Trên 60 ngày", value: aging.late90Vnd, className: "age-3" },
  ] : [];
  const largest = groups?.[0]?.amountVnd ?? 0n;
  return <div className="dash-row-3">
    {deliveries !== undefined && <section className="card card-pad dash-panel" aria-labelledby="dash-delivery">
      <div className="section-head flush"><h2 id="dash-delivery">Giao hàng hôm nay</h2><Link className="code-link" href="/admin/dispatch">Điều phối</Link></div>
      {deliveries === null ? <p className="empty-inline">Chưa tải được phiếu giao hôm nay.</p> : <>
        <p className="dash-panel-total"><strong>{deliveries.total}</strong> phiếu{deliveries.done ? ` · ${deliveries.done} đã giao` : ""}</p>
        {deliveries.total > 0 && <div className="seg-bar" role="img" aria-label={deliverySegments.map((item) => `${item.label} ${item.value}`).join(", ")}>
          {deliverySegments.filter((item) => item.value > 0).map((item) => <span key={item.key} className={item.className} style={{ flexGrow: item.value }} title={`${item.label}: ${item.value}`} />)}</div>}
        <ul className="seg-legend">{deliverySegments.map((item) => <li key={item.key}><i className={item.className} aria-hidden="true" />{item.label}<strong>{item.value}</strong></li>)}</ul>
      </>}
    </section>}
    {groups !== undefined && <section className="card card-pad dash-panel" aria-labelledby="dash-groups">
      <div className="section-head flush"><h2 id="dash-groups">Doanh thu theo nhóm hàng</h2><Link className="code-link" href={listHref("/admin/reports", { report: "GOODS_SALES", from, to: iso(dateTime(to) - DAY) })}>Báo cáo</Link></div>
      {groups === null ? <p className="empty-inline">Chưa tải được doanh thu theo nhóm hàng.</p> : !groups.length ? <p className="empty-inline">Chưa có hàng giao xong trong kỳ.</p>
        : <ul className="bar-list">{groups.map((group) => <li key={group.name} title={`${group.name}: ${formatVnd(vnd(group.amountVnd.toString()))}`}>
          <span className="bar-list-head"><span>{group.name}</span><strong>{shortVnd(group.amountVnd)} · {group.share.toLocaleString("vi-VN")}%</strong></span>
          <span className="bar-track"><span style={{ width: `${largest > 0n ? Math.max(2, Number((group.amountVnd * 1000n) / largest) / 10) : 0}%` }} /></span>
        </li>)}</ul>}
    </section>}
    {aging !== undefined && <section className="card card-pad dash-panel" aria-labelledby="dash-aging">
      <div className="section-head flush"><h2 id="dash-aging">Khách đang nợ</h2><Link className="code-link" href="/admin/receivables">Công nợ</Link></div>
      {aging === null ? <p className="empty-inline">Chưa tải được công nợ khách.</p> : aging.totalVnd === 0n ? <p className="empty-inline">Không có khách còn nợ.</p> : <>
        <p className="dash-panel-total"><strong>{shortVnd(aging.totalVnd)}</strong> · {aging.customers} khách</p>
        <div className="seg-bar" role="img" aria-label={agingSegments.map((item) => `${item.label} ${formatVnd(vnd(item.value.toString()))}`).join("; ")}>
          {agingSegments.filter((item) => item.value > 0n).map((item) => <span key={item.key} className={item.className} style={{ flexGrow: Number(item.value / 1000n) || 1 }} title={`${item.label}: ${formatVnd(vnd(item.value.toString()))}`} />)}</div>
        <ul className="seg-legend">{agingSegments.map((item) => <li key={item.key}><i className={item.className} aria-hidden="true" />{item.label}<strong>{shortVnd(item.value)}</strong></li>)}</ul>
        <p className="card-scope-note">Toàn chi nhánh, tính đến hôm nay.</p>
      </>}
    </section>}
  </div>;
}

async function DashboardSecondary({ access, query, to, dashboardArgs, snapshot }: { access: DashboardAccess; query: DashboardQuery; to: string; dashboardArgs: DashboardArgs; snapshot: Snapshot }) {
  const supabase = await createServerSupabase();
  const effectiveCutoff = dashboardSnapshotCutoff(to, dashboardArgs.knowledge_cutoff);
  const canCash = access.permissions.has("finance.ar.read") && CASHBOOK_PERMISSIONS.some((permission) => access.permissions.has(permission));
  const [dashboardDetailResult, receivableResult, payableResult, balances] = await Promise.all([
    supabase.rpc("finance_dashboard_detail", dashboardArgs),
    access.permissions.has("finance.ar.read") ? supabase.rpc("finance_obligation_snapshot", { target_branch_id: access.branchId, target_side: "AR", as_of: effectiveCutoff, knowledge_cutoff: dashboardArgs.knowledge_cutoff, target_customer_id: query.customer || null, target_site_id: query.site || null, target_sales_employee_id: query.sales || null }).select("obligation_id,party_id,party_name,site_id,site_name,source_type,source_id,due_date,outstanding_amount_vnd::text").gt("outstanding_amount_vnd", 0).order("outstanding_amount_vnd", { ascending: false }).limit(5) : Promise.resolve({ data: [] }),
    access.permissions.has("finance.ap.read") ? supabase.rpc("finance_obligation_snapshot", { target_branch_id: access.branchId, target_side: "AP", as_of: effectiveCutoff, knowledge_cutoff: dashboardArgs.knowledge_cutoff, target_customer_id: query.customer || null, target_site_id: query.site || null, target_sales_employee_id: query.sales || null }).select("obligation_id,party_id,party_name,site_id,site_name,source_type,source_id,due_date,outstanding_amount_vnd::text").gt("outstanding_amount_vnd", 0).order("outstanding_amount_vnd", { ascending: false }).limit(3) : Promise.resolve({ data: [] }),
    canCash ? loadAccountBalances(supabase, access.branchId).catch(() => null) : Promise.resolve(undefined),
  ]);
  const receivables = (receivableResult.data ?? []) as Receivable[];
  const payables = (payableResult.data ?? []) as Payable[];
  const now = today();
  const filtered = !!(query.customer || query.site || query.sales);
  const obligation = (label: string, metric: Metric) => metric.quality === "FORBIDDEN" ? null
    : <div className="money-tile"><span>{label}</span><strong>{ready(metric) === null ? "—" : formatVnd(vnd(ready(metric)!.toString()))}</strong>{qualityText(metric.quality) && <small>{qualityText(metric.quality)}</small>}</div>;
  return <div style={{ display: "contents" }} data-uat-dashboard-content={dashboardDetailResult.error || !dashboardDetailResult.data || ("error" in receivableResult && receivableResult.error) || ("error" in payableResult && payableResult.error) ? "error" : "ready"}>
    <div className="dash-row-2">
      <section className="card" aria-labelledby="dash-debtors"><div className="section-head"><h2 id="dash-debtors">Khách / công trình nợ nhiều nhất</h2>{access.permissions.has("finance.ar.read") && <Link className="code-link" href={listHref("/admin/dashboard/obligations", { side: "AR", customer: query.customer, site: query.site, sales: query.sales, to })}>Tất cả</Link>}</div>
        <ul className="rank-list">{receivables.map((item) => <li key={item.obligation_id}><Link href={`/admin/receivables/${item.obligation_id}`}><span><strong>{item.party_name}</strong><small>{item.site_name ?? "Chưa gắn công trình"} · hạn {formatBusinessDate(item.due_date)}{item.due_date < now ? " · quá hạn" : ""}</small></span><b>{formatVnd(vnd(String(item.outstanding_amount_vnd)))}</b></Link></li>)}</ul>
        {!receivables.length && <p className="empty-inline">Không có khoản mở hoặc không có quyền xem.</p>}<p className="card-scope-note">Cùng thời điểm chốt và bộ lọc với các chỉ số phía trên.</p></section>
      <section className="card" aria-labelledby="dash-money"><div className="section-head"><h2 id="dash-money">Tiền và nghĩa vụ</h2>{canCash && <Link className="code-link" href="/admin/cashbook">Sổ quỹ</Link>}</div>
        <div className="money-grid">
          {balances === null && <p className="empty-inline">Chưa tải được số dư quỹ.</p>}
          {(balances ?? []).map((account) => <div className="money-tile" key={account.id}><span>{account.name}</span><strong>{formatVnd(vnd(account.balanceVnd.toString()))}</strong><small>{account.kind === "CASH" ? "Tiền mặt" : "Ngân hàng"} · số dư hiện tại</small></div>)}
          {obligation("Phải trả nhà cung cấp", snapshot.payable)}
          {obligation("Lương phải chi", snapshot.salary_payable)}
          {obligation("Hoa hồng phải chi", snapshot.commission_payable)}
        </div>
        {filtered ? <p className="card-scope-note">Công nợ nhà cung cấp không áp dụng bộ lọc khách hàng, công trình hoặc nhân viên bán hàng.</p>
          : payables.length > 0 && <ul className="rank-list">{payables.map((item) => <li key={item.obligation_id}><Link href={`/admin/payables/${item.obligation_id}`}><span><strong>{item.party_name}</strong><small>Hạn {formatBusinessDate(item.due_date)}{item.due_date < now ? " · quá hạn" : ""}</small></span><b>{formatVnd(vnd(String(item.outstanding_amount_vnd)))}</b></Link></li>)}</ul>}
      </section>
    </div>
    <DashboardDetails detail={(dashboardDetailResult.data as DashboardDetail | null) ?? null} expenseMetric={snapshot.operating_expense} commissionMetric={snapshot.commission_payable} />
  </div>;
}

/** D56: what needs doing today first, then the period's key numbers, Thu / Chi, today's deliveries, sales by group and debts. */
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
  // The same filters over the period of the same length just before, for "so với kỳ trước".
  const length = dateTime(to) - dateTime(from);
  const previousArgs = { ...dashboardArgs, from_inclusive: instant(iso(dateTime(from) - length)), to_exclusive: instant(from) };
  const [snapshotResult, previousResult] = await Promise.all([
    supabase.rpc("finance_dashboard_snapshot", dashboardArgs),
    supabase.rpc("finance_dashboard_snapshot", previousArgs),
  ]);
  const fallback: Snapshot = {
    scope: { from: instant(from), to: instant(to), as_of: effectiveCutoff, branch_id: access.branchId },
    revenue: { quality: "UNAVAILABLE" }, direct_cost: { quality: "UNAVAILABLE" }, gross_profit: { quality: "UNAVAILABLE" },
    operating_expense: { quality: "UNAVAILABLE" }, operating_profit: { quality: "UNAVAILABLE" }, operating_margin_bps: { quality: "UNAVAILABLE" },
    receivable: { quality: "UNAVAILABLE" }, payable: { quality: "UNAVAILABLE" }, salary_payable: { quality: "INCOMPLETE" }, commission_payable: { quality: "INCOMPLETE" },
  };
  const snapshot = (snapshotResult.data ?? fallback) as Snapshot;
  const previous = (previousResult.error ? null : previousResult.data) as Snapshot | null;
  const quick = presets();
  const filterCount = [query.customer, query.site, query.sales, query.activity].filter(Boolean).length;
  const marginText = snapshot.operating_margin_bps.quality === "READY" && snapshot.operating_margin_bps.value != null
    ? `${(Number(snapshot.operating_margin_bps.value) / 100).toLocaleString("vi-VN")}%` : null;
  const keep = { customer: query.customer, site: query.site, sales: query.sales, activity: query.activity, chart: query.chart };

  return <>
    <header className="page-heading dash-heading" data-uat-dashboard-request={typeof query.uatTimingNonce === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(query.uatTimingNonce) ? query.uatTimingNonce : ""}>
      <div><h1>Tổng quan</h1><p className="lede">Kỳ {formatBusinessDate(instant(from))} đến trước {formatBusinessDate(instant(to))} · so với kỳ trước cùng độ dài · số dư tính đến {formatBusinessDateTime(effectiveCutoff)}</p></div>
      <div className="dash-controls">
        <nav className="segmented" aria-label="Kỳ số liệu">{quick.map((item) => <Link key={item.label} href={listHref("/admin", { ...keep, from: item.from, to: item.to })} aria-current={item.from === from && item.to === to ? "true" : undefined}>{item.label}</Link>)}</nav>
        <details className="dash-filter" open={filterCount > 0}>
          <summary className="button button-secondary">Lọc · khách, công trình, NV{filterCount ? ` (${filterCount})` : ""}</summary>
          <div className="dash-filter-panel card card-pad"><Suspense fallback={<p className="muted">Đang tải bộ lọc...</p>}><DashboardFilters access={access} query={query} from={from} to={to} /></Suspense></div>
        </details>
      </div>
    </header>
    <div className="dash-grid">
      <section className="card dash-figures" aria-label="Chỉ số chính" data-uat-dashboard-kpi={snapshotResult.error || !snapshotResult.data ? "error" : "ready"}>
        <Figure label="Doanh thu" metric={snapshot.revenue} note={<Change current={snapshot.revenue} previous={previous?.revenue ?? null} />} />
        <Figure label="Lợi nhuận gộp" metric={snapshot.gross_profit} note={<span className="dash-figure-note">{margin(snapshot.gross_profit, snapshot.revenue) ? `Biên gộp ${margin(snapshot.gross_profit, snapshot.revenue)}` : "Doanh thu trừ giá vốn"}</span>} />
        <Figure label="Chi phí vận hành" metric={snapshot.operating_expense} note={<Change current={snapshot.operating_expense} previous={previous?.operating_expense ?? null} risingIsBad />} />
        <Figure label="Lợi nhuận ròng" metric={snapshot.operating_profit} note={<span className="dash-figure-note">{marginText ? `Biên ròng ${marginText}` : `Tổng chi ${ready(totalCostMetric(snapshot)) === null ? "—" : shortVnd(ready(totalCostMetric(snapshot))!)}`}</span>} />
        <p className="dash-figures-scope" data-recording-scope="RECORDED_TRANSACTIONS">{recordingScopeText(snapshot.scope.historical_quality)}</p>
      </section>
      <Suspense fallback={<section className="card card-pad dash-today"><p className="muted">Đang tải việc cần xử lý...</p></section>}><TodayPanel access={access} /></Suspense>
      <Suspense fallback={<section className="card card-pad result-chart dash-chart"><p className="muted">Đang tải biểu đồ...</p></section>}><ProfitChartSection dashboardArgs={dashboardArgs} query={query} from={from} to={to} /></Suspense>
    </div>
    <Suspense fallback={<section className="card card-pad"><p className="muted">Đang tải giao hàng, nhóm hàng và công nợ...</p></section>}><OperationsRow access={access} from={from} to={to} /></Suspense>
    <Suspense fallback={<section className="card card-pad"><p className="muted">Đang tải công nợ và quỹ tiền...</p></section>}><DashboardSecondary access={access} query={query} to={to} dashboardArgs={dashboardArgs} snapshot={snapshot} /></Suspense>
  </>;
}
