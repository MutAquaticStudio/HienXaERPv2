import { OperationalCompletion } from "@/modules/sales/operational-completion";
import { CancelDocumentForm } from "@/components/documents/cancel-document-form";
import { WarehouseAllocationFields } from "@/components/inventory/material-stock-hint";
import { loadWarehouseAvailability } from "@/modules/inventory/availability-server";
import { SalesOrderCreditOverride } from "@/components/sales/credit-override";
import { OrderSourcingPanel, sourcingRun } from "@/components/sales/order-sourcing-panel";
import { OrderDeliveryButton, type OrderDeliveryLine } from "@/components/delivery/order-delivery-dialog";
import { OrderNextSteps } from "@/components/sales/order-next-steps";
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
import { businessInputValue, formatBusinessDateTime } from "@/lib/core/business-time";
import { formatVnd, vnd } from "@/lib/core/money";
import { createServerSupabase } from "@/lib/supabase/server";
import { allocateWarehouseSourceAction, createDeliveryAction } from "@/modules/delivery/actions";
import { deliveryStateLabel, sourceModeLabel } from "@/modules/delivery/presentation";
import { cancelSalesOrderAction, confirmSalesOrderAction } from "@/modules/sales/actions";
import { salesDeliveryStateLabel, salesStateLabel, salesStateTone } from "@/modules/sales/presentation";
import styles from "./order-detail.module.css";
import { formatQuantity } from "@/lib/core/quantity";
import { salesGrossTotal } from "@/lib/pdf/document-data";
import { prepaymentReference, prepaymentSummary, type PrepaymentReceipt } from "@/modules/sales/prepayment";

type Order = { id: string; customer_id: string; site_id: string; order_number: string; commercial_state: string; fulfillment_state: string; payment_state: string; customer_name_snapshot: string; site_name_snapshot: string; delivery_address_snapshot: string; total_vnd: string; requested_delivery_at: string | null; quotation_revision_id: string | null; created_at: string };
type Line = { id: string; material_id: string; base_uom_id: string; line_number: number; material_name_snapshot: string; quantity: string; unit_price_vnd: string; line_total_vnd: string; list_unit_price_vnd: string | null; discount_mode: string | null; discount_value: string | null; price_source_type: string; units_of_measure: { symbol: string } | { symbol: string }[] | null; base_units: { symbol: string } | { symbol: string }[] | null };
type Supply = { sales_order_line_id: string; allocated_base_quantity: string; remaining_base_quantity: string };
type Allocation = { id: string; sales_order_line_id: string; supply_mode: string; allocated_base_quantity: string; warehouse_id: string | null;
  purchase_order_lines: { purchase_orders: { id: string; purchase_order_number: string; state: string } | { id: string; purchase_order_number: string; state: string }[] | null } | null };
type Delivery = { id: string; delivery_number: string; execution_state: string; employee_id: string | null; vehicle_id: string | null; scheduled_at: string | null };
function relation<T>(value: T | T[] | null) { return Array.isArray(value) ? value[0] ?? null : value; }

