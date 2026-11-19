import { NextResponse } from "next/server";
import { resolveInternalAccess } from "@/lib/access/context";
import { AppError } from "@/lib/core/errors";
import { createServerSupabase } from "@/lib/supabase/server";
import { centerExportTable, centerReport, loadCenterReport } from "@/modules/reports/center";
import { attachmentHeader, EXPORT_CONTENT_TYPE, exportFormat, toReportCsv } from "@/modules/reports/export-table";
import { toReportXlsx } from "@/modules/reports/export-xlsx";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const noStore = { "cache-control": "private, no-store" };

/** FB10 (12) + D57: one hub report as an Excel (`format=xlsx`) or CSV file, with the same filters as the screen. */
async function exportReport(request: Request) {
  let access: Awaited<ReturnType<typeof resolveInternalAccess>>;
  try { access = await resolveInternalAccess(); }
  catch (error) { return NextResponse.json({ error: "Không có quyền xuất báo cáo." }, { status: error instanceof AppError ? error.status : 503, headers: noStore }); }
  const params = new URL(request.url).searchParams;
  const report = centerReport(params.get("report") ?? undefined);
  const from = params.get("from") ?? "", to = params.get("to") ?? "", warehouse = params.get("warehouse") ?? "";
  if (!report || !DATE.test(from) || !DATE.test(to) || (warehouse && !UUID.test(warehouse))) return NextResponse.json({ error: "Bộ lọc báo cáo không hợp lệ." }, { status: 400, headers: noStore });
  if (!access.permissions.has(report.permission)) return NextResponse.json({ error: "Bạn chưa có quyền xem báo cáo này." }, { status: 403, headers: noStore });
  const format = exportFormat(params.get("format"));
  try {
    const db = await createServerSupabase();
    const [result, warehouseRow] = await Promise.all([
      loadCenterReport(db, access.branchId, report, from, to, warehouse || undefined),
      report.warehouse && warehouse ? db.from("warehouses").select("name").eq("branch_id", access.branchId).eq("id", warehouse).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const table = centerExportTable(report, result, { from, to, branchName: access.branchName, warehouseName: (warehouseRow.data as { name?: string } | null)?.name });
    const body = format === "xlsx" ? new Uint8Array(await toReportXlsx(table)) : toReportCsv(table);
    return new NextResponse(body, { headers: { "content-type": EXPORT_CONTENT_TYPE[format], ...noStore, "content-disposition": attachmentHeader(table.fileBase, format) } });
  } catch { return NextResponse.json({ error: "Chưa tải được báo cáo. Thử lại sau ít phút." }, { status: 503, headers: noStore }); }
}

export const GET = exportReport;
export const POST = exportReport;
