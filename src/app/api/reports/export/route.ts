import { requireInternalPermission } from "@/lib/access/context";
import { AppError } from "@/lib/core/errors";
import { createServerSupabase } from "@/lib/supabase/server";
import { availableReportKinds, loadFixedReport, loadObligationRows, type ReportFilters, type ReportKind, type ReportRow } from "@/modules/reports/server";
import { attachmentHeader, EXPORT_CONTENT_TYPE, exportFormat, toReportCsv, type ExportFormat } from "@/modules/reports/export-table";
import { toReportXlsx } from "@/modules/reports/export-xlsx";
import { financeExportTable } from "@/modules/reports/finance-table";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const noStore = { "Cache-Control": "private, no-store" };
type ExportJob = { id: string; branch_id: string; side: "AR" | "AP"; state: string; processed_rows: number; attempt: number; safe_error: string | null; as_of_date?: string; knowledge_cutoff?: string; customer_id?: string | null; rows_json?: ReportRow[] };

function localDate() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
type Access = Awaited<ReturnType<typeof requireInternalPermission>>;

/** D57: every open item (or every expense line) of the report as an Excel or CSV file, with Vietnamese columns. */
async function fileResponse(access: Access, report: Awaited<ReturnType<typeof loadFixedReport>>, rows: ReportRow[], requested: ReportKind, filters: { from: string; to: string }, format: ExportFormat) {
  const table = financeExportTable(requested, report, rows, { from: filters.from, to: filters.to, branchName: access.branchName });
  const body = format === "xlsx" ? new Uint8Array(await toReportXlsx(table)) : toReportCsv(table);
  return new Response(body, { headers: { "Content-Type": EXPORT_CONTENT_TYPE[format], "Content-Disposition": attachmentHeader(table.fileBase, format), ...noStore } });
}

async function accessOrResponse() {
  try {
    return await requireInternalPermission("dashboard.read");
  } catch (error) {
    if (error instanceof AppError) return Response.json(error.toResponseBody(), { status: error.status, headers: noStore });
    throw error;
  }
}

async function jobRequest(request: Request, advance: boolean) {
  const access = await accessOrResponse();
  if (access instanceof Response) return access;
  const params = new URL(request.url).searchParams;
  const jobId = params.get("job") ?? "";
  if (!UUID.test(jobId)) return Response.json({ error: "invalid_job" }, { status: 400, headers: noStore });
  const supabase = await createServerSupabase();
  if (advance) {
    const { data, error } = await supabase.rpc("advance_report_export_job", { target_job_id: jobId });
    if (error) return Response.json({ error: "export_job_unavailable" }, { status: error.code === "42501" ? 403 : 500, headers: noStore });
    return Response.json(data, { status: (data as { state: string }).state === "COMPLETED" ? 200 : 202, headers: noStore });
  }
  const { data, error } = await supabase.from("report_export_jobs")
    .select(params.get("download") === "1" ? "id,branch_id,side,as_of_date,knowledge_cutoff,customer_id,state,processed_rows,attempt,safe_error,rows_json" : "id,branch_id,side,state,processed_rows,attempt,safe_error")
    .eq("id", jobId).single();
  const job = data as unknown as ExportJob | null;
  if (error || !job || job.branch_id !== access.branchId) return Response.json({ error: "export_job_not_found" }, { status: 404, headers: noStore });
  if (params.get("download") !== "1") return Response.json({ id: job.id, state: job.state, processedRows: job.processed_rows, attempt: job.attempt, safeError: job.safe_error }, { headers: noStore });
  if (job.state !== "COMPLETED") return Response.json({ error: "export_job_incomplete", message: "File chưa xuất xong. Bấm tiếp tục để làm nốt." }, { status: 409, headers: noStore });
  if (!job.as_of_date || !job.knowledge_cutoff || !Array.isArray(job.rows_json)) return Response.json({ error: "export_job_invalid" }, { status: 500, headers: noStore });
  const requested: ReportKind = job.side === "AR" ? "receivables" : "payables";
  const asOf = job.as_of_date;
  const filters: ReportFilters = { report: requested, from: `${asOf.slice(0, 7)}-01`, to: asOf, asOf, cutoff: job.knowledge_cutoff, customerId: job.customer_id ?? undefined };
  const report = await loadFixedReport(access, filters);
  return fileResponse(access, report, job.rows_json, requested, { from: filters.from, to: asOf }, exportFormat(params.get("format")));
}

async function initialRequest(request: Request, createJob: boolean) {
  const access = await accessOrResponse();
  if (access instanceof Response) return access;
  const params = new URL(request.url).searchParams;
  const available = availableReportKinds(access.permissions);
  const requested = params.get("report") as ReportKind;
  if (!available.includes(requested)) return Response.json({ error: "report_forbidden", message: "Bạn chưa có quyền xem báo cáo này." }, { status: 403, headers: noStore });
  const today = localDate();
  const to = DATE.test(params.get("to") ?? "") ? params.get("to")! : today;
  const cutoffValue = params.get("cutoff");
  const cutoff = cutoffValue && Number.isFinite(Date.parse(cutoffValue)) && Date.parse(cutoffValue) <= Date.now() ? cutoffValue : new Date().toISOString();
  const filters: ReportFilters = {
    report: requested,
    from: DATE.test(params.get("from") ?? "") ? params.get("from")! : `${to.slice(0, 7)}-01`,
    to,
    asOf: DATE.test(params.get("asOf") ?? "") ? params.get("asOf")! : today,
    customerId: UUID.test(params.get("customer") ?? "") ? params.get("customer")! : undefined,
    activity: params.get("activity") || undefined,
    cutoff,
  };
  const report = await loadFixedReport(access, filters);
  const format = exportFormat(params.get("format"));
  const period = { from: filters.from, to: requested === "expenses" ? filters.to : filters.asOf };
  if (requested === "expenses" || report.quality !== "READY") return fileResponse(access, report, report.rows, requested, period, format);

  const beyondThousand = await loadObligationRows(access, filters, cutoff, 1000, 1);
  if (beyondThousand.rows.length) {
    if (!createJob) return Response.json({ error: "export_requires_job", message: "Báo cáo nhiều dòng: dùng nút xuất trên trang báo cáo." }, { status: 409, headers: noStore });
    const supabase = await createServerSupabase();
    const { data, error } = await supabase.rpc("create_report_export_job", {
      target_branch_id: access.branchId,
      target_side: requested === "receivables" ? "AR" : "AP",
      target_as_of: filters.asOf,
      target_cutoff: cutoff,
      target_customer_id: requested === "receivables" ? filters.customerId ?? null : null,
    });
    if (error || !data) return Response.json({ error: "export_job_create_failed", message: "Chưa tạo được tác vụ xuất file. Thử lại sau ít phút." }, { status: 500, headers: noStore });
    return Response.json({ jobId: data, state: "PENDING" }, { status: 202, headers: noStore });
  }

  const rows: ReportRow[] = [];
  for (let offset = 0; ; offset += 500) {
    const batch = await loadObligationRows(access, filters, cutoff, offset, 500);
    rows.push(...batch.rows);
    if (!batch.hasNext) break;
  }
  return fileResponse(access, report, rows, requested, period, format);
}

export async function GET(request: Request) {
  return new URL(request.url).searchParams.has("job") ? jobRequest(request, false) : initialRequest(request, false);
}

export async function POST(request: Request) {
  return new URL(request.url).searchParams.has("job") ? jobRequest(request, true) : initialRequest(request, true);
}
