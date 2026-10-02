import { requireInternalPermission } from "@/lib/access/context";
import { AppError } from "@/lib/core/errors";
import { createServerSupabase } from "@/lib/supabase/server";
import { availableReportKinds, loadFixedReport, loadObligationRows, type ReportFilters, type ReportKind, type ReportRow } from "@/modules/reports/server";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const noStore = { "Cache-Control": "private, no-store" };
type ExportJob = { id: string; branch_id: string; side: "AR" | "AP"; state: string; processed_rows: number; attempt: number; safe_error: string | null; as_of_date?: string; knowledge_cutoff?: string; customer_id?: string | null; rows_json?: ReportRow[] };

function localDate() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function cell(value: string) { const safe = /^[\s]*[=+@-]/.test(value) ? `'${value}` : value; return `"${safe.replaceAll('"', '""')}"`; }

function csvResponse(report: Awaited<ReturnType<typeof loadFixedReport>>, rows: ReportRow[], requested: ReportKind, asOf: string) {
  const lines = [
    ["report", report.title],
    ["scope", report.scopeText],
    ["quality", report.quality],
    ["total_vnd", report.totalVnd ?? ""],
    [],
    ["id", "label", "context", "date", "amount_vnd"],
    ...rows.map((row) => [row.id, row.label, row.context, row.date, row.amountVnd]),
  ];
  const csv = `\uFEFF${lines.map((line) => line.map((value) => cell(String(value))).join(",")).join("\r\n")}`;
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${requested}-${asOf}.csv"`, ...noStore } });
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
  if (job.state !== "COMPLETED") return Response.json({ error: "export_job_incomplete" }, { status: 409, headers: noStore });
  if (!job.as_of_date || !job.knowledge_cutoff || !Array.isArray(job.rows_json)) return Response.json({ error: "export_job_invalid" }, { status: 500, headers: noStore });
  const requested: ReportKind = job.side === "AR" ? "receivables" : "payables";
  const asOf = job.as_of_date;
  const filters: ReportFilters = { report: requested, from: `${asOf.slice(0, 7)}-01`, to: asOf, asOf, cutoff: job.knowledge_cutoff, customerId: job.customer_id ?? undefined };
  const report = await loadFixedReport(access, filters);
  return csvResponse(report, job.rows_json, requested, asOf);
}

async function initialRequest(request: Request, createJob: boolean) {
  const access = await accessOrResponse();
  if (access instanceof Response) return access;
  const params = new URL(request.url).searchParams;
  const available = availableReportKinds(access.permissions);
  const requested = params.get("report") as ReportKind;
  if (!available.includes(requested)) return Response.json({ error: "report_forbidden" }, { status: 403, headers: noStore });
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
  if (requested === "expenses" || report.quality !== "READY") return csvResponse(report, report.rows, requested, filters.asOf);

  const beyondThousand = await loadObligationRows(access, filters, cutoff, 1000, 1);
  if (beyondThousand.rows.length) {
    if (!createJob) return Response.json({ error: "export_requires_job", message: "Dùng nút Xuất CSV trên trang báo cáo." }, { status: 409, headers: noStore });
    const supabase = await createServerSupabase();
    const { data, error } = await supabase.rpc("create_report_export_job", {
      target_branch_id: access.branchId,
      target_side: requested === "receivables" ? "AR" : "AP",
      target_as_of: filters.asOf,
      target_cutoff: cutoff,
      target_customer_id: requested === "receivables" ? filters.customerId ?? null : null,
    });
    if (error || !data) return Response.json({ error: "export_job_create_failed" }, { status: 500, headers: noStore });
    return Response.json({ jobId: data, state: "PENDING" }, { status: 202, headers: noStore });
  }

  const rows: ReportRow[] = [];
  for (let offset = 0; ; offset += 500) {
    const batch = await loadObligationRows(access, filters, cutoff, offset, 500);
    rows.push(...batch.rows);
    if (!batch.hasNext) break;
  }
  return csvResponse(report, rows, requested, filters.asOf);
}

export async function GET(request: Request) {
  return new URL(request.url).searchParams.has("job") ? jobRequest(request, false) : initialRequest(request, false);
}

export async function POST(request: Request) {
  return new URL(request.url).searchParams.has("job") ? jobRequest(request, true) : initialRequest(request, true);
}
