import { formatBusinessDate } from "@/lib/core/business-time";
import { reportQualityLabel } from "@/modules/finance/presentation";
import type { CSSProperties } from "react";
import Link from "next/link";
import { ReportExportButton } from "@/components/report-export-button";
import { ReportCustomerFilter } from "@/components/report-customer-filter";
import { ListPager } from "@/components/ui/list-pager";
import { requireInternalPermission } from "@/lib/access/context";
import { ilikePattern, parseCoreListQuery } from "@/lib/core-list";
import { formatVnd, vnd } from "@/lib/core/money";
import { createServerSupabase } from "@/lib/supabase/server";
import { availableReportKinds, loadFixedReport, type ReportKind } from "@/modules/reports/server";

type Query = { report?: string; from?: string; to?: string; asOf?: string; customer?: string; customerSearch?: string; activity?: string; cutoff?: string; page?: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const labels: Record<ReportKind, string> = { receivables: "Phải thu", payables: "Phải trả", expenses: "Chi phí vận hành" };

function localDate() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function defaultFrom(to: string) { return `${to.slice(0, 7)}-01`; }
function reportHref(query: Query) { const params = new URLSearchParams(); for (const [key, value] of Object.entries(query)) if (value) params.set(key, value); return `/api/reports/export?${params.toString()}`; }

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const access = await requireInternalPermission("dashboard.read");
  const query = await searchParams;
  const available = availableReportKinds(access.permissions);
  const requested = available.includes(query.report as ReportKind) ? query.report as ReportKind : available[0];
  const today = localDate();
  const to = DATE.test(query.to ?? "") ? query.to! : today;
  const from = DATE.test(query.from ?? "") ? query.from! : defaultFrom(to);
  const asOf = DATE.test(query.asOf ?? "") ? query.asOf! : today;
  const requestedPage = Number.parseInt(query.page ?? "1", 10);
  const page = Number.isFinite(requestedPage) ? Math.min(Math.max(requestedPage, 1), 10000) : 1;
  const now = new Date().toISOString();
  const cutoff = query.cutoff && Number.isFinite(Date.parse(query.cutoff)) && new Date(query.cutoff).toISOString() <= now ? query.cutoff : now;
  let customerId = UUID.test(query.customer ?? "") ? query.customer : undefined;
  const customerSearch = parseCoreListQuery({ q: query.customerSearch }).q;
  const supabase = await createServerSupabase();
  const canFilterCustomer = Boolean(requested && requested !== "payables");
  let customerOptions: Array<{ id: string; display_name: string }> = [];
  if (canFilterCustomer && customerSearch) {
    const { data, error } = await supabase.from("customers").select("id, display_name")
      .eq("branch_id", access.branchId).eq("active", true)
      .ilike("display_name", ilikePattern(customerSearch)).order("display_name").limit(25);
    if (error) throw new Error("Không thể tìm khách hàng cho báo cáo.");
    customerOptions = data ?? [];
  }
  if (canFilterCustomer && customerId && !customerOptions.some((customer) => customer.id === customerId)) {
    const { data, error } = await supabase.from("customers").select("id, display_name")
      .eq("branch_id", access.branchId).eq("active", true).eq("id", customerId).maybeSingle();
    if (error) throw new Error("Không thể tải khách hàng đã chọn.");
    if (data) customerOptions.unshift(data);
    else customerId = undefined;
  }
  if (!requested) return <><header className="page-heading"><div><p className="eyebrow">Báo cáo</p><h1>Báo cáo</h1></div></header><p className="quality-callout">Bạn chưa có quyền đọc nguồn báo cáo tài chính.</p></>;
  const filters = { report: requested, from, to, asOf, customerId, activity: query.activity, page, cutoff };
  const report = await loadFixedReport(access, filters);
  const max = report.chart.reduce((current, item) => { const value = BigInt(item.amountVnd); return value > current ? value : current; }, 1n);
  const exportQuery: Query = { report: requested, from, to, asOf, customer: customerId, activity: query.activity, cutoff };

  return <>
    <header className="page-heading"><div><p className="eyebrow">Báo cáo</p><h1>Báo cáo nghiệp vụ</h1><p className="lede">Chọn báo cáo cố định; bộ lọc và file xuất dùng cùng một nguồn dữ liệu.</p></div><ReportExportButton href={reportHref(exportQuery)} filename={`${requested}-${asOf}.csv`} /></header>
    <form className="card filter-bar" method="get"><label>Báo cáo<select name="report" defaultValue={requested}>{available.map((kind) => <option key={kind} value={kind}>{labels[kind]}</option>)}</select></label>{requested === "expenses" ? <><label>Từ ngày<input type="date" name="from" defaultValue={from} /></label><label>Đến trước ngày<input type="date" name="to" defaultValue={to} /></label></> : <label>Đến hết ngày<input type="date" name="asOf" defaultValue={asOf} /></label>}{requested !== "payables" && <ReportCustomerFilter key={`${requested}:${customerId ?? ""}:${customerSearch}`} report={requested} initialSearch={customerSearch} initialCustomer={customerId ?? ""} initialOptions={customerOptions} />}{requested === "expenses" && <label>Hoạt động<select name="activity" defaultValue={query.activity ?? ""}><option value="">Tất cả</option><option value="SALES">Bán hàng</option><option value="SERVICE">Dịch vụ</option><option value="OPERATIONS">Vận hành</option><option value="ADMIN">Hành chính</option></select></label>}<button className="button button-primary" type="submit">Chạy báo cáo</button></form>
    <p className="report-cutoff">{report.scopeText} · {reportQualityLabel(report.quality)}</p>
    <section className="metric-grid"><article className="card metric-card"><span className="metric-label">{report.totalLabel}</span><strong className="metric-value">{report.totalVnd == null ? "—" : formatVnd(vnd(report.totalVnd))}</strong>{report.quality !== "READY" && <span className="metric-note">Chưa đủ dữ liệu để hiển thị số tiền.</span>}</article><article className="card metric-card"><span className="metric-label">Dòng trên trang</span><strong className="metric-value">{report.rows.length}</strong><span className="metric-note">Trang {page}; xuất CSV không giới hạn theo trang.</span></article></section>
    <section className="card card-pad result-chart"><div className="section-head flush"><h2>Các khoản có giá trị lớn nhất</h2><span className="scope-chip">Tối đa 8</span></div>{report.chart.map((item) => { const amount = BigInt(item.amountVnd); const width = Number(amount * 100n / max); return <div className="bar-row" key={`${item.label}:${item.amountVnd}`}><span>{item.label}</span><div className="bar-track"><i style={{ "--bar-width": `${Math.max(width, 2)}%` } as CSSProperties} /></div><strong>{formatVnd(vnd(item.amountVnd))}</strong></div>; })}{!report.chart.length && <p className="empty-inline">Chưa có dữ liệu sẵn sàng để hiển thị biểu đồ.</p>}</section>
    <section className="card"><div className="section-head"><h2>{report.title}</h2><span className="scope-chip">25 dòng/trang</span></div><div className="table-wrap"><table><thead><tr><th>Đối tượng / nhóm</th><th>Ngữ cảnh</th><th>Ngày / kỳ</th><th>Số tiền</th></tr></thead><tbody>{report.rows.map((row) => <tr key={row.id}><td>{row.href ? <Link className="code-link" href={row.href}>{row.label}</Link> : row.label}</td><td>{row.context}</td><td>{row.date.includes("→") ? row.date.split(" → ").map(formatBusinessDate).join(" → ") : formatBusinessDate(row.date)}</td><td className="mono">{formatVnd(vnd(row.amountVnd))}</td></tr>)}</tbody></table>{!report.rows.length && <p className="empty-inline">Chưa có dữ liệu sẵn sàng trong phạm vi này.</p>}</div>{requested !== "expenses" && <ListPager page={page} hasNext={report.hasNext} params={{ report: requested, from, to, asOf, customer: customerId, activity: query.activity, cutoff }} />}</section>
  </>;
}
