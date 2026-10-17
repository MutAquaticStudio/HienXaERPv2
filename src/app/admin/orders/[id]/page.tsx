import { OperationalCompletion } from "@/modules/sales/operational-completion";
import { CancelDocumentForm } from "@/components/documents/cancel-document-form";
import { WarehouseAllocationFields } from "@/components/inventory/material-stock-hint";
import { loadWarehouseAvailability } from "@/modules/inventory/availability-server";
import { SalesOrderCreditOverride } from "@/components/sales/credit-override";
import { OrderDeliveryButton, type OrderDeliveryLine } from "@/components/delivery/order-delivery-dialog";
import { listAssignmentEmployees } from "@/modules/delivery/assignment-options";
import { randomUUID } from "node:crypto";
import Decimal from "decimal.js";
import Link from "next/link";
import { CloseRemainingForm } from "@/modules/sales/close-remaining-form";
import { notFound } from "next/navigation";
import { ActionNotice } from "@/components/sales/action-notice";
import { ButtonLink } from "@/components/ui/button-link";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireInternalPermission } from "@/lib/access/context";
import { priceSourceLabel } from "@/modules/pricing/presentation";
import { formatBusinessDateTime } from "@/lib/core/business-time";
import { formatVnd, vnd } from "@/lib/core/money";
import { createServerSupabase } from "@/lib/supabase/server";
import { allocateWarehouseSourceAction, createDeliveryAction } from "@/modules/delivery/actions";
import { deliveryStateLabel, sourceModeLabel } from "@/modules/delivery/presentation";
import { cancelSalesOrderAction, confirmSalesOrderAction } from "@/modules/sales/actions";
import { salesDeliveryStateLabel, salesStateLabel, salesStateTone } from "@/modules/sales/presentation";
import styles from "./order-detail.module.css";
import { formatQuantity } from "@/lib/core/quantity";
import { salesGrossTotal } from "@/lib/pdf/document-data";

type Order = { id: string; customer_id: string; site_id: string; order_number: string; commercial_state: string; fulfillment_state: string; payment_state: string; customer_name_snapshot: string; site_name_snapshot: string; delivery_address_snapshot: string; total_vnd: string; requested_delivery_at: string | null; quotation_revision_id: string | null; created_at: string };
type Line = { id: string; material_id: string; base_uom_id: string; line_number: number; material_name_snapshot: string; quantity: string; unit_price_vnd: string; line_total_vnd: string; list_unit_price_vnd: string | null; discount_mode: string | null; discount_value: string | null; price_source_type: string; units_of_measure: { symbol: string } | { symbol: string }[] | null };
type Supply = { sales_order_line_id: string; allocated_base_quantity: string; remaining_base_quantity: string };
type Allocation = { id: string; sales_order_line_id: string; supply_mode: string; allocated_base_quantity: string; warehouse_id: string | null };
type Delivery = { id: string; delivery_number: string; execution_state: string };
function relation<T>(value: T | T[] | null) { return Array.isArray(value) ? value[0] ?? null : value; }

