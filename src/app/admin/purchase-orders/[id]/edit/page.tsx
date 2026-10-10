import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PurchaseOrderForm, type ExistingPurchaseDraft } from "@/components/purchasing/purchase-order-form";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { loadPurchaseFormOptions, loadSalesOrderPurchaseLines } from "@/modules/purchasing/form-options";

export default async function EditPurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await requireInternalPermission("purchasing.create");
  const { id } = await params;
  if (!access.permissions.has("purchasing.price.read")) {
    return <section className="card card-pad"><h1>Không thể sửa đơn mua này</h1><p>Cần quyền xem giá mua để sửa bản nháp mà không thay đổi giá ẩn.</p><Link className="button button-secondary" href={`/admin/purchase-orders/${id}`}>Về đơn mua</Link></section>;
  }
  const supabase = await createServerSupabase();
  const [orderResult, lineResult] = await Promise.all([
    supabase.from("purchase_orders").select("id, branch_id, purchase_order_number, supplier_id, supplier_name_snapshot, warehouse_id, destination_type, destination_address_snapshot, source_sales_order_id, state, draft_version, expected_at, commercial_terms")
      .eq("id", id).eq("branch_id", access.branchId).maybeSingle(),
    supabase.from("purchase_order_line_read").select("id, linked_sales_order_line_id, material_id, ordered_uom_id, quantity, unit_cost_vnd, price_source_type, override_reason")
      .eq("purchase_order_id", id).order("line_number"),
  ]);
  const order = orderResult.data;
  if (orderResult.error || lineResult.error || !order || order.state !== "DRAFT" || !lineResult.data?.length ||
    (order.destination_type === "WAREHOUSE" ? !order.warehouse_id : !order.source_sales_order_id)) notFound();
  const [options, sourceLines] = await Promise.all([
    loadPurchaseFormOptions(access.branchId),
    order.source_sales_order_id ? loadSalesOrderPurchaseLines(order.source_sales_order_id, access.branchId) : Promise.resolve([]),
  ]);
  if (!options.suppliers.some((supplier) => supplier.id === order.supplier_id)) {
    options.suppliers.unshift({ id: order.supplier_id, name: order.supplier_name_snapshot });
  }
  const existing: ExistingPurchaseDraft = {
    id: order.id, version: order.draft_version, supplierId: order.supplier_id, warehouseId: order.warehouse_id,
    destinationType: order.destination_type as ExistingPurchaseDraft["destinationType"], sourceSalesOrderId: order.source_sales_order_id,
    expectedAt: order.expected_at, terms: order.commercial_terms, destinationAddress: order.destination_address_snapshot,
    lines: lineResult.data.map((line) => ({ sourceLineId: line.id, salesLineId: line.linked_sales_order_line_id ?? "",
      materialId: line.material_id, uomId: line.ordered_uom_id,
      quantity: String(line.quantity), manualCostVnd: line.price_source_type === "MANUAL_APPROVED" ? String(line.unit_cost_vnd) : "",
      manualCostReason: line.price_source_type === "MANUAL_APPROVED" ? line.override_reason ?? "" : "" })),
  };
  return <><header className="page-heading"><div><p className="eyebrow">Đơn mua · Bản nháp</p><h1>Sửa {order.purchase_order_number}</h1><p className="lede">Sửa nhiều dòng, ngày và điều khoản; giá mua được kiểm lại khi lưu.</p></div><Link className="button button-secondary" href={`/admin/purchase-orders/${id}`}>Về đơn mua</Link></header>
    <PurchaseOrderForm options={options} sourceLines={sourceLines} operationId={randomUUID()} canManageWarehouse={access.permissions.has("roles.manage")} canCreateSales={false} canManagePrice={access.permissions.has("purchasing.price.manage")} canReadPrice={true} existing={existing} /></>;
}
