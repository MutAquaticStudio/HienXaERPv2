import { requireInternalPermission } from "@/lib/access/context";
import { AppError } from "@/lib/core/errors";
import { ilikePattern, parseCoreListQuery } from "@/lib/core-list";
import { createServerSupabase } from "@/lib/supabase/server";
import { availableReportKinds, type ReportKind } from "@/modules/reports/server";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  try {
    const access = await requireInternalPermission("dashboard.read");
    const params = new URL(request.url).searchParams;
    const report = params.get("report") as ReportKind;
    if (report === "payables" || !availableReportKinds(access.permissions).includes(report)) {
      return Response.json({ error: "Không có quyền tìm khách cho báo cáo này." }, { status: 403, headers });
    }
    const q = parseCoreListQuery({ q: params.get("q") ?? undefined }).q;
    if (!q) return Response.json({ customers: [] }, { headers });
    const supabase = await createServerSupabase();
    const { data, error } = await supabase.from("customers").select("id, display_name")
      .eq("branch_id", access.branchId).eq("active", true)
      .ilike("display_name", ilikePattern(q)).order("display_name").order("id").limit(25);
    if (error) return Response.json({ error: "Không thể tìm khách hàng." }, { status: 503, headers });
    return Response.json({ customers: data ?? [] }, { headers });
  } catch (error) {
    if (error instanceof AppError) return Response.json(error.toResponseBody(), { status: error.status, headers });
    throw error;
  }
}
