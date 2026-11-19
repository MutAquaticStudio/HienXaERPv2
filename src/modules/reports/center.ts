import { formatBusinessDateTime } from "@/lib/core/business-time";
import { formatVnd, vnd } from "@/lib/core/money";
import { formatQuantity } from "@/lib/core/quantity";
import { dayText, exportedAtText, periodText, reportFileBase, sumValues, type ExportKind, type ExportTable } from "./export-table";

/** FB10 (12): the KiotViet-style report hub. Each report reads public.report_center (PROFIT: finance_dashboard_snapshot). */
export type CenterKey = "END_OF_DAY" | "SALES_BY_DAY" | "SALES_BY_CUSTOMER" | "SALES_BY_STAFF" | "GOODS_SALES" | "STOCK_IO" | "CUSTOMER_DEBT" | "SUPPLIER" | "DELIVERY" | "PROFIT";
type ColumnKind = "text" | "money" | "quantity" | "number" | "date" | "datetime" | "direction";
export type CenterColumn = { key: string; label: string; kind?: ColumnKind; unitKey?: string };
/**
 * `totals: false` — no "Tổng cộng" row (Cuối ngày mixes thu and chi; Lãi lỗ lines are already results).
 * `asOfToday` — the figures are as of today whatever the period (Công nợ & tuổi nợ): no period filter is shown.
 */
export type CenterReport = { key: CenterKey; group: string; label: string; hint: string; permission: string; columns: CenterColumn[]; chart?: string; warehouse?: boolean;
  totals?: false; asOfToday?: true };
export type CenterKpi = { label: string; value: string | null; kind: "money" | "number" };
export type CenterResult = { rows: Record<string, unknown>[]; kpis: CenterKpi[] };

const money = (key: string, label: string): CenterColumn => ({ key, label, kind: "money" });
export const CENTER_REPORTS: CenterReport[] = [
  { key: "END_OF_DAY", group: "Cuối ngày", label: "Cuối ngày", hint: "Tiền thu, tiền chi, doanh thu, phiếu giao và phiếu nhập trong ngày.", permission: "finance.ar.read",
    columns: [{ key: "label", label: "Phiếu" }, { key: "time", label: "Thời gian", kind: "datetime" }, { key: "direction", label: "Loại", kind: "direction" }, { key: "party", label: "Đối tượng" }, money("amount_vnd", "Số tiền")], totals: false },
  { key: "SALES_BY_DAY", group: "Bán hàng", label: "Theo thời gian", hint: "Doanh thu từng ngày (giao hàng và dịch vụ đã xác minh).", permission: "orders.read",
    columns: [{ key: "label", label: "Ngày", kind: "date" }, { key: "documents", label: "Số đơn", kind: "number" }, money("amount_vnd", "Doanh thu")], chart: "amount_vnd" },
  { key: "SALES_BY_CUSTOMER", group: "Bán hàng", label: "Theo khách hàng", hint: "Khách mua nhiều nhất trong kỳ.", permission: "orders.read",
    columns: [{ key: "label", label: "Khách hàng" }, { key: "documents", label: "Số đơn", kind: "number" }, money("amount_vnd", "Doanh thu")], chart: "amount_vnd" },
  { key: "SALES_BY_STAFF", group: "Bán hàng", label: "Theo nhân viên", hint: "Doanh thu theo nhân viên kinh doanh phụ trách.", permission: "orders.read",
    columns: [{ key: "label", label: "Nhân viên" }, { key: "documents", label: "Số đơn", kind: "number" }, money("amount_vnd", "Doanh thu")], chart: "amount_vnd" },
  { key: "GOODS_SALES", group: "Hàng hóa", label: "Hàng bán ra", hint: "Số lượng theo đơn vị bán (kèm đơn vị gốc) và tiền hàng đã giao.", permission: "orders.read",
    columns: [{ key: "label", label: "Hàng hóa" }, { key: "quantity", label: "SL bán", kind: "quantity", unitKey: "unit" }, { key: "base_quantity", label: "SL gốc", kind: "quantity", unitKey: "base_unit" }, money("amount_vnd", "Tiền hàng")], chart: "amount_vnd" },
  { key: "STOCK_IO", group: "Hàng hóa", label: "Xuất nhập tồn", hint: "Tồn đầu kỳ, nhập, xuất, tồn cuối kỳ theo kho.", permission: "inventory.read", warehouse: true,
    columns: [{ key: "label", label: "Hàng hóa" }, { key: "opening", label: "Tồn đầu", kind: "quantity", unitKey: "unit" }, { key: "in", label: "Nhập", kind: "quantity", unitKey: "unit" }, { key: "out", label: "Xuất", kind: "quantity", unitKey: "unit" }, { key: "closing", label: "Tồn cuối", kind: "quantity", unitKey: "unit" }, money("closing_value_vnd", "Giá trị tồn")] },
  { key: "CUSTOMER_DEBT", group: "Khách hàng", label: "Công nợ & tuổi nợ", hint: "Khách còn nợ, chia theo số ngày quá hạn (tính đến hôm nay).", permission: "finance.ar.read",
    columns: [{ key: "label", label: "Khách hàng" }, money("total_vnd", "Còn nợ"), money("not_due_vnd", "Chưa đến hạn"), money("d30_vnd", "Quá 1–30 ngày"), money("d60_vnd", "Quá 31–60 ngày"), money("d90_vnd", "Quá trên 60 ngày")], chart: "total_vnd", asOfToday: true },
  { key: "SUPPLIER", group: "Nhà cung cấp", label: "Nhập hàng & công nợ", hint: "Tiền hàng nhập trong kỳ và số còn phải trả từng NCC.", permission: "finance.ap.read",
    columns: [{ key: "label", label: "Nhà cung cấp" }, { key: "documents", label: "Phiếu nhập", kind: "number" }, money("received_vnd", "Tiền hàng nhập"), money("owed_vnd", "Còn phải trả")], chart: "received_vnd" },
  { key: "DELIVERY", group: "Giao hàng", label: "Chuyến theo thợ / xe", hint: "Chuyến đã xong, giao thiếu, không giao được và tiền chuyến.", permission: "delivery.read",
    columns: [{ key: "label", label: "Thợ" }, { key: "vehicle", label: "Xe" }, { key: "documents", label: "Chuyến", kind: "number" }, { key: "partial", label: "Giao thiếu", kind: "number" }, { key: "failed", label: "Không giao", kind: "number" }, money("pay_vnd", "Tiền chuyến")], chart: "documents" },
  { key: "PROFIT", group: "Tài chính", label: "Lãi lỗ", hint: "Doanh thu − giá vốn và chi phí trực tiếp − chi phí vận hành = lợi nhuận.", permission: "finance.profit.read",
    columns: [{ key: "label", label: "Khoản mục" }, money("amount_vnd", "Số tiền")], totals: false },
];

