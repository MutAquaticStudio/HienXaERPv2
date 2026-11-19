import type { Metadata } from "next";
import { requireInternalPermission } from "@/lib/access/context";
import { availableCenterReports, centerReport } from "@/modules/reports/center";
import { FINANCE_REPORTS, type FinanceKind } from "@/modules/reports/finance-table";
import { availableReportKinds } from "@/modules/reports/server";
import { ReportCenterView } from "./report-center-view";
import { readPeriod } from "./report-hub";
import { FinanceReportView } from "./report-finance-view";

type Query = { report?: string; warehouse?: string; from?: string; to?: string; asOf?: string; customer?: string; customerSearch?: string; activity?: string; cutoff?: string; page?: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function localDate() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
const isFinance = (value: string | undefined): value is FinanceKind => value === "receivables" || value === "payables" || value === "expenses";

/** The browser tab names the report ("Xuất nhập tồn | Hiền Xa ERP"), so several open reports can be told apart. */
export async function generateMetadata({ searchParams }: { searchParams: Promise<Query> }): Promise<Metadata> {
  const { report } = await searchParams;
  const label = isFinance(report) ? FINANCE_REPORTS[report].label : centerReport(report)?.label;
  return { title: label ? `${label} · Báo cáo` : "Báo cáo" };
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const access = await requireInternalPermission("dashboard.read");
  const query = await searchParams;
  const today = localDate();
  const centerReports = availableCenterReports(access.permissions);
  const financeKinds = availableReportKinds(access.permissions);

  // D57: one report frame. A finance report when asked for (or when it is all this person may read), else a hub report.
  if (isFinance(query.report) && financeKinds.includes(query.report) || (!centerReports.length && financeKinds.length)) {
    const kind = isFinance(query.report) && financeKinds.includes(query.report) ? query.report : financeKinds[0];
    const { period, notice } = readPeriod(query, today, (to) => `${to.slice(0, 7)}-01`, kind === "expenses");
    // Called, not rendered as an element: the page is one server render either way, and it keeps the page testable.
    return FinanceReportView({ access, kind, period, today, notice, query });
  }
  if (!centerReports.length) return <><header className="page-heading"><div><h1>Báo cáo</h1></div></header><p className="quality-callout">Bạn chưa có quyền xem báo cáo nào.</p></>;
  const report = centerReports.find((item) => item.key === query.report) ?? centerReports[0];
  const { period, notice } = readPeriod(query, today, (to) => report.key === "END_OF_DAY" ? to : `${to.slice(0, 7)}-01`, !report.asOfToday);
  return ReportCenterView({ access, report, today, notice, filters: { ...period, warehouse: UUID.test(query.warehouse ?? "") ? query.warehouse : undefined } });
}