export default async function OrderDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string; error?: string }> }) {
  const access = await requireInternalPermission("orders.read");
  const { id } = await params;
  const supabase = await createServerSupabase();
  // A5: independent reads in one round trip.
  const [orderResult, lineResult, supplyResult, deliveryResult, warehouseResult, allocationResult, runResult, channelResult] = await Promise.all([
    supabase.from("sales_order_read").select("id, customer_id, site_id, order_number, commercial_state, fulfillment_state, payment_state, customer_name_snapshot, site_name_snapshot, delivery_address_snapshot, total_vnd::text, requested_delivery_at, quotation_revision_id, created_at").eq("id", id).eq("branch_id", access.branchId).maybeSingle(),
    supabase.from("sales_order_lines").select("id, material_id, base_uom_id, line_number, material_name_snapshot, quantity, unit_price_vnd::text, line_total_vnd::text, list_unit_price_vnd::text, discount_mode, discount_value::text, price_source_type, units_of_measure:ordered_uom_id(symbol), base_units:base_uom_id(symbol)").eq("sales_order_id", id).order("line_number"),
    supabase.from("sales_line_supply_read").select("sales_order_line_id, allocated_base_quantity, remaining_base_quantity").eq("sales_order_id", id),
    access.permissions.has("delivery.read") ? supabase.from("delivery_read").select("id, delivery_number, execution_state, employee_id, vehicle_id, scheduled_at").eq("sales_order_id", id) : Promise.resolve({ data: [] }),
    access.permissions.has("purchasing.create") || access.permissions.has("delivery.create") ? supabase.from("warehouses").select("id, name").eq("branch_id", access.branchId).eq("active", true).order("name").limit(100) : Promise.resolve({ data: [], error: null }),
    supabase.from("supply_allocations").select("id, sales_order_line_id, supply_mode, allocated_base_quantity, warehouse_id, sales_order_lines!inner(sales_order_id), purchase_order_lines(purchase_orders(id, purchase_order_number, state))").eq("sales_order_lines.sales_order_id", id).order("id"),
    supabase.from("sales_order_sourcing_runs").select("created_at, plan").eq("sales_order_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("sales_orders").select("order_channel, portal_note").eq("id", id).maybeSingle(),
  ]);
  const channel = (channelResult.data ?? null) as { order_channel: string; portal_note: string | null } | null;
  const fromPortal = channel?.order_channel === "CUSTOMER_PORTAL";
  if (orderResult.error || !orderResult.data) notFound();
  const order = orderResult.data as Order;
  const lines = (lineResult.data ?? []) as unknown as Line[];
  // Discounts lower each line's unit price; the gross amount is what the lines would cost at their prices before discount.
  const discountVnd = lines.some((line) => line.list_unit_price_vnd) ? salesGrossTotal(lines) - BigInt(order.total_vnd ?? "0") : 0n;
  const supplies = new Map(((supplyResult.data ?? []) as Supply[]).map((row) => [row.sales_order_line_id, row]));
  const allocations = (allocationResult.data ?? []) as unknown as Allocation[];
  const deliveries = (deliveryResult.data ?? []) as Delivery[];
  const warehouses = warehouseResult.data ?? [];
  // A1: a delivery from stock takes its warehouse source itself, so delivery.create is enough (no purchasing.create).
  const [availability, deliveryPlan, query, prepaidResult, names] = await Promise.all([
    access.permissions.has("inventory.read") ? loadWarehouseAvailability(access.branchId, lines.map(line => line.material_id)) : Promise.resolve(undefined),
    order.commercial_state === "CONFIRMED" && access.permissions.has("delivery.create") && warehouses.length
      ? loadDeliveryPlan(supabase, order.id, lines, access.branchId, access.permissions.has("delivery.assign")) : Promise.resolve(null),
    searchParams,
    // FB5: the customer's prepayment is a receipt tied to the order by its reference (see recordPrepayment).
    access.permissions.has("finance.ar.read") ? supabase.from("payment_read").select("id, payment_number, method, amount_vnd::text, posting_state, reversal_of_payment_id")
      .eq("branch_id", access.branchId).eq("customer_id", order.customer_id).eq("direction", "RECEIPT").eq("external_reference", prepaymentReference(order.order_number)).limit(20)
      : Promise.resolve({ data: [] }),
    // FB5/FB7: who and what took the deliveries, for "bước tiếp theo" — shown on every visit of a confirmed order.
    ["CONFIRMED", "CLOSED"].includes(order.commercial_state) ? resourceNames(supabase, access.branchId, deliveries) : Promise.resolve(null),
  ]);
  const prepaid = prepaymentSummary((prepaidResult.data ?? []) as PrepaymentReceipt[], order.total_vnd ?? "0");
  const now = new Date();
  const localNow = businessInputValue(now);
  // A4: "Lập phiếu giao" starts on the customer's requested time while it is still ahead.
  const requestedAt = order.requested_delivery_at && new Date(order.requested_delivery_at) > now ? businessInputValue(order.requested_delivery_at) : null;
  return <div className="page-stack">
    <header className="page-heading"><div><p className="eyebrow">Đơn bán</p><h1>{order.order_number}</h1><p className="lede">Theo dõi đơn bán, phân nguồn hàng và giao hàng tại một nơi.</p></div><div className="inline-actions"><ButtonLink href={`/api/orders/${order.id}/pdf`} variant="secondary">Tải PDF đơn bán</ButtonLink><ButtonLink href="/admin/orders" variant="secondary">Về danh sách</ButtonLink></div></header>
    {fromPortal && <p className="form-message warning" role="note"><strong>Đơn khách tự đặt trên cổng khách{order.commercial_state === "DRAFT" ? " — chờ duyệt" : ""}.</strong>{order.commercial_state === "DRAFT" ? " Kiểm tra hàng, giá và ngày giao (sửa bản nháp nếu cần), rồi bấm “Duyệt đơn” để giữ hạn mức và tự phân nguồn; hoặc hủy đơn — khách thấy ghi chú hủy nếu có." : ""}{channel?.portal_note ? ` Ghi chú của khách: “${channel.portal_note}”.` : ""}</p>}
    <SalesOrderCreditOverride orderId={id} />
      <ActionNotice notice={query.notice} error={query.error} />
    {names && <OrderNextSteps orderId={order.id} orderNumber={order.order_number} customerId={order.customer_id} siteId={order.site_id}
      justConfirmed={!!query.notice?.startsWith("confirmed")} delivered={["FULFILLED", "CLOSED_REMAINDER"].includes(order.fulfillment_state ?? "")}
      deliveries={deliveries.map((delivery) => ({ id: delivery.id, number: delivery.delivery_number, state: delivery.execution_state, scheduledAt: delivery.scheduled_at,
        vehicle: delivery.vehicle_id ? names.vehicles.get(delivery.vehicle_id) ?? null : null, driver: delivery.employee_id ? names.employees.get(delivery.employee_id) ?? null : null,
        assigned: !!delivery.employee_id && delivery.execution_state !== "PLANNED" }))}
      purchases={[...new Map(allocations.flatMap((allocation) => { const purchase = relation(allocation.purchase_order_lines?.purchase_orders ?? null);
        return purchase ? [[purchase.id, { id: purchase.id, number: purchase.purchase_order_number, state: purchase.state }] as const] : []; })).values()]}
      remainingVnd={access.permissions.has("finance.ar.read") ? prepaid.remainingVnd.toString() : null}
      can={{ collect: access.permissions.has("finance.payment.post") && access.permissions.has("finance.ar.read"), createOrder: access.permissions.has("orders.create"),
        createDelivery: access.permissions.has("delivery.create"), purchases: access.permissions.has("purchasing.confirm") }} />}
    <CloseRemainingForm orderId={order.id} commercialState={order.commercial_state} fulfillmentState={order.fulfillment_state} canClose={access.permissions.has("orders.cancel")} />
    <OperationalCompletion orderId={id} />
    {order.commercial_state !== "CANCELLED" && <OrderSourcingPanel orderId={order.id} confirmed={order.commercial_state === "CONFIRMED"}
      canSource={["orders.confirm", "purchasing.create", "delivery.create"].some((permission) => access.permissions.has(permission))}
      lines={lines.map((line) => ({ id: line.id, name: line.material_name_snapshot, required: supplies.get(line.id)
        ? new Decimal(supplies.get(line.id)!.allocated_base_quantity).plus(supplies.get(line.id)!.remaining_base_quantity).toFixed() : "0",
        baseSymbol: relation(line.base_units)?.symbol ?? "" }))}
      allocations={allocations.map((allocation) => ({ lineId: allocation.sales_order_line_id, mode: allocation.supply_mode, quantity: String(allocation.allocated_base_quantity),
        warehouseName: warehouses.find((warehouse) => warehouse.id === allocation.warehouse_id)?.name ?? null,
        purchaseOrder: (() => { const purchase = relation(allocation.purchase_order_lines?.purchase_orders ?? null); return purchase ? { id: purchase.id, number: purchase.purchase_order_number, state: purchase.state } : null; })() }))}
      run={sourcingRun(runResult.data as { created_at: string; plan: { lines?: { line_id: string; reason?: string }[] } } | null)} />}
    <section className="axis-grid"><article className="card axis-card"><span>Thương mại</span><StatusBadge tone={salesStateTone(order.commercial_state)}>{salesStateLabel(order.commercial_state)}</StatusBadge></article><article className="card axis-card"><span>Thực hiện</span><strong>{salesDeliveryStateLabel(order.fulfillment_state)}</strong></article><article className="card axis-card"><span>Thanh toán</span><strong>{salesStateLabel(order.payment_state)}</strong></article></section>
    <div className={`two-column ${styles.layout}`}><section className="card card-pad"><h2>Thông tin & dòng hàng</h2><dl className="detail-grid"><div className="detail-item"><dt>Khách hàng</dt><dd>{order.customer_name_snapshot}</dd></div><div className="detail-item"><dt>Công trình</dt><dd>{order.site_name_snapshot}</dd></div><div className="detail-item field-full"><dt>Địa chỉ giao đã lưu</dt><dd>{order.delivery_address_snapshot}</dd></div><div className="detail-item"><dt>Giao dự kiến</dt><dd>{order.requested_delivery_at ? formatBusinessDateTime(order.requested_delivery_at) : "Chưa hẹn"}</dd></div>{discountVnd > 0n && <div className="detail-item"><dt>Giảm giá</dt><dd className="mono">−{formatVnd(vnd(discountVnd.toString()))}</dd></div>}<div className="detail-item"><dt>{discountVnd > 0n ? "Khách cần trả" : "Tổng đơn"}</dt><dd className="mono">{formatVnd(vnd(order.total_vnd))}</dd></div>{prepaid.paidVnd > 0n && <><div className="detail-item"><dt>Khách đã trả trước</dt><dd><span className="mono">{formatVnd(vnd(prepaid.paidVnd.toString()))}</span><small className="table-subline">{prepaid.receipts.map((receipt) => [receipt.number, receipt.method].filter(Boolean).join(" · ")).join(", ")} · <Link className="code-link" href="/admin/cashbook">Sổ quỹ</Link></small></dd></div><div className="detail-item"><dt>Còn phải trả</dt><dd className="mono">{formatVnd(vnd(prepaid.remainingVnd.toString()))}</dd></div></>}</dl><div className="table-wrap"><table role="table"><thead role="rowgroup"><tr role="row"><th scope="col">Vật tư</th><th scope="col">Số lượng</th><th scope="col">Đơn giá</th><th scope="col">Thành tiền</th><th scope="col">Nguồn giá</th><th scope="col">Phân nguồn</th></tr></thead><tbody role="rowgroup">{lines.map((line) => { const supply = supplies.get(line.id); const remaining = supply?.remaining_base_quantity ?? null; return <tr role="row" key={line.id}><td role="cell" data-label="Vật tư">{line.material_name_snapshot}</td><td role="cell" data-label="Số lượng">{formatQuantity(line.quantity)} {relation(line.units_of_measure)?.symbol}</td><td role="cell" data-label="Đơn giá" className="mono">{formatVnd(vnd(line.unit_price_vnd))}{line.list_unit_price_vnd && <small className="table-subline">Giá gốc {formatVnd(vnd(line.list_unit_price_vnd))}{line.discount_mode === "PERCENT" && line.discount_value ? ` · giảm ${Number(line.discount_value).toLocaleString("vi-VN")}%` : ""}</small>}</td><td role="cell" data-label="Thành tiền" className="mono">{formatVnd(vnd(line.line_total_vnd))}</td><td role="cell" data-label="Nguồn giá">{priceSourceLabel(line.price_source_type)}</td><td role="cell" data-label="Phân nguồn">{remaining !== null && new Decimal(remaining).lte(0) ? <StatusBadge tone="success">Đủ nguồn</StatusBadge> : <div><p className="muted">{remaining === null ? "Chưa xác định lượng thiếu" : `${formatQuantity(remaining)} đơn vị cơ sở còn thiếu`}</p>{order.commercial_state === "CONFIRMED" && remaining !== null && access.permissions.has("purchasing.create") && (warehouseResult.error ? <p className="muted">Không thể tải kho. Hãy thử tải lại.</p> : warehouses.length ? <form className="inline-command" action={allocateWarehouseSourceAction}><input type="hidden" name="salesOrderId" value={order.id} /><input type="hidden" name="salesLineId" value={line.id} /><input type="hidden" name="operationId" value={randomUUID()} /><WarehouseAllocationFields lineId={line.id} materialId={line.material_id} baseUomId={line.base_uom_id} remaining={new Decimal(remaining).toFixed()} warehouses={warehouses} availability={availability} /><button className="button button-secondary" type="submit">Chọn nguồn kho</button><p className="muted">Phân nguồn chưa giữ tồn. Tạo phiếu giao mới kiểm và giữ tồn khả dụng.</p></form> : <p className="muted">Chưa có kho hoạt động.</p>)}{access.permissions.has("purchasing.create") && <Link className="code-link" href={`/admin/purchase-orders/new?salesLineId=${line.id}`}>Đặt NCC giao thẳng</Link>}</div>}</td></tr>; })}</tbody></table></div>{deliveries.length > 0 && <div className="source-history"><h3>Phiếu giao</h3>{deliveries.map((delivery) => <p key={delivery.id}><Link className="code-link mono" href={`/admin/deliveries/${delivery.id}`}>{delivery.delivery_number}</Link><span>{deliveryStateLabel(delivery.execution_state)}</span></p>)}</div>}</section><aside className="card card-pad command-panel"><h2>Hành động tiếp theo</h2>
      {order.quotation_revision_id && <p className="muted">Nguồn: phiên bản báo giá <span className="mono">{order.quotation_revision_id}</span></p>}
      {order.commercial_state === "DRAFT" && access.permissions.has("orders.create") && <Link className="button button-primary action-full" href={`/admin/orders/${order.id}/edit`}>Sửa bản nháp</Link>}
      {order.commercial_state === "DRAFT" && access.permissions.has("orders.confirm") && <form action={confirmSalesOrderAction}><input type="hidden" name="entityId" value={order.id} /><input type="hidden" name="operationId" value={randomUUID()} /><button className="button button-primary action-full" type="submit">{fromPortal ? "Duyệt đơn (giữ hạn mức, tự phân nguồn)" : "Xác nhận & giữ hạn mức"}</button></form>}
      {deliveryPlan && deliveryPlan.open && <OrderDeliveryButton orderId={order.id} lines={deliveryPlan.lines} warehouses={warehouses} availability={availability}
        defaultScheduledAt={localNow} resources={deliveryPlan.resources} stopMinutes={deliveryPlan.stopMinutes} canOrderDirect={access.permissions.has("purchasing.create")}
        requestedAt={requestedAt} />}
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
  const [planResult, unitResult, vehicleResult, employees, settingsResult, capacityResult] = await Promise.all([
    supabase.rpc("order_delivery_plan", { target_sales_order_id: orderId }),
    supabase.from("units_of_measure").select("id, symbol").limit(1000),
    canAssign ? supabase.from("vehicles").select("id, code, plate_number, capacity_quantity::text, capacity_uom_id").eq("branch_id", branchId).eq("active", true).order("code").limit(200) : Promise.resolve({ data: [], error: null }),
    canAssign ? listAssignmentEmployees(supabase, branchId).catch(() => null) : Promise.resolve(null),
    supabase.from("branch_operation_settings").select("stop_minutes").eq("branch_id", branchId).maybeSingle(),
    // FB5: how much of each line each truck carries in the line's unit ("4 tấn ≈ 80 bao"); without it the popup only names the trucks.
    canAssign ? supabase.rpc("vehicle_capacity_by_order", { target_sales_order_id: orderId }) : Promise.resolve({ data: [], error: null }),
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
  const carried = capacityResult.error ? [] : (capacityResult.data ?? []) as { vehicle_id: string; sales_order_line_id: string; capacity_in_line_unit: string | number | null }[];
  const resources = canAssign && employees ? { employees: employees.data.map((row) => ({ id: row.id, name: row.display_name })),
    vehicles: ((vehicleResult.data ?? []) as { id: string; code: string; plate_number: string; capacity_quantity: string | null; capacity_uom_id: string | null }[]).map((row) => ({
      id: row.id, label: `${row.code} · ${row.plate_number}`,
      capacity: row.capacity_quantity && row.capacity_uom_id && !capacityResult.error ? {
        quantity: row.capacity_quantity, unit: symbols.get(row.capacity_uom_id) ?? "",
        perLine: Object.fromEntries(planLines.map((line) => {
          const found = carried.find((item) => item.vehicle_id === row.id && item.sales_order_line_id === line.salesOrderLineId);
          return [line.salesOrderLineId, found?.capacity_in_line_unit === null || found?.capacity_in_line_unit === undefined ? null : String(found.capacity_in_line_unit)];
        })),
      } : null,
    })) } : null;
  return { lines: planLines, open, resources, stopMinutes: (settingsResult.data as { stop_minutes: number } | null)?.stop_minutes ?? 60 };
}

/** Plates and driver names for the order's assigned deliveries; a name that cannot be read is simply left out. */
async function resourceNames(supabase: Awaited<ReturnType<typeof createServerSupabase>>, branchId: string, deliveries: Delivery[]) {
  const vehicleIds = [...new Set(deliveries.flatMap((delivery) => delivery.vehicle_id ? [delivery.vehicle_id] : []))];
  const [vehicleResult, employeeResult] = await Promise.all([
    vehicleIds.length ? supabase.from("vehicles").select("id, plate_number").eq("branch_id", branchId).in("id", vehicleIds) : Promise.resolve({ data: [] }),
    deliveries.some((delivery) => delivery.employee_id) ? listAssignmentEmployees(supabase, branchId).catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
  ]);
  return {
    vehicles: new Map(((vehicleResult.data ?? []) as { id: string; plate_number: string }[]).map((vehicle) => [vehicle.id, vehicle.plate_number])),
    employees: new Map((employeeResult.data ?? []).map((employee) => [employee.id, employee.display_name])),
  };
}