export function centerReport(key: string | undefined) { return CENTER_REPORTS.find((report) => report.key === key); }
export function availableCenterReports(permissions: ReadonlySet<string>) { return CENTER_REPORTS.filter((report) => permissions.has(report.permission)); }

type Rpc = { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> };
const dayStart = (day: string) => new Date(`${day}T00:00:00+07:00`);

export async function loadCenterReport(db: Rpc, branchId: string, report: CenterReport, from: string, to: string, warehouseId?: string): Promise<CenterResult> {
  if (report.key === "PROFIT") {
    const end = dayStart(to); end.setUTCDate(end.getUTCDate() + 1);
    const { data, error } = await db.rpc("finance_dashboard_snapshot", { target_branch_id: branchId, from_inclusive: dayStart(from).toISOString(), to_exclusive: end.toISOString(), knowledge_cutoff: new Date().toISOString() });
    if (error) throw new Error("Không tải được báo cáo lãi lỗ.");
    const snapshot = data as Record<string, { value_vnd?: string | null }>;
    const lines: [string, string][] = [["Doanh thu", "revenue"], ["Giá vốn & chi phí trực tiếp", "direct_cost"], ["Lợi nhuận gộp", "gross_profit"], ["Chi phí vận hành", "operating_expense"], ["Lợi nhuận", "operating_profit"]];
    // The two profit lines are the results the owner reads first: they are marked to stand out.
    return { rows: lines.map(([label, key]) => ({ label, amount_vnd: snapshot[key]?.value_vnd ?? null, strong: key.endsWith("profit") })),
      kpis: [{ label: "Doanh thu", value: snapshot.revenue?.value_vnd ?? null, kind: "money" }, { label: "Lợi nhuận", value: snapshot.operating_profit?.value_vnd ?? null, kind: "money" }] };
  }
  const { data, error } = await db.rpc("report_center", { target_branch_id: branchId, report_key: report.key, from_date: from, to_date: to, target_warehouse_id: warehouseId || null });
  if (error) throw new Error("Không tải được báo cáo.");
  const result = data as { rows?: Record<string, unknown>[]; kpis?: CenterKpi[] };
  // The sales reports count orders: the headline says so, the same as the table column.
  return { rows: result.rows ?? [], kpis: (result.kpis ?? []).map((kpi) => kpi.label === "Số chứng từ" ? { ...kpi, label: "Số đơn" } : kpi) };
}

