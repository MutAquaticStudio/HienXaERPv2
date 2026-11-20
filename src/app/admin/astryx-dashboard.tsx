import { Suspense, type ReactNode } from "react";
import { DashboardDetails, type DashboardDetail } from "@/components/dashboard/dashboard-details";
import { ProfitLineChart } from "@/components/dashboard/profit-line-chart";
import { requireInternalPermission } from "@/lib/access/context";
import { CASHBOOK_PERMISSIONS } from "@/lib/access/policy";
import { formatBusinessDate, formatBusinessDateTime } from "@/lib/core/business-time";
import { formatVnd, vnd } from "@/lib/core/money";
import { createServerSupabase } from "@/lib/supabase/server";
import { loadTodayFacts, todayItems } from "@/modules/dashboard/today";
import { changeAgainst, loadAccountBalances, loadDebtAging, loadDeliveryDay, loadSalesByGroup } from "@/modules/dashboard/overview";
import { shortVnd } from "@/modules/dashboard/format";
import { dashboardSnapshotCutoff } from "@/modules/reports/dashboard-snapshot-cutoff";
import { readyValue, totalCostMetric, type ProfitSeries } from "@/modules/reports/profit-series";
import { recordingScopeText } from "@/modules/operations/state";
import { N4Card } from "@/components/astryx/n4-kit";
import {
  AxAgingCard, AxChange, AxChartCard, AxDashboardHead, AxDebtorsCard, AxDeliveryCard, AxFigures, AxGroupsCard, AxMoneyCard, AxTodayCard, axDebtSub,
  type AxDebt, type AxFigure, type AxMoneyTile,
} from "./astryx-view";

type Quality = "READY" | "INCOMPLETE" | "NOT_APPLICABLE" | "FORBIDDEN" | "UNAVAILABLE";
export type AxMetric = { value_vnd?: string | number | null; value?: string | number | null; quality: Quality };
export type AxSnapshot = {
  scope: { from: string; to: string; as_of: string; branch_id: string; historical_quality?: string };
  revenue: AxMetric; direct_cost: AxMetric; gross_profit: AxMetric; operating_expense: AxMetric;
  operating_profit: AxMetric; operating_margin_bps: AxMetric; receivable: AxMetric; payable: AxMetric;
  salary_payable: AxMetric; commission_payable: AxMetric;
};
type Access = Awaited<ReturnType<typeof requireInternalPermission>>;
export type AxDashboardArgs = { target_branch_id: string; from_inclusive: string; to_exclusive: string; knowledge_cutoff: string; target_customer_id: string | null; target_site_id: string | null; target_sales_employee_id: string | null; target_activity_kind: string | null };
export type AxDashboardQuery = { from?: string; to?: string; customer?: string; site?: string; sales?: string; activity?: string; chart?: string; uatTimingNonce?: string };

const DAY = 86_400_000;
const iso = (time: number) => new Date(time).toISOString().slice(0, 10);
const dateTime = (date: string) => Date.parse(`${date}T00:00:00Z`);
const instant = (date: string) => `${date}T00:00:00+07:00`;
const ready = (metric: AxMetric | undefined) => readyValue(metric as never);
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
function listHref(path: string, params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}
function qualityText(quality: Quality) {
  if (quality === "INCOMPLETE") return "Chưa đủ hoặc chưa khớp giá vốn theo dòng và nguồn";
  if (quality === "NOT_APPLICABLE") return "Chi phí chung chưa phân bổ theo bộ lọc này";
  if (quality === "UNAVAILABLE") return "Chưa tải được. Thử lại";
  return null;
}
function marginOf(part: AxMetric, whole: AxMetric) {
  const numerator = ready(part), denominator = ready(whole);
  if (numerator === null || denominator === null || denominator <= 0n) return null;
  return `${(Number((numerator * 1000n) / denominator) / 10).toLocaleString("vi-VN")}%`;
}
function change(current: AxMetric, previous: AxMetric | null, risingIsBad = false) {
  const result = changeAgainst(ready(current), previous ? ready(previous) : null);
  return <AxChange percent={result ? result.percent : null} up={result?.up} risingIsBad={risingIsBad} />;
}

async function Today({ access }: { access: Access }) {
  const supabase = await createServerSupabase();
  return <AxTodayCard items={todayItems(await loadTodayFacts(supabase, access.branchId, access.permissions))} />;
}

const CHART_STEPS = [{ key: "day", label: "Ngày" }, { key: "week", label: "Tuần" }, { key: "month", label: "Tháng" }] as const;
function chartRange(step: string, from: string, to: string) {
  if (step === "day") return { from: dateTime(to) - dateTime(from) > 31 * DAY ? iso(dateTime(to) - 31 * DAY) : from, to };
  if (step === "month") {
    const [year, month] = iso(dateTime(to) - DAY).split("-").map(Number);
    return { from: iso(Date.UTC(year, month - 12, 1)), to };
  }
  return { from: iso(dateTime(to) - 84 * DAY), to };
}