export default async function OrderDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string; error?: string }> }) {
  const access = await requireInternalPermission("orders.read");
  const { id } = await params;
  const supabase = await createServerSupabase();
  const [orderResult, lineResult, supplyResult, deliveryResult, warehouseResult] = await Promise.all([
    supabase.from("sales_order_read").select("id, customer_id, site_id, order_number, commercial_state, fulfillment_state, payment_state, customer_name_snapshot, site_name_snapshot, delivery_address_snapshot, total_vnd::text, requested_delivery_at, quotation_revision_id, created_at").eq("id", id).eq("branch_id", access.branchId).maybeSingle(),
    supabase.from("sales_order_lines").select("id, material_id, base_uom_id, line_number, material_name_snapshot, quantity, unit_price_vnd::text, line_total_vnd::text, list_unit_price_vnd::text, discount_mode, discount_value::text, price_source_type, units_of_measure:ordered_uom_id(symbol)").eq("sales_order_id", id).order("line_number"),
    supabase.from("sales_line_supply_read").select("sales_order_line_id, allocated_base_quantity, remaining_base_quantity").eq("sales_order_id", id),
    access.permissions.has("delivery.read") ? supabase.from("delivery_read").select("id, delivery_number, execution_state").eq("sales_order_id", id) : Promise.resolve({ data: [] }),
    access.permissions.has("purchasing.create") || access.permissions.has("delivery.create") ? supabase.from("warehouses").select("id, name").eq("branch_id", access.branchId).eq("active", true).order("name").limit(100) : Promise.resolve({ data: [], error: null }),
  ]);
  if (orderResult.error || !orderResult.data) notFound();
  const order = orderResult.data as Order;
  const lines = (lineResult.data ?? []) as unknown as Line[];
  // Discounts lower each line's unit price; the gross amount is what the lines would cost at their prices before discount.
  const discountVnd = lines.some((line) => line.list_unit_price_vnd) ? salesGrossTotal(lines) - BigInt(order.total_vnd ?? "0") : 0n;
  const supplies = new Map(((supplyResult.data ?? []) as Supply[]).map((row) => [row.sales_order_line_id, row]));
  const { data: allocationData } = await supabase.from("supply_allocations").select("id, sales_order_line_id, supply_mode, allocated_base_quantity, warehouse_id").in("sales_order_line_id", lines.map((line) => line.id)).order("id");
  const allocations = (allocationData ?? []) as Allocation[];
  const deliveries = (deliveryResult.data ?? []) as Delivery[];
  const warehouses = warehouseResult.data ?? [];
  const availability = access.permissions.has("inventory.read") ? await loadWarehouseAvailability(access.branchId, lines.map(line => line.material_id)) : undefined;
  const query = await searchParams;
  // A1: a delivery from stock takes its warehouse source itself, so delivery.create is enough (no purchasing.create).
  const deliveryPlan = order.commercial_state === "CONFIRMED" && access.permissions.has("delivery.create") && warehouses.length
    ? await loadDeliveryPlan(supabase, order.id, lines, access.branchId, access.permissions.has("delivery.assign")) : null;
  const localNow = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()).replace(" ", "T");
  return <div className="page-stack">
    <header className="page-heading"><div><p className="eyebrow">Đơn bán</p><h1>{order.order_number}</h1><p className="lede">Theo dõi đơn bán, phân nguồn hàng và giao hàng tại một nơi.</p></div><div className="inline-actions"><ButtonLink href={`/api/orders/${order.id}/pdf`} variant="secondary">Tải PDF đơn bán</ButtonLink><ButtonLink href="/admin/orders" variant="secondary">Về danh sách</ButtonLink></div></header>
    <SalesOrderCreditOverride orderId={id} />
      <ActionNotice notice={query.notice} error={query.error} />
    <CloseRemainingForm orderId={order.id} commercialState={order.commercial_state} fulfillmentState={order.fulfillment_state} canClose={access.permissions.has("orders.cancel")} />
    <OperationalCompletion orderId={id} />
    <section className="axis-grid"><article className="card axis-card"><span>Thương mại</span><StatusBadge tone={salesStateTone(order.commercial_state)}>{salesStateLabel(order.commercial_state)}</StatusBadge></article><article className="card axis-card"><span>Thực hiện</span><strong>{salesDeliveryStateLabel(order.fulfillment_state)}</strong></article><article className="card axis-card"><span>Thanh toán</span><strong>{salesStateLabel(order.payment_state)}</strong></article></section>
    <div className={`two-column ${styles.layout}`}><section className="card card-pad"><h2>Thông tin & dòng hàng</h2><dl className="detail-grid"><div className="detail-item"><dt>Khách hàng</dt><dd>{order.customer_name_snapshot}</dd></div><div className="detail-item"><dt>Công trình</dt><dd>{order.site_name_snapshot}</dd></div><div className="detail-item field-full"><dt>Địa chỉ giao đã lưu</dt><dd>{order.delivery_address_snapshot}</dd></div><div className="detail-item"><dt>Giao dự kiến</dt><dd>{order.requested_delivery_at ? formatBusinessDateTime(order.requested_delivery_at) : "Chưa hẹn"}</dd></div>{discountVnd > 0n && <div className="detail-item"><dt>Giảm giá</dt><dd className="mono">−{formatVnd(vnd(discountVnd.toString()))}</dd></div>}<div className="detail-item"><dt>{discountVnd > 0n ? "Khách cần trả" : "Tổng đơn"}</dt><dd className="mono">{formatVnd(vnd(order.total_vnd))}</dd></div></dl><div className="table-wrap"><table role="table"><thead role="rowgroup"><tr role="row"><th scope="col">Vật tư</th><th scope="col">Số lượng</th><th scope="col">Đơn giá</th><th scope="col">Thành tiền</th><th scope="col">Nguồn giá</th><th scope="col">Phân nguồn</th></tr></thead><tbody role="rowgroup">{lines.map((line) => { const supply = supplies.get(line.id); const remaining = supply?.remaining_base_quantity ?? null; return <tr role="row" key={line.id}><td role="cell" data-label="Vật tư">{line.material_name_snapshot}</td><td role="cell" data-label="Số lượng">{formatQuantity(line.quantity)} {relation(line.units_of_measure)?.symbol}</td><td role="cell" data-label="Đơn giá" className="mono">{formatVnd(vnd(line.unit_price_vnd))}{line.list_unit_price_vnd && <small className="table-subline">Giá gốc {formatVnd(vnd(line.list_unit_price_vnd))}{line.discount_mode === "PERCENT" && line.discount_value ? ` · giảm ${Number(line.discount_value).toLocaleString("vi-VN")}%` : ""}</small>}</td><td role="cell" data-label="Thành tiền" className="mono">{formatVnd(vnd(line.line_total_vnd))}</td><td role="cell" data-label="Nguồn giá">{priceSourceLabel(line.price_source_type)}</td><td role="cell" data-label="Phân nguồn">{remaining !== null && new Decimal(remaining).lte(0) ? <StatusBadge tone="success">Đủ nguồn</StatusBadge> : <div><p className="muted">{remaining === null ? "Chưa xác định lượng thiếu" : `${formatQuantity(remaining)} đơn vị cơ sở còn thiếu`}</p>{order.commercial_state === "CONFIRMED" && remaining !== null && access.permissions.has("purchasing.create") && (warehouseResult.error ? <p className="muted">Không thể tải kho. Hãy thử tải lại.</p> : warehouses.length ? <form className="inline-command" action={allocateWarehouseSourceAction}><input type="hidden" name="salesOrderId" value={order.id} /><input type="hidden" name="salesLineId" value={line.id} /><input type="hidden" name="operationId" value={randomUUID()} /><WarehouseAllocationFields lineId={line.id} materialId={line.material_id} baseUomId={line.base_uom_id} remaining={remaining} warehouses={warehouses} availability={availability} /><button className="button button-secondary" type="submit">Chọn nguồn kho</button><p className="muted">Phân nguồn chưa giữ tồn. Tạo phiếu giao mới kiểm và giữ tồn khả dụng.</p></form> : <p className="muted">Chưa có kho hoạt động.</p>)}{access.permissions.has("purchasing.create") && <Link className="code-link" href={`/admin/purchase-orders/new?salesLineId=${line.id}`}>Đặt NCC giao thẳng</Link>}</div>}</td></tr>; })}</tbody></table></div>{deliveries.length > 0 && <div className="source-history"><h3>Phiếu giao</h3>{deliveries.map((delivery) => <p key={delivery.id}><Link className="code-link mono" href={`/admin/deliveries/${delivery.id}`}>{delivery.delivery_number}</Link><span>{deliveryStateLabel(delivery.execution_state)}</span></p>)}</div>}</section><aside className="card card-pad command-panel"><h2>Hành động tiếp theo</h2>
      {order.quotation_revision_id && <p className="muted">Nguồn: phiên bản báo giá <span className="mono">{order.quotation_revision_id}</span></p>}
      {order.commercial_state === "DRAFT" && access.permissions.has("orders.create") && <Link className="button button-primary action-full" href={`/admin/orders/${order.id}/edit`}>Sửa bản nháp</Link>}
      {order.commercial_state === "DRAFT" && access.permissions.has("orders.confirm") && <form action={confirmSalesOrderAction}><input type="hidden" name="entityId" value={order.id} /><input type="hidden" name="operationId" value={randomUUID()} /><button className="button button-primary action-full" type="submit">Xác nhận & giữ hạn mức</button></form>}
      {deliveryPlan && deliveryPlan.open && <OrderDeliveryButton orderId={order.id} lines={deliveryPlan.lines} warehouses={warehouses} availability={availability}
        defaultScheduledAt={localNow} resources={deliveryPlan.resources} />}
      {order.commercial_state === "CONFIRMED" && access.permissions.has("service.manage") && <Link className="button button-secondary action-full" href={`/admin/service-jobs?customerId=${order.customer_id}&siteId=${order.site_id}`}>Tạo dịch vụ</Link>}
      {order.commercial_state === "CONFIRMED" && access.permissions.has("delivery.create") && allocations.length > 0 && <details className="quick-create"><summary>Lập phiếu theo nguồn đã phân</summary>{[
        { key: "STOCK", title: "Giao từ kho", rows: allocations.filter((allocation) => allocation.supply_mode !== "SUPPLIER_DIRECT") },
        { key: "DIRECT", title: "NCC giao thẳng", rows: allocations.filter((allocation) => allocation.supply_mode === "SUPPLIER_DIRECT") },
      ].filter((group) => group.rows.length > 0).map((group) => <form className="inline-command" action={createDeliveryAction} key={group.key}>
        <input type="hidden" name="salesOrderId" value={order.id} />
        <input type="hidden" name="operationId" value={randomUUID()} />
        <strong>{group.title}</strong>
        <p className="muted">Nhập lượng cho các dòng cùng chuyến; để trống dòng chưa giao. Mỗi dòng bán chỉ chọn một phân bổ nguồn hàng trong một phiếu.</p>
        {group.rows.map((allocation) => { const orderLine = lines.find((line) => line.id === allocation.sales_order_line_id); return <div className="field" key={allocation.id}><input type="hidden" name="allocationId" value={allocation.id} /><label htmlFor={"delivery-" + allocation.id}>{orderLine?.material_name_snapshot ?? "Dòng đơn bán"} · {sourceModeLabel(allocation.supply_mode)} · đã phân {formatQuantity(allocation.allocated_base_quantity)} đơn vị cơ sở</label><input id={"delivery-" + allocation.id} name="quantity" inputMode="decimal" /></div>; })}
        <div className="field"><label htmlFor={"schedule-" + group.key}>Lịch giao</label><input id={"schedule-" + group.key} name="scheduledAt" type="datetime-local" /></div>
        <button className="button button-primary action-full" type="submit">Tạo phiếu giao</button>
      </form>)}</details>}
      {["DRAFT", "CONFIRMED"].includes(order.commercial_state) && deliveries.length === 0 && access.permissions.has("orders.cancel") && <CancelDocumentForm entityId={order.id} operationId={randomUUID()} state={order.commercial_state} label="Hủy đơn" action={cancelSalesOrderAction} />}
      {order.commercial_state === "CONFIRMED" && allocations.length === 0 && <p className="muted">Chưa có nguồn hàng. Chọn nguồn hoặc đặt NCC từ dòng hàng.</p>}
      {["CANCELLED", "CLOSED"].includes(order.commercial_state) && <p className="muted">Phần thương mại đã đóng; theo dõi giao hàng, thanh toán và ngoại lệ theo nguồn ở trên.</p>}
    </aside></div>
  </div>;
}

