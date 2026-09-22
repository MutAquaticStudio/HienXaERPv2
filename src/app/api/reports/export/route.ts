import { requireInternalPermission } from "@/lib/access/context";
import { AppError } from "@/lib/core/errors";
import { availableReportKinds, loadFixedReport, type ReportKind } from "@/modules/reports/server";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function localDate() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function cell(value: string) { const safe = /^[=+@-]/.test(value) ? `'${value}` : value; return `"${safe.replaceAll('"', '""')}"`; }

export async function GET(request: Request) {
  let access: Awaited<ReturnType<typeof requireInternalPermission>>;
  try {
    access = await requireInternalPermission("dashboard.read");
  } catch (error) {
    if (error instanceof AppError) return Response.json(error.toResponseBody(), { status: error.status, headers: { "Cache-Control": "private, no-store" } });
    throw error;
  }
  const params = new URL(request.url).searchParams;
  const available = availableReportKinds(access.permissions);
  const requested = params.get("report") as ReportKind;
  if (!available.includes(requested)) return new Response("Không có quyền xuất báo cáo.", { status: 403 });
  const today = localDate();
  const to = DATE.test(params.get("to") ?? "") ? params.get("to")! : today;
  const filters = {
    report: requested,
    from: DATE.test(params.get("from") ?? "") ? params.get("from")! : `${to.slice(0, 7)}-01`,
    to,
    asOf: DATE.test(params.get("asOf") ?? "") ? params.get("asOf")! : today,
    customerId: UUID.test(params.get("customer") ?? "") ? params.get("customer")! : undefined,
    activity: params.get("activity") || undefined,
  };
  const report = await loadFixedReport(access, filters);
  const lines = [
    ["report", report.title],
    ["scope", report.scopeText],
    ["quality", report.quality],
    ["total_vnd", report.totalVnd ?? ""],
    [],
    ["id", "label", "context", "date", "amount_vnd"],
    ...report.rows.map((row) => [row.id, row.label, row.context, row.date, row.amountVnd]),
  ];
  const csv = `\uFEFF${lines.map((line) => line.map((value) => cell(String(value))).join(",")).join("\r\n")}`;
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${requested}-${filters.asOf || filters.to}.csv"`, "Cache-Control": "private, no-store" } });
}
