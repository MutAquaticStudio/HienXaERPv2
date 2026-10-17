import "server-only";
import { z } from "zod";
import { resolveInternalAccess } from "@/lib/access/context";
import { requirePermission } from "@/lib/access/policy";
import { AppError } from "@/lib/core/errors";
import { formatBusinessDateTime } from "@/lib/core/business-time";
import { createServerSupabase } from "@/lib/supabase/server";
import { loadCompanyDocumentHeading } from "@/lib/company/profile";
import { createBusinessDocument } from "./business-document";
import { pdfResponse } from "./standard-document";
import { deliveryDocumentData, purchaseDocumentData, salesDocumentData, type CommercialLine, type DeliveryDocument, type DeliveryDocumentLine, type PurchaseDocument, type SalesDocument } from "./document-data";

export type DocumentKind = "sales" | "purchase" | "delivery";
const config = {
  sales: { permission: "orders.read", table: "sales_order_read", lines: "sales_order_lines", parent: "sales_order_id", order: "line_number", select: "line_number, material_name_snapshot, quantity::text, ordered_uom_id, unit_price_vnd::text, line_total_vnd::text" },
  purchase: { permission: "purchasing.read", table: "purchase_order_read", lines: "purchase_order_line_read", parent: "purchase_order_id", order: "line_number", select: "line_number, material_name_snapshot, quantity, ordered_uom_id, unit_cost_vnd, line_total_cost_vnd" },
  delivery: { permission: "delivery.read", table: "delivery_read", lines: "delivery_line_read", parent: "delivery_id", order: "id", select: "id, material_name_snapshot, source_mode, base_uom_symbol, planned_base_quantity, loaded_base_quantity, actual_base_quantity, accepted_base_quantity, billable_base_quantity" },
} as const;
const dependency = () => new AppError({ code: "DEPENDENCY_UNAVAILABLE", message: "Không thể tải đủ dữ liệu chứng từ. Vui lòng thử lại.", status: 503 });

export async function exportBusinessDocument(kind: DocumentKind, id: string): Promise<Response> {
  try {
    const access = await resolveInternalAccess();
    const c = config[kind]; requirePermission(access, c.permission);
    if (!z.uuid().safeParse(id).success) return new Response("Mã chứng từ không hợp lệ.", { status: 400 });
    const supabase = await createServerSupabase();
    // RLS remains active. Scope to the selected branch as well as the document ID.
    const header = await supabase.from(c.table).select("*").eq("id", id).eq("branch_id", access.branchId).maybeSingle();
    if (header.error) throw dependency();
    if (!header.data) return new Response("Không tìm thấy chứng từ trong phạm vi được phép.", { status: 404 });
    const rawTable = kind === "sales" ? "sales_orders" : "purchase_orders";
    const extraSelect = kind === "sales" ? "receiver_name_snapshot, receiver_phone_snapshot, commercial_terms, draft_version" : "supplier_address_snapshot, commercial_terms, draft_version";
    const readExtra = () => kind === "delivery"
      ? supabase.from("delivery_results").select("result_kind, receiver_name, note").eq("delivery_id", id).maybeSingle()
      : supabase.from(rawTable).select(extraSelect).eq("id", id).eq("branch_id", access.branchId).maybeSingle();
    const extra = await readExtra();
    if (extra.error || (kind !== "delivery" && !extra.data) || (kind === "delivery" && header.data.result_kind && !extra.data)) throw dependency();
    const rows: unknown[] = [];
    for (let start = 0; ; start += 500) {
      const result = await supabase.from(c.lines).select(c.select).eq(c.parent, id).order(c.order).range(start, start + 499);
      if (result.error || !result.data) throw dependency();
      rows.push(...result.data);
      if (result.data.length < 500) break;
    }
    if (!rows.length) throw dependency(); // Never emit an apparently complete, empty document on partial access.
    const meta = { branch: access.branchName, generatedAt: formatBusinessDateTime(new Date().toISOString()) };
    let input;
    if (kind === "delivery") {
      const reported = extra.data as { result_kind: string; receiver_name: string | null; note: string | null } | null;
      input = deliveryDocumentData({ ...header.data, reported_result_kind: reported?.result_kind ?? null, reported_receiver_name: reported?.receiver_name ?? null, result_note: reported?.note ?? null } as DeliveryDocument, rows as DeliveryDocumentLine[], meta);
    } else {
      const extraData = extra!.data as unknown as Record<string, unknown>;
      const lines = rows as CommercialLine[];
      const symbols = new Map<string, string>();
      const ids = [...new Set(lines.map(l => l.ordered_uom_id))];
      for (let i = 0; i < ids.length; i += 100) {
        const uoms = await supabase.from("units_of_measure").select("id, symbol").in("id", ids.slice(i, i + 100));
        if (uoms.error || !uoms.data) throw dependency();
        uoms.data.forEach(u => symbols.set(u.id, u.symbol));
      }
      if (ids.some(u => !symbols.has(u))) throw dependency();
      input = kind === "sales"
        ? salesDocumentData({ ...header.data, ...extraData } as SalesDocument, lines, symbols, meta)
        : purchaseDocumentData({ ...header.data, ...extraData } as PurchaseDocument, lines, symbols, access.permissions.has("purchasing.price.read"), meta);
    }
    // A draft edit or state transition during export must not yield mixed old/new data.
    const latest = await supabase.from(c.table).select("*").eq("id", id).eq("branch_id", access.branchId).maybeSingle();
    const latestExtra = await readExtra();
    if (latest.error || !latest.data || (latestExtra.error || (kind !== "delivery" && !latestExtra.data))) throw dependency();
    if (JSON.stringify(latest.data) !== JSON.stringify(header.data) || JSON.stringify(latestExtra?.data) !== JSON.stringify(extra?.data)) {
      return new Response("Chứng từ vừa thay đổi. Hãy tải lại và xuất PDF lần nữa.", { status: 409, headers: { "Cache-Control": "private, no-store" } });
    }
    const bytes = await createBusinessDocument({ ...input, company: await loadCompanyDocumentHeading(supabase) });
    return pdfResponse(bytes, `${input.reference}.pdf`);
  } catch (error) {
    if (error instanceof AppError) return Response.json(error.toResponseBody(), { status: error.status, headers: { "Cache-Control": "private, no-store" } });
    console.error("document_pdf_export_failed");
    return new Response("Không thể tạo PDF. Vui lòng thử lại.", { status: 503 });
  }
}
