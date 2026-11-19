import "server-only";
import { z } from "zod";
import { resolveInternalAccess } from "@/lib/access/context";
import { requirePermission } from "@/lib/access/policy";
import { AppError } from "@/lib/core/errors";
import { createServerSupabase } from "@/lib/supabase/server";
import { loadCompanyDocumentHeading } from "@/lib/company/profile";
import { pdfResponse } from "./standard-document";
import type { CommercialLine, DeliveryDocument, DeliveryDocumentLine, PurchaseDocument, SalesDocument } from "./document-data";
import { createPrintDocument, type Paper, type PrintDocumentInput } from "./print-document";
import { deliveryPrint, purchasePrint, salesDebt, salesPrint } from "./print-builders";
import { loadOpenDebts, loadShownBank, loadVietQr } from "./print-data";
import { bankTransferNote } from "@/modules/finance/transfer-note";
import { prepaymentReference, prepaymentSummary, type PrepaymentReceipt } from "@/modules/sales/prepayment";
import { loadSellers } from "@/modules/sales/seller";

export type DocumentKind = "sales" | "purchase" | "delivery";
const config = {
  sales: { permission: "orders.read", table: "sales_order_read", lines: "sales_order_lines", parent: "sales_order_id", order: "line_number", select: "line_number, material_name_snapshot, quantity::text, ordered_uom_id, unit_price_vnd::text, line_total_vnd::text, list_unit_price_vnd::text, discount_mode, discount_value::text" },
  purchase: { permission: "purchasing.read", table: "purchase_order_read", lines: "purchase_order_line_read", parent: "purchase_order_id", order: "line_number", select: "line_number, material_name_snapshot, quantity, ordered_uom_id, unit_cost_vnd, line_total_cost_vnd" },
  delivery: { permission: "delivery.read", table: "delivery_read", lines: "delivery_line_read", parent: "delivery_id", order: "id", select: "id, material_name_snapshot, source_mode, base_uom_symbol, planned_base_quantity, loaded_base_quantity, actual_base_quantity, accepted_base_quantity, billable_base_quantity" },
} as const;
const dependency = () => new AppError({ code: "DEPENDENCY_UNAVAILABLE", message: "Không thể tải đủ dữ liệu chứng từ. Vui lòng thử lại.", status: 503 });

