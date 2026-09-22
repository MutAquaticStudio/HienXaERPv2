import { createServerSupabase } from "@/lib/supabase/server";

export type ReportKind = "receivables" | "payables" | "expenses";
export type ReportFilters = {
  report: ReportKind;
  from: string;
  to: string;
  asOf: string;
  customerId?: string;
  activity?: string;
};
export type ReportRow = { id: string; label: string; context: string; date: string; amountVnd: string; href?: string };
export type ReportResult = {
  title: string;
  totalLabel: string;
  totalVnd: string | null;
  quality: string;
  rows: ReportRow[];
  chart: Array<{ label: string; amountVnd: string }>;
  scopeText: string;
};

type Access = { branchId: string; permissions: ReadonlySet<string> };
type Obligation = { obligation_id: string; party_name: string; site_name: string | null; source_type: string; due_date: string; outstanding_amount_vnd: string };
type DetailItem = { source_kind: string; label: string; amount_vnd: string | number };

const instant = (date: string) => `${date}T00:00:00+07:00`;
const endOfDay = (date: string) => `${date}T23:59:59.999+07:00`;

export function availableReportKinds(permissions: ReadonlySet<string>) {
  const kinds: ReportKind[] = [];
  if (permissions.has("finance.ar.read")) kinds.push("receivables");
  if (permissions.has("finance.ap.read")) kinds.push("payables");
  if (permissions.has("finance.expense.read")) kinds.push("expenses");
  return kinds;
}

export async function loadFixedReport(access: Access, filters: ReportFilters): Promise<ReportResult> {
  const required = filters.report === "receivables" ? "finance.ar.read" : filters.report === "payables" ? "finance.ap.read" : "finance.expense.read";
  if (!access.permissions.has(required)) throw new Error("forbidden_report");
  const supabase = await createServerSupabase();
  const cutoff = new Date().toISOString();
  const isExpense = filters.report === "expenses";
  const from = isExpense ? instant(filters.from) : "2000-01-01T00:00:00+07:00";
  const to = isExpense ? instant(filters.to) : endOfDay(filters.asOf);
  const dashboardArgs = {
    target_branch_id: access.branchId,
    from_inclusive: from,
    to_exclusive: to,
    knowledge_cutoff: cutoff,
    target_customer_id: filters.report !== "payables" ? filters.customerId || null : null,
    target_site_id: null,
    target_sales_employee_id: null,
    target_activity_kind: isExpense ? filters.activity || null : null,
  };

  if (isExpense) {
    const [snapshotResult, detailResult] = await Promise.all([
      supabase.rpc("finance_dashboard_snapshot", dashboardArgs),
      supabase.rpc("finance_dashboard_detail", dashboardArgs),
    ]);
    if (snapshotResult.error || detailResult.error) throw new Error("report_query_failed");
    const snapshot = snapshotResult.data as { operating_expense: { value_vnd: string | number | null; quality: string } };
    const detail = detailResult.data as { expense_breakdown: { quality: string; items: DetailItem[] } };
    const quality = snapshot.operating_expense.quality;
    const items = quality === "READY" && detail.expense_breakdown.quality === "READY" ? detail.expense_breakdown.items : [];
    const rows = items.map((item, index) => ({ id: `${item.source_kind}:${index}`, label: item.label, context: item.source_kind === "EXPENSE" ? "Chi phí đã duyệt" : "Thu nhập nhân sự đã duyệt", date: `${filters.from} → ${filters.to}`, amountVnd: String(item.amount_vnd), href: "/admin/expenses" }));
    return {
      title: "Chi phí vận hành",
      totalLabel: "Tổng chi phí",
      totalVnd: quality === "READY" && snapshot.operating_expense.value_vnd != null ? String(snapshot.operating_expense.value_vnd) : null,
      quality,
      rows,
      chart: rows.slice(0, 8).map((row) => ({ label: row.label, amountVnd: row.amountVnd })),
      scopeText: `Kỳ ${filters.from} đến trước ${filters.to}`,
    };
  }

  const side = filters.report === "receivables" ? "AR" : "AP";
  const [snapshotResult, obligationResult] = await Promise.all([
    supabase.rpc("finance_dashboard_snapshot", dashboardArgs),
    supabase.rpc("finance_obligation_snapshot", {
      target_branch_id: access.branchId,
      target_side: side,
      as_of: endOfDay(filters.asOf),
      knowledge_cutoff: cutoff,
      target_customer_id: filters.report === "receivables" ? filters.customerId || null : null,
      target_site_id: null,
      target_sales_employee_id: null,
    }).gt("outstanding_amount_vnd", 0).order("outstanding_amount_vnd", { ascending: false }).order("obligation_id").limit(100),
  ]);
  if (snapshotResult.error || obligationResult.error) throw new Error("report_query_failed");
  const snapshot = snapshotResult.data as { receivable: { value_vnd: string | number | null; quality: string }; payable: { value_vnd: string | number | null; quality: string } };
  const metric = filters.report === "receivables" ? snapshot.receivable : snapshot.payable;
  const obligations = (obligationResult.data ?? []) as Obligation[];
  const base = filters.report === "receivables" ? "/admin/receivables" : "/admin/payables";
  const rows = obligations.map((row) => ({ id: row.obligation_id, label: row.party_name, context: `${row.site_name ?? row.source_type} · ${row.source_type}`, date: row.due_date, amountVnd: row.outstanding_amount_vnd, href: `${base}/${row.obligation_id}` }));
  return {
    title: filters.report === "receivables" ? "Phải thu còn mở" : "Phải trả còn mở",
    totalLabel: filters.report === "receivables" ? "Tổng phải thu" : "Tổng phải trả",
    totalVnd: metric.quality === "READY" && metric.value_vnd != null ? String(metric.value_vnd) : null,
    quality: metric.quality,
    rows,
    chart: rows.slice(0, 8).map((row) => ({ label: row.label, amountVnd: row.amountVnd })),
    scopeText: `Số dư đến hết ${filters.asOf}`,
  };
}
