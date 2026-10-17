import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CommercialDocumentForm, type ExistingCommercialDraft } from "@/components/sales/commercial-document-form";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { loadSalesFormOptions } from "@/modules/sales/form-options";

/** "5.00" → "5", "2.50" → "2,5", "3000.00" → "3000": how the discount boxes expect it. */
function editableDiscount(value: string) {
  const trimmed = value.includes(".") ? value.replace(/0+$/, "").replace(/\.$/, "") : value;
  return trimmed.replace(".", ",");
}

export default async function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await requireInternalPermission("orders.create");
  const { id } = await params;
  const supabase = await createServerSupabase();
  const [orderResult, lineResult] = await Promise.all([
    supabase.from("sales_orders").select("id, branch_id, order_number, customer_id, site_id, commercial_state, draft_version, requested_delivery_at, commercial_terms, order_discount_mode, order_discount_value::text")
      .eq("id", id).eq("branch_id", access.branchId).maybeSingle(),
    supabase.from("sales_order_lines").select("id, material_id, ordered_uom_id, quantity, unit_price_vnd::text, list_unit_price_vnd::text, price_source_type, override_reason, discount_mode, discount_value::text")
      .eq("sales_order_id", id).order("line_number"),
  ]);
  const order = orderResult.data;
  if (orderResult.error || lineResult.error || !order || order.commercial_state !== "DRAFT" || !lineResult.data?.length) notFound();
  const options = await loadSalesFormOptions(access.branchId, order.customer_id, order.site_id);
  const existing: ExistingCommercialDraft = {
    id: order.id, version: order.draft_version, customerId: order.customer_id, siteId: order.site_id,
    effectiveAt: order.requested_delivery_at, terms: order.commercial_terms,
    // A discounted line is edited from its price before discount; the discount is shown again in the price popup.
    lines: lineResult.data.map((line) => ({ sourceLineId: line.id, materialId: line.material_id, uomId: line.ordered_uom_id,
      quantity: String(line.quantity), manualPriceVnd: line.price_source_type === "MANUAL_APPROVED" ? String(line.list_unit_price_vnd ?? line.unit_price_vnd) : "",
      manualReason: line.price_source_type === "MANUAL_APPROVED" ? line.override_reason ?? "" : "",
      discountMode: line.discount_mode === "AMOUNT" || line.discount_mode === "PERCENT" ? line.discount_mode : "",
      discountValue: line.discount_value ? editableDiscount(line.discount_value) : "" })),
    orderDiscount: order.order_discount_mode === "AMOUNT" || order.order_discount_mode === "PERCENT"
      ? { mode: order.order_discount_mode, value: editableDiscount(order.order_discount_value ?? "") } : null,
  };
  return <><header className="page-heading"><div><p className="eyebrow">Đơn bán · Bản nháp</p><h1>Sửa {order.order_number}</h1><p className="lede">Sửa dòng hàng, ngày giao và điều khoản. Giá được kiểm lại trước khi lưu.</p></div><Link className="button button-secondary" href={`/admin/orders/${id}`}>Về đơn bán</Link></header>
    <CommercialDocumentForm kind="order" options={options} operationId={randomUUID()} canManagePrice={access.permissions.has("pricing.manage")} canManageCustomers={false} existing={existing} /></>;
}