/** `paper`: A4 for every document; the sales order also prints on an 80 mm receipt printer (D52, "?kho=k80"). */
export async function exportBusinessDocument(kind: DocumentKind, id: string, paper: Paper = "A4"): Promise<Response> {
  try {
    const access = await resolveInternalAccess();
    const c = config[kind]; requirePermission(access, c.permission);
    if (!z.guid().safeParse(id).success) return new Response("Mã chứng từ không hợp lệ.", { status: 400 });
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
    const printedAt = new Date().toISOString();
    const company = await loadCompanyDocumentHeading(supabase);
    let input: PrintDocumentInput;
    if (kind === "delivery") {
      const delivery = header.data as unknown as DeliveryDocument & { sales_order_id: string; customer_id?: string; employee_id: string | null; vehicle_id: string | null; external_carrier_name: string | null };
      const [orderResult, phoneResult, employeeResult, vehicleResult] = await Promise.all([
        supabase.from("sales_order_read").select("order_number, customer_id").eq("id", delivery.sales_order_id).maybeSingle(),
        supabase.from("sales_orders").select("customers(phone)").eq("id", delivery.sales_order_id).maybeSingle(),
        delivery.employee_id ? supabase.from("workforce_read").select("display_name").eq("id", delivery.employee_id).maybeSingle() : Promise.resolve({ data: null }),
        delivery.vehicle_id ? supabase.from("vehicles").select("code, plate_number").eq("id", delivery.vehicle_id).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      const customers = (phoneResult.data as { customers?: { phone: string | null } | { phone: string | null }[] | null } | null)?.customers;
      const driver = delivery.external_carrier_name
        ?? ([(employeeResult.data as { display_name: string } | null)?.display_name, (vehicleResult.data as { code: string; plate_number: string | null } | null)?.plate_number ?? (vehicleResult.data as { code: string } | null)?.code].filter(Boolean).join(" · ") || null);
      input = deliveryPrint({ paper: "A4", company, printedAt, delivery, orderNumber: (orderResult.data as { order_number: string } | null)?.order_number ?? null, driver,
        customerPhone: (Array.isArray(customers) ? customers[0] : customers)?.phone ?? null,
        lines: (rows as DeliveryDocumentLine[]).map((line) => ({ material_name_snapshot: line.material_name_snapshot, unit: line.base_uom_symbol,
          planned_base_quantity: String(line.planned_base_quantity), accepted_base_quantity: line.accepted_base_quantity == null ? null : String(line.accepted_base_quantity) })) });
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
      if (kind === "sales") {
        const order = { ...header.data, ...extraData } as unknown as SalesDocument & { customer_id: string; confirmed_at: string | null; sales_owner_employee_id?: string | null };
        const canDebts = access.permissions.has("finance.ar.read");
        // D52: the customer's code and phone, the seller, what was paid ahead, the open debts and the account to pay into.
        const [customerResult, ownerResult, prepaidResult, debts, bank, sellers] = await Promise.all([
          supabase.from("customers").select("code, phone").eq("id", order.customer_id).maybeSingle(),
          supabase.from("sales_orders").select("sales_owner_employee_id").eq("id", id).maybeSingle(),
          canDebts ? supabase.from("payment_read").select("id, payment_number, method, amount_vnd::text, posting_state, reversal_of_payment_id").eq("branch_id", access.branchId)
            .eq("customer_id", order.customer_id).eq("direction", "RECEIPT").eq("external_reference", prepaymentReference(order.order_number)).limit(20) : Promise.resolve({ data: [] }),
          canDebts ? loadOpenDebts(supabase, access.branchId, order.customer_id) : Promise.resolve(null),
          loadShownBank(supabase, access.branchId),
          loadSellers(supabase, access.branchId),
        ]);
        const customer = customerResult.data as { code: string; phone: string | null } | null;
        const sellerId = (ownerResult.data as { sales_owner_employee_id: string | null } | null)?.sales_owner_employee_id ?? null;
        const prepaidVnd = prepaymentSummary((prepaidResult.data ?? []) as PrepaymentReceipt[], order.total_vnd ?? "0").paidVnd;
        const printLines = lines.map((line) => ({ ...line, unit: symbols.get(line.ordered_uom_id) ?? "", unit_price_vnd: line.unit_price_vnd ?? "0", line_total_vnd: line.line_total_vnd ?? "0" }));
        const debt = salesDebt(order, prepaidVnd, debts ?? []);
        const qrAmount = (debts ? debt.owed : debt.total).toString();
        const qrImage = bank && order.commercial_state !== "DRAFT" && BigInt(qrAmount) > 0n
          ? await loadVietQr(bank, qrAmount, bankTransferNote(bank.prefix, order.order_number, customer?.code)) : null;
        input = salesPrint({ paper, company, printedAt, order: { ...order, total_vnd: order.total_vnd ?? "0" }, lines: printLines, customer,
          seller: sellers.find((seller) => seller.id === sellerId)?.name ?? null, prepaidVnd, debts, bank, qrImage });
      } else {
        const order = { ...header.data, ...extraData } as unknown as PurchaseDocument & { supplier_id: string };
        const supplier = await supabase.from("suppliers").select("phone").eq("id", order.supplier_id).maybeSingle();
        input = purchasePrint({ paper: "A4", company, printedAt, order, prices: access.permissions.has("purchasing.price.read"),
          supplierPhone: (supplier.data as { phone: string | null } | null)?.phone ?? null,
          lines: lines.map((line) => ({ line_number: line.line_number, material_name_snapshot: line.material_name_snapshot, quantity: String(line.quantity),
            unit: symbols.get(line.ordered_uom_id) ?? "", unit_cost_vnd: line.unit_cost_vnd ?? null, line_total_cost_vnd: line.line_total_cost_vnd ?? null })) });
      }
    }
    // A draft edit or state transition during export must not yield mixed old/new data.
    const latest = await supabase.from(c.table).select("*").eq("id", id).eq("branch_id", access.branchId).maybeSingle();
    const latestExtra = await readExtra();
    if (latest.error || !latest.data || (latestExtra.error || (kind !== "delivery" && !latestExtra.data))) throw dependency();
    if (JSON.stringify(latest.data) !== JSON.stringify(header.data) || JSON.stringify(latestExtra?.data) !== JSON.stringify(extra?.data)) {
      return new Response("Chứng từ vừa thay đổi. Hãy tải lại và xuất PDF lần nữa.", { status: 409, headers: { "Cache-Control": "private, no-store" } });
    }
    const bytes = await createPrintDocument(input);
    return pdfResponse(bytes, `${input.reference}${paper === "K80" ? "-k80" : ""}.pdf`);
  } catch (error) {
    if (error instanceof AppError) return Response.json(error.toResponseBody(), { status: error.status, headers: { "Cache-Control": "private, no-store" } });
    console.error("document_pdf_export_failed");
    return new Response("Không thể tạo PDF. Vui lòng thử lại.", { status: 503 });
  }
}