type PlanRow = { sales_order_line_id: string; line_number: number; material_id: string; base_uom_id: string; conversion_numerator: string | number; conversion_denominator: string | number;
  required_base_quantity: string | number; allocations: { id: string; supply_mode: string; warehouse_id: string | null; allocated_base_quantity: string | number; consumed_base_quantity: string | number }[] };

/** Left to deliver per line (order_delivery_plan) for the one-step "Lập phiếu giao" popup, plus drivers and vehicles when allowed. */
async function loadDeliveryPlan(supabase: Awaited<ReturnType<typeof createServerSupabase>>, orderId: string, lines: Line[], branchId: string, canAssign: boolean) {
  const [planResult, unitResult, vehicleResult, employees] = await Promise.all([
    supabase.rpc("order_delivery_plan", { target_sales_order_id: orderId }),
    supabase.from("units_of_measure").select("id, symbol").in("id", [...new Set(lines.map((line) => line.base_uom_id))]),
    canAssign ? supabase.from("vehicles").select("id, code, plate_number").eq("branch_id", branchId).eq("active", true).order("code").limit(200) : Promise.resolve({ data: [], error: null }),
    canAssign ? listAssignmentEmployees(supabase, branchId).catch(() => null) : Promise.resolve(null),
  ]);
  if (planResult.error || unitResult.error) return null;
  const symbols = new Map((unitResult.data ?? []).map((row) => [row.id, row.symbol]));
  const rows = ((planResult.data as { lines?: PlanRow[] } | null)?.lines ?? []);
  const planLines: OrderDeliveryLine[] = rows.flatMap((row) => {
    const line = lines.find((item) => item.id === row.sales_order_line_id);
    if (!line) return [];
    return [{ salesOrderLineId: row.sales_order_line_id, lineNumber: row.line_number, name: line.material_name_snapshot, materialId: row.material_id,
      symbol: relation(line.units_of_measure)?.symbol ?? "Đơn vị", baseSymbol: symbols.get(row.base_uom_id) ?? "đơn vị cơ sở",
      ratio: { numerator: String(row.conversion_numerator), denominator: String(row.conversion_denominator) }, requiredBase: String(row.required_base_quantity),
      allocations: row.allocations.map((item) => ({ id: item.id, mode: item.supply_mode, warehouseId: item.warehouse_id, allocatedBase: String(item.allocated_base_quantity), consumedBase: String(item.consumed_base_quantity) })) }];
  });
  const open = planLines.some((line) => new Decimal(line.requiredBase).gt(line.allocations.reduce((sum, item) => sum.plus(item.consumedBase), new Decimal(0))));
  const resources = canAssign && employees ? { employees: employees.data.map((row) => ({ id: row.id, name: row.display_name })),
    vehicles: ((vehicleResult.data ?? []) as { id: string; code: string; plate_number: string }[]).map((row) => ({ id: row.id, label: `${row.code} · ${row.plate_number}` })) } : null;
  return { lines: planLines, open, resources };
}
