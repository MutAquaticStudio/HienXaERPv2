import { NextResponse } from "next/server";
import { resolveInternalAccess } from "@/lib/access/context";
import { AppError } from "@/lib/core/errors";
import { createServerSupabase } from "@/lib/supabase/server";
import { centerCsv, centerReport, loadCenterReport } from "@/modules/reports/center";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** FB10 (12): CSV of one hub report with the same filters as the screen. */
export async function GET(request: Request) {
  let access: Awaited<ReturnType<typeof resolveInternalAccess>>;
  try { access = await resolveInternalAccess(); }
  catch (error) { return NextResponse.json({ error: "Không có quyền xuất báo cáo." }, { status: error instanceof AppError ? error.status : 503 }); }
  const params = new URL(request.url).searchParams;
  const report = centerReport(params.get("report") ?? undefined);
  const from = params.get("from") ?? "", to = params.get("to") ?? "", warehouse = params.get("warehouse") ?? "";
  if (!report || !DATE.test(from) || !DATE.test(to) || (warehouse && !UUID.test(warehouse))) return NextResponse.json({ error: "Bộ lọc báo cáo không hợp lệ." }, { status: 400 });
  if (!access.permissions.has(report.permission)) return NextResponse.json({ error: "Không có quyền xem báo cáo này." }, { status: 403 });
  try {
    const result = await loadCenterReport(await createServerSupabase(), access.branchId, report, from, to, warehouse || undefined);
    return new NextResponse(centerCsv(report, result), { headers: { "content-type": "text/csv; charset=utf-8", "cache-control": "private, no-store",
      "content-disposition": `attachment; filename="${report.key.toLowerCase()}-${from}-${to}.csv"` } });
  } catch { return NextResponse.json({ error: "Không tải được báo cáo." }, { status: 503 }); }
}
