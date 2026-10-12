import { requireInternalPermission } from "@/lib/access/context";
import { ilikePattern, parseCoreListQuery, CORE_LIST_PAGE_SIZE } from "@/lib/core-list";
import { AppError } from "@/lib/core/errors";
import { createServerSupabase } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const side = params.get("side");
  const partyId = params.get("party") ?? "";
  if ((side !== "AR" && side !== "AP") || !UUID.test(partyId)) return Response.json({ error: "invalid_selection" }, { status: 400 });
  let access: Awaited<ReturnType<typeof requireInternalPermission>>;
  try {
    access = await requireInternalPermission(side === "AR" ? "finance.ar.read" : "finance.ap.read");
  } catch (error) {
    if (error instanceof AppError) return Response.json(error.toResponseBody(), { status: error.status });
    throw error;
  }
  if (!access.permissions.has("finance.payment.post")) return Response.json({ error: "forbidden" }, { status: 403 });
  const page = parseCoreListQuery({ q: params.get("q") ?? "", page: params.get("page") ?? "1" });
  const supabase = await createServerSupabase();
  const query = side === "AR"
    ? supabase.from("receivable_read").select("id, source_label, due_date, outstanding_amount_vnd::text, site_name").eq("branch_id", access.branchId).eq("customer_id", partyId)
    : supabase.from("payable_read").select("id, source_label, due_date, outstanding_amount_vnd::text").eq("branch_id", access.branchId).eq("supplier_id", partyId);
  let filtered = query.gt("outstanding_amount_vnd", 0);
  if (page.q) filtered = filtered.ilike("source_label", ilikePattern(page.q));
  const { data, error } = await filtered.order("due_date").order("id").range(page.from, page.to + 1);
  if (error) return Response.json({ error: "query_failed" }, { status: 500 });
  const fetched = data ?? [];
  const rows = fetched.slice(0, CORE_LIST_PAGE_SIZE).map((item) => ({
    id: item.id,
    sourceLabel: side === "AR" ? `${item.source_label} · ${"site_name" in item ? item.site_name ?? "Chưa gắn công trình" : "Chưa gắn công trình"}` : item.source_label,
    dueDate: item.due_date,
    outstandingAmountVnd: String(item.outstanding_amount_vnd),
  }));
  return Response.json({ rows, page: page.page, hasNext: fetched.length > CORE_LIST_PAGE_SIZE }, { headers: { "Cache-Control": "private, no-store" } });
}
