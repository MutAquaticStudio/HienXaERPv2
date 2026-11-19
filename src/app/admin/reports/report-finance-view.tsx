import Link from "next/link";
import type { CSSProperties } from "react";
import { ReportCustomerFilter } from "@/components/report-customer-filter";
import { ListPager } from "@/components/ui/list-pager";
import { formatBusinessDate } from "@/lib/core/business-time";
import { ilikePattern, parseCoreListQuery } from "@/lib/core-list";
import { formatVnd, vnd } from "@/lib/core/money";
import { createServerSupabase } from "@/lib/supabase/server";
import { reportQualityLabel } from "@/modules/finance/presentation";
import { reportFileBase } from "@/modules/reports/export-table";
import { financeColumns, FINANCE_REPORTS, type FinanceKind } from "@/modules/reports/finance-table";
import { loadFixedReport } from "@/modules/reports/server";
import { PeriodFilters, periodLabel, ReportEmpty, ReportFigures, ReportHubShell, reportNavItems, type Period } from "./report-hub";

type Access = { branchId: string; permissions: ReadonlySet<string> };
type Query = { customer?: string; customerSearch?: string; activity?: string; page?: string; cutoff?: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIVITIES: [string, string][] = [["SALES", "Bán hàng"], ["SERVICE", "Dịch vụ"], ["OPERATIONS", "Vận hành"], ["ADMIN", "Hành chính"]];

/**
 * D57: Phải thu / Phải trả / Chi phí vận hành inside the report frame — same list, quick periods, "Đến ngày" (that day
 * included) and Excel / CSV of every row. Phải thu and Phải trả are balances "đến hết ngày", so they take one date.
 */
export async function FinanceReportView({ access, kind, period, today, query, notice }: { access: Access; kind: FinanceKind; period: Period; today: string; query: Query; notice?: string }) {
  const requestedPage = Number.parseInt(query.page ?? "1", 10);
  const page = Number.isFinite(requestedPage) ? Math.min(Math.max(requestedPage, 1), 10000) : 1;
  const now = new Date().toISOString();
  const cutoff = query.cutoff && Number.isFinite(Date.parse(query.cutoff)) && new Date(query.cutoff).toISOString() <= now ? query.cutoff : now;
  // Expenses can belong to a customer's work (giao hàng, dịch vụ), so both Phải thu and Chi phí filter by customer.
  const canFilterCustomer = kind !== "payables";
  let customerId = canFilterCustomer && UUID.test(query.customer ?? "") ? query.customer : undefined;
  const customerSearch = parseCoreListQuery({ q: query.customerSearch }).q;
  const supabase = await createServerSupabase();
  let customerOptions: Array<{ id: string; display_name: string }> = [];
  if (canFilterCustomer && customerSearch) {
    const { data, error } = await supabase.from("customers").select("id, display_name")
      .eq("branch_id", access.branchId).eq("active", true)
      .ilike("display_name", ilikePattern(customerSearch)).order("display_name").limit(25);
    if (error) throw new Error("Không thể tìm khách hàng cho báo cáo.");
    customerOptions = data ?? [];
  }
  if (customerId && !customerOptions.some((customer) => customer.id === customerId)) {
    const { data, error } = await supabase.from("customers").select("id, display_name")
      .eq("branch_id", access.branchId).eq("active", true).eq("id", customerId).maybeSingle();
    if (error) throw new Error("Không thể tải khách hàng đã chọn.");
    if (data) customerOptions.unshift(data);
    else customerId = undefined;
  }
  const asOf = period.to;
  const report = await loadFixedReport(access, { report: kind, from: period.from, to: period.to, asOf, customerId, activity: query.activity, page, cutoff });
  const exportParams = new URLSearchParams({ report: kind, from: period.from, to: period.to, asOf, cutoff });
  if (customerId) exportParams.set("customer", customerId);
  if (query.activity) exportParams.set("activity", query.activity);
  const columns = financeColumns(kind);
  const rows = report.rows;
  const chart = report.chart.length >= 3 ? report.chart : [];
  const max = chart.reduce((top, item) => { const value = BigInt(item.amountVnd); return value > top ? value : top; }, 1n);
  const allPages = page > 1 || report.hasNext;
  const ready = report.quality === "READY";
  const emptyText = kind === "receivables" ? `Không có khoản phải thu nào còn mở đến hết ${formatBusinessDate(asOf)}.`
    : kind === "payables" ? `Không có khoản phải trả nào còn mở đến hết ${formatBusinessDate(asOf)}.` : `Không có chi phí đã duyệt nào từ ${periodLabel(period).replace(" – ", " đến ")}.`;

  return <ReportHubShell title={`${FINANCE_REPORTS[kind].label}`} hint={FINANCE_REPORTS[kind].hint} current={kind} items={reportNavItems(access.permissions)} period={period}
    exportHref={`/api/reports/export?${exportParams.toString()}`} fileName={reportFileBase(FINANCE_REPORTS[kind].label, kind === "expenses" ? period.from : undefined, period.to)}
    filters={<PeriodFilters report={kind} mode={kind === "expenses" ? "range" : "asOf"} period={period} today={today}
      extra={<>{canFilterCustomer && <ReportCustomerFilter key={`${kind}:${customerId ?? ""}:${customerSearch}`} report={kind} initialSearch={customerSearch} initialCustomer={customerId ?? ""} initialOptions={customerOptions} />}
        {kind === "expenses" && <label>Hoạt động<select name="activity" defaultValue={query.activity ?? ""}><option value="">Tất cả</option>{ACTIVITIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}</>}
      note={notice ? <p className="report-filter-note" role="status">{notice}</p> : undefined} />}>
    <p className="report-cutoff">{report.scopeText}</p>
    {!ready && <p className="quality-callout">{reportQualityLabel(report.quality)}: chưa đủ dữ liệu để tính số tiền trong phạm vi này.</p>}
    <ReportFigures figures={[{ label: report.totalLabel, kind: "money", value: report.totalVnd }]} />
    {chart.length > 0 && <section className="card card-pad result-chart report-chart" aria-labelledby="report-chart-title"><div className="section-head flush"><h2 id="report-chart-title">Khoản lớn nhất</h2><span className="scope-chip">{chart.length} khoản</span></div>
      {chart.map((item) => { const width = Number(BigInt(item.amountVnd) * 100n / max); return <div className="bar-row" key={`${item.label}:${item.amountVnd}`}><span>{item.label}</span><div className="bar-track"><i style={{ "--bar-width": `${Math.max(width, 2)}%` } as CSSProperties} /></div><strong>{formatVnd(vnd(item.amountVnd))}</strong></div>; })}</section>}
    <section className="card report-table-card" aria-labelledby="report-table-title">
      <div className="section-head"><h2 id="report-table-title">Chi tiết</h2>{rows.length > 0 && <span className="scope-chip">{allPages ? `Trang ${page} · 25 dòng/trang` : `${rows.length.toLocaleString("vi-VN")} dòng`}</span>}</div>
      {!rows.length ? <div className="report-empty-wrap"><ReportEmpty text={ready ? emptyText : "Chưa có số liệu sẵn sàng trong phạm vi này."} report={kind} today={today} period={kind === "expenses" ? period : undefined} /></div> : <>
      {columns.length > 3 && <p className="table-scroll-hint">Kéo ngang bảng để xem thêm cột.</p>}
      <div className="table-wrap" role="region" aria-labelledby="report-table-title" tabIndex={0}><table className="report-table">
        <thead><tr>{columns.map((column) => <th key={column.label} scope="col" className={column.kind === "money" ? "numeric" : undefined}>{column.label}</th>)}</tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id}>
          <td>{row.href ? <Link className="code-link" href={row.href}>{row.label}</Link> : row.label}</td>
          <td>{row.context || "—"}</td>
          {kind !== "expenses" && <td>{row.date ? formatBusinessDate(row.date) : "—"}</td>}
          <td className={`numeric${row.amountVnd.startsWith("-") ? " is-negative" : ""}`}>{formatVnd(vnd(row.amountVnd))}</td></tr>)}
        </tbody>
        {rows.length > 1 && report.totalVnd !== null && <tfoot><tr><td colSpan={columns.length - 1}>{allPages ? "Tổng cộng (mọi trang)" : "Tổng cộng"}</td><td className="numeric">{formatVnd(vnd(report.totalVnd))}</td></tr></tfoot>}
      </table></div></>}
      {kind !== "expenses" && <ListPager page={page} hasNext={report.hasNext} params={{ report: kind, from: period.from, to: period.to, customer: customerId, activity: query.activity, cutoff }} />}
      {allPages && <p className="report-file-note">File Excel / CSV gồm mọi trang, không chỉ trang này.</p>}
    </section>
  </ReportHubShell>;
}