async function Chart({ args, query, from, to }: { args: AxDashboardArgs; query: AxDashboardQuery; from: string; to: string }) {
  const supabase = await createServerSupabase();
  const step = CHART_STEPS.some((item) => item.key === query.chart) ? query.chart! : "week";
  const range = chartRange(step, from, to);
  const { data, error } = await supabase.rpc("finance_dashboard_series", { ...args, from_inclusive: instant(range.from), to_exclusive: instant(range.to) });
  const tooLong = Boolean(error?.message?.includes("report_period_too_long"));
  const steps = CHART_STEPS.map((item) => ({ href: listHref("/admin", { ...query, uatTimingNonce: undefined, chart: item.key }), label: item.label, active: item.key === step }));
  return <AxChartCard step={step === "day" ? "ngày" : step === "week" ? "tuần" : "tháng"} steps={steps} failed={Boolean(error)} tooLong={tooLong}>
    <ProfitLineChart series={data as ProfitSeries} bars /></AxChartCard>;
}

async function Operations({ access, from, to }: { access: Access; from: string; to: string }) {
  const supabase = await createServerSupabase();
  const [deliveries, groups, aging] = await Promise.all([
    access.permissions.has("delivery.read") ? loadDeliveryDay(supabase, access.branchId).catch(() => null) : Promise.resolve(undefined),
    access.permissions.has("orders.read") ? loadSalesByGroup(supabase, access.branchId, from, to).catch(() => null) : Promise.resolve(undefined),
    access.permissions.has("finance.ar.read") ? loadDebtAging(supabase, access.branchId).catch(() => null) : Promise.resolve(undefined),
  ]);
  return <div className="n4-grid c3">
    {deliveries !== undefined && <AxDeliveryCard deliveries={deliveries} />}
    {groups !== undefined && <AxGroupsCard groups={groups} reportHref={listHref("/admin/reports", { report: "GOODS_SALES", from, to: iso(dateTime(to) - DAY) })} />}
    {aging !== undefined && <AxAgingCard aging={aging} />}
  </div>;
}

async function Secondary({ access, query, to, args, snapshot }: { access: Access; query: AxDashboardQuery; to: string; args: AxDashboardArgs; snapshot: AxSnapshot }) {
  const supabase = await createServerSupabase();
  const cutoff = dashboardSnapshotCutoff(to, args.knowledge_cutoff);
  const canCash = access.permissions.has("finance.ar.read") && CASHBOOK_PERMISSIONS.some((permission) => access.permissions.has(permission));
  const snapshotOf = (side: "AR" | "AP", limit: number) => supabase.rpc("finance_obligation_snapshot", { target_branch_id: access.branchId, target_side: side, as_of: cutoff, knowledge_cutoff: args.knowledge_cutoff,
    target_customer_id: query.customer || null, target_site_id: query.site || null, target_sales_employee_id: query.sales || null })
    .select("obligation_id,party_id,party_name,site_id,site_name,source_type,source_id,due_date,outstanding_amount_vnd::text").gt("outstanding_amount_vnd", 0).order("outstanding_amount_vnd", { ascending: false }).limit(limit);
  const [detailResult, receivableResult, payableResult, balances] = await Promise.all([
    supabase.rpc("finance_dashboard_detail", args),
    access.permissions.has("finance.ar.read") ? snapshotOf("AR", 5) : Promise.resolve({ data: [] }),
    access.permissions.has("finance.ap.read") ? snapshotOf("AP", 3) : Promise.resolve({ data: [] }),
    canCash ? loadAccountBalances(supabase, access.branchId).catch(() => null) : Promise.resolve(undefined),
  ]);
  const now = today();
  const rows = (result: { data?: unknown }) => (result.data ?? []) as Array<{ obligation_id: string; party_name: string; site_name?: string | null; outstanding_amount_vnd: string; due_date: string }>;
  const receivables: AxDebt[] = rows(receivableResult).map((item) => ({ id: item.obligation_id, name: item.party_name, sub: axDebtSub(item.due_date, item.site_name ?? null), amount: formatVnd(vnd(String(item.outstanding_amount_vnd))), late: item.due_date < now, href: `/admin/receivables/${item.obligation_id}` }));
  const payables: AxDebt[] = rows(payableResult).map((item) => ({ id: item.obligation_id, name: item.party_name, sub: axDebtSub(item.due_date), amount: formatVnd(vnd(String(item.outstanding_amount_vnd))), late: item.due_date < now, href: `/admin/payables/${item.obligation_id}` }));
  const obligation = (key: string, label: string, metric: AxMetric): AxMoneyTile | null => metric.quality === "FORBIDDEN" ? null
    : { key, label, value: ready(metric) === null ? "—" : formatVnd(vnd(ready(metric)!.toString())), note: qualityText(metric.quality) };
  const tiles: AxMoneyTile[] = [
    ...(balances ?? []).map((account) => ({ key: account.id, label: account.name, value: formatVnd(vnd(account.balanceVnd.toString())), note: `${account.kind === "CASH" ? "Tiền mặt" : "Ngân hàng"} · số dư hiện tại` })),
    obligation("ap", "Phải trả nhà cung cấp", snapshot.payable), obligation("salary", "Lương phải chi", snapshot.salary_payable), obligation("commission", "Hoa hồng phải chi", snapshot.commission_payable),
  ].filter((tile): tile is AxMoneyTile => tile !== null);
  const filtered = Boolean(query.customer || query.site || query.sales);
  const failed = Boolean(detailResult.error || !detailResult.data);
  return <div style={{ display: "contents" }} data-uat-dashboard-content={failed ? "error" : "ready"}>
    <div className="n4-grid c2">
      <AxDebtorsCard items={receivables} canAll={access.permissions.has("finance.ar.read")} allHref={listHref("/admin/dashboard/obligations", { side: "AR", customer: query.customer, site: query.site, sales: query.sales, to })} />
      <AxMoneyCard tiles={tiles} balancesFailed={balances === null} payables={payables} filtered={filtered} canCash={canCash} />
    </div>
    <DashboardDetails detail={(detailResult.data as DashboardDetail | null) ?? null} expenseMetric={snapshot.operating_expense} commissionMetric={snapshot.commission_payable} />
  </div>;
}