/** The period of the same length just before this one ("7 ngày" → the 7 days before), for "so với kỳ trước". */
export function previousPeriod(from: string, to: string) {
  const day = 86_400_000;
  const start = Date.parse(`${from}T00:00:00Z`), end = Date.parse(`${to}T00:00:00Z`);
  const length = Math.round((end - start) / day) + 1;
  const iso = (time: number) => new Date(time).toISOString().slice(0, 10);
  return { from: iso(start - length * day), to: iso(start - day) };
}

/** One cell as shown on screen. */
export function cellText(column: CenterColumn, row: Record<string, unknown>): string {
  const value = row[column.key];
  if (value === null || value === undefined || value === "") return "—";
  const text = String(value);
  if (column.kind === "date") return dayText(text);
  if (column.kind === "money") return /^-?\d+$/.test(text) ? formatVnd(vnd(text)) : text;
  if (column.kind === "quantity") return `${formatQuantity(text)}${column.unitKey && row[column.unitKey] ? ` ${row[column.unitKey]}` : ""}`;
  if (column.kind === "number") return Number(text).toLocaleString("vi-VN");
  if (column.kind === "datetime") return formatBusinessDateTime(text);
  if (column.kind === "direction") return text === "RECEIPT" ? "Thu" : "Chi";
  return text;
}

const exportKind = (column: CenterColumn): ExportKind => column.kind === "direction" || !column.kind ? "text" : column.kind;
const unitLabel = (unitKey: string) => unitKey === "base_unit" ? "ĐVT gốc" : "ĐVT";

/**
 * "Tổng cộng" of each money / count column, and of a quantity column when every row has the same unit (tons and bags
 * are never added together). Null for a report without a total row.
 */
export function centerTotals(report: CenterReport, rows: Record<string, unknown>[]): Record<string, string | null> | null {
  if (report.totals === false || rows.length < 2) return null;
  const totals: Record<string, string | null> = {};
  for (const column of report.columns.slice(1)) {
    const kind = exportKind(column);
    if (kind === "quantity" && column.unitKey) {
      const units = new Set(rows.map((row) => String(row[column.unitKey!] ?? "")));
      totals[column.key] = units.size === 1 && !units.has("") ? sumValues(kind, rows.map((row) => row[column.key] == null ? null : String(row[column.key]))) : null;
      if (totals[column.key] !== null) totals[column.unitKey] = [...units][0];
    } else totals[column.key] = sumValues(kind, rows.map((row) => row[column.key] == null ? null : String(row[column.key])));
  }
  return totals;
}

type ExportContext = { from: string; to: string; branchName: string; warehouseName?: string; now?: Date };

/** D57: the hub report as an Excel / CSV table — with its unit columns ("ĐVT"), title block, headline figures and total row. */
export function centerExportTable(report: CenterReport, result: CenterResult, context: ExportContext): ExportTable {
  const columns: { label: string; kind: ExportKind; key: string; direction?: boolean }[] = [];
  const unitsDone = new Set<string>();
  for (const column of report.columns) {
    // The unit goes in its own column just before the first quantity that uses it, so the quantities stay numbers.
    if (column.kind === "quantity" && column.unitKey && !unitsDone.has(column.unitKey)) {
      unitsDone.add(column.unitKey);
      columns.push({ label: unitLabel(column.unitKey), kind: "text", key: column.unitKey });
    }
    columns.push({ label: column.label, kind: exportKind(column), key: column.key, direction: column.kind === "direction" });
  }
  const value = (row: Record<string, unknown>, column: (typeof columns)[number]) => {
    const raw = row[column.key];
    if (raw === null || raw === undefined || raw === "" || raw === "—") return null;
    return column.direction ? (raw === "RECEIPT" ? "Thu" : "Chi") : String(raw);
  };
  const totals = centerTotals(report, result.rows);
  const title = report.group === report.label ? report.label : `${report.group} · ${report.label}`;
  const meta: Array<[string, string]> = [[report.asOfToday ? "Tính đến" : "Kỳ", report.asOfToday ? dayText(context.to) : periodText(context.from, context.to)]];
  if (report.warehouse) meta.push(["Kho", context.warehouseName ?? "Tất cả kho"]);
  meta.push(["Chi nhánh", context.branchName], ["Xuất lúc", exportedAtText(context.now ?? new Date())]);
  return {
    title,
    sheet: report.label,
    meta,
    kpis: result.kpis.map((kpi) => ({ label: kpi.label, kind: kpi.kind, value: kpi.value })),
    columns: columns.map(({ label, kind }) => ({ label, kind })),
    rows: result.rows.map((row) => columns.map((column) => value(row, column))),
    totals: totals ? columns.map((column, index) => index === 0 ? "Tổng cộng" : totals[column.key] ?? null) : null,
    fileBase: reportFileBase(title, report.asOfToday ? undefined : context.from, context.to),
  };
}
