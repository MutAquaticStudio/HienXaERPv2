import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { AppError } from "@/lib/core/errors";
const headers = { "Cache-Control": "private, no-store" };
const cell = (v: unknown) => { const text = String(v ?? ""), safe = /^[\s]*[=+@-]/.test(text) ? `'${text}` : text; return `"${safe.replaceAll('"', '""')}"`; };
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
 try {
  const access = await requireInternalPermission("finance.ap.read"), { id } = await context.params; if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "not_found" }, { status: 404, headers }); const db = await createServerSupabase();
  const { data: d, error } = await db.from("supplier_document_read").select("*").eq("id", id).eq("branch_id", access.branchId).maybeSingle(); if (error || !d) return Response.json({ error: "not_found" }, { status: 404, headers });
  const { data: lines, error: lineError } = await db.from("supplier_document_line_read").select("*").eq("document_id", id).order("line_number"); if (lineError) return Response.json({ error: "source_unavailable" }, { status: 500, headers });
  const rows = [["scope", "INTERNAL_SOURCE_RECONCILIATION"], ["legal_state", "EXTERNAL_DOCUMENT_UNVERIFIED"], ["document", d.document_number], ["match", d.match_state], ["business", d.business_state], ["declared_vnd", d.declared_value_vnd], [], ["source_kind", "source_id", "po_line", "material", "uom", "source_qty", "declared_qty", "source_price", "declared_price", "source_value_vnd", "declared_value_vnd", "approved_charge_vnd", "match"], ...(lines ?? []).map(l => [l.source_kind, l.source_id, l.purchase_order_line_id, l.material_name, l.uom_symbol, l.source_quantity, l.document_quantity, l.source_unit_cost, l.document_unit_cost, l.source_value_vnd, l.document_value_vnd, l.approved_return_charge_vnd, l.match_result])];
  return new Response("\uFEFF" + rows.map(row => row.map(cell).join(",")).join("\r\n"), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="supplier-document-${id}.csv"` } });
 } catch (error) { if (error instanceof AppError) return Response.json(error.toResponseBody(), { status: error.status, headers }); throw error; }
}