const loading = (text: string): ReactNode => <N4Card><p className="hx-muted" style={{ margin: 0 }}>{text}</p></N4Card>;

/** Tổng quan kiểu Astryx: dùng đúng dữ liệu, bộ lọc, quyền và truy vấn của bản Classic; chỉ khác cách dựng giao diện. */
export function AstryxDashboard({ access, query, from, to, quick, snapshot, previous, snapshotFailed, args, filters, filterCount }: {
  access: Access; query: AxDashboardQuery; from: string; to: string; quick: { label: string; from: string; to: string }[];
  snapshot: AxSnapshot; previous: AxSnapshot | null; snapshotFailed: boolean; args: AxDashboardArgs; filters: ReactNode; filterCount: number;
}) {
  const keep = { customer: query.customer, site: query.site, sales: query.sales, activity: query.activity, chart: query.chart };
  const effectiveCutoff = dashboardSnapshotCutoff(to, args.knowledge_cutoff);
  const marginText = snapshot.operating_margin_bps.quality === "READY" && snapshot.operating_margin_bps.value != null
    ? `${(Number(snapshot.operating_margin_bps.value) / 100).toLocaleString("vi-VN")}%` : null;
  const gross = marginOf(snapshot.gross_profit, snapshot.revenue);
  const totalCost = ready(totalCostMetric(snapshot));
  const figure = (key: string, label: string, metric: AxMetric, extra: Partial<AxFigure>): AxFigure | null => metric.quality === "FORBIDDEN" ? null
    : { key, label, value: ready(metric), qualityText: qualityText(metric.quality), ...extra };
  const figures = [
    figure("revenue", "Doanh thu", snapshot.revenue, { tone: "pos", lead: true, note: change(snapshot.revenue, previous?.revenue ?? null) }),
    figure("gross", "Lợi nhuận gộp", snapshot.gross_profit, { note: <span className="hx-muted">{gross ? `Biên gộp ${gross}` : "Doanh thu trừ giá vốn"}</span> }),
    figure("opex", "Chi phí vận hành", snapshot.operating_expense, { tone: "neg", note: change(snapshot.operating_expense, previous?.operating_expense ?? null, true) }),
    figure("net", "Lợi nhuận ròng", snapshot.operating_profit, { note: <span className="hx-muted">{marginText ? `Biên ròng ${marginText}` : `Tổng chi ${totalCost === null ? "—" : shortVnd(totalCost)}`}</span> }),
  ].filter((item): item is AxFigure => item !== null);
  return <>
    <AxDashboardHead subtitle={`Kỳ ${formatBusinessDate(instant(from))} đến trước ${formatBusinessDate(instant(to))} · so với kỳ trước cùng độ dài · số dư tính đến ${formatBusinessDateTime(effectiveCutoff)}`}
      quick={quick.map((item) => ({ href: listHref("/admin", { ...keep, from: item.from, to: item.to }), label: item.label, active: item.from === from && item.to === to }))}
      filters={filters} filterCount={filterCount} requestId={typeof query.uatTimingNonce === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(query.uatTimingNonce) ? query.uatTimingNonce : ""} />
    <div style={{ display: "grid", gap: 16 }}>
      <Suspense fallback={loading("Đang tải việc cần xử lý...")}><Today access={access} /></Suspense>
      <AxFigures figures={figures} ready={!snapshotFailed} scope={recordingScopeText(snapshot.scope.historical_quality)} />
      <Suspense fallback={loading("Đang tải biểu đồ...")}><Chart args={args} query={query} from={from} to={to} /></Suspense>
      <Suspense fallback={loading("Đang tải giao hàng, nhóm hàng và công nợ...")}><Operations access={access} from={from} to={to} /></Suspense>
      <Suspense fallback={loading("Đang tải công nợ và quỹ tiền...")}><Secondary access={access} query={query} to={to} args={args} snapshot={snapshot} /></Suspense>
    </div>
  </>;
}
