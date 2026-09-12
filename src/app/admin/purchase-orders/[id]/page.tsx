import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionNotice } from "@/components/sales/action-notice";
import { ButtonLink } from "@/components/ui/button-link";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireInternalPermission } from "@/lib/access/context";
import { formatVnd, vnd } from "@/lib/core/money";
import { createServerSupabase } from "@/lib/supabase/server";
import { receivePurchaseOrderAction, verifySupplierFulfillmentAction } from "@/modules/inventory/actions";
import { cancelPurchaseOrderAction, confirmPurchaseOrderAction } from "@/modules/purchasing/actions";
import { purchaseStateLabel, purchaseStateTone } from "@/modules/purchasing/presentation";

type PurchaseOrder = { id: string; purchase_order_number: string; supplier_name_snapshot: string; destination_type: string; destination_name_snapshot: string; destination_address_snapshot: string; source_sales_order_id: string | null; state: string; expected_at: string | null; total_cost_vnd: string | null };
type PurchaseLine = { id: string; linked_sales_order_line_id: string | null; material_name_snapshot: string; quantity: string; ordered_uom_id: string; unit_cost_vnd: string | null; line_total_cost_vnd: string | null; price_source_type: string | null };
type Allocation = { purchase_order_line_id: string; supply_mode: string; allocated_base_quantity: string; version: number };
type Receipt = { id: string; receipt_number: string; received_at: string; received_base_quantity: string; payable_amount_vnd: string | null };
type Fulfillment = { id: string; supplier_reference: string | null; verified_at: string; supplier_base_quantity: string; payable_amount_vnd: string | null };

export default async function PurchaseOrderDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string; error?: string }> }) {
  const access = await requireInternalPermission("purchasing.read");
  const { id } = await params;
  const supabase = await createServerSupabase();
  const [orderResult, lineResult, uomResult, receiptResult, fulfillmentResult] = await Promise.all([
    supabase.from("purchase_order_read").select("id, purchase_order_number, supplier_name_snapshot, destination_type, destination_name_snapshot, destination_address_snapshot, source_sales_order_id, state, expected_at, total_cost_vnd").eq("id", id).eq("branch_id", access.branchId).maybeSingle(),
    supabase.from("purchase_order_line_read").select("id, linked_sales_order_line_id, material_name_snapshot, quantity, ordered_uom_id, unit_cost_vnd, line_total_cost_vnd, price_source_type").eq("purchase_order_id", id).order("line_number"),
    supabase.from("units_of_measure").select("id, symbol"),
    supabase.from("purchase_receipt_read").select("id, receipt_number, received_at, received_base_quantity, payable_amount_vnd").eq("purchase_order_id", id).order("received_at", { ascending: false }),
    supabase.from("supplier_fulfillment_read").select("id, supplier_reference, verified_at, supplier_base_quantity, payable_amount_vnd").eq("purchase_order_id", id).order("verified_at", { ascending: false }),
  ]);
  if (!orderResult.data) notFound();
  const order = orderResult.data as PurchaseOrder;
  const lines = (lineResult.data ?? []) as PurchaseLine[];
  const receipts = (receiptResult.data ?? []) as Receipt[];
  const fulfillments = (fulfillmentResult.data ?? []) as Fulfillment[];
  const { data: allocationData } = lines.length ? await supabase.from("supply_allocations").select("purchase_order_line_id, supply_mode, allocated_base_quantity, version").in("purchase_order_line_id", lines.map((line) => line.id)) : { data: [] };
  const allocations = (allocationData ?? []) as Allocation[];
  const symbols = new Map((uomResult.data ?? []).map((uom) => [uom.id, uom.symbol]));
  const query = await searchParams;
  const firstLine = lines[0];
  const payable = [...receipts, ...fulfillments].reduce((sum, row) => sum + BigInt(row.payable_amount_vnd ?? 0), 0n);
  return <>
    <header className="page-heading"><div><p className="eyebrow">Đơn mua</p><h1>{order.purchase_order_number}</h1><p className="lede">{order.supplier_name_snapshot} · {purchaseStateLabel(order.destination_type)}</p></div><ButtonLink href="/admin/purchase-orders" variant="secondary">Về danh sách</ButtonLink></header>
    <ActionNotice notice={query.notice} error={query.error} />
    <section className="axis-grid"><article className="card axis-card"><span>Trạng thái PO</span><StatusBadge tone={purchaseStateTone(order.state)}>{purchaseStateLabel(order.state)}</StatusBadge></article><article className="card axis-card"><span>Đã nhận / NCC giao</span><strong>{receipts.length + fulfillments.length} lần xác minh</strong></article><article className="card axis-card"><span>Phải trả đã phát sinh</span><strong>{access.permissions.has("finance.ap.read") ? formatVnd(vnd(payable)) : "Theo quyền"}</strong></article></section>
    <div className="two-column"><section className="card card-pad"><h2>Điểm đến & dòng mua</h2><dl className="detail-grid"><div className="detail-item"><dt>Điểm đến</dt><dd>{order.destination_name_snapshot}</dd></div><div className="detail-item"><dt>Dự kiến</dt><dd>{order.expected_at ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(order.expected_at)) : "Chưa hẹn"}</dd></div><div className="detail-item field-full"><dt>Địa chỉ snapshot</dt><dd>{order.destination_address_snapshot}</dd></div><div className="detail-item"><dt>Tổng giá mua</dt><dd>{order.total_cost_vnd == null ? "Không có quyền xem" : formatVnd(vnd(order.total_cost_vnd))}</dd></div>{order.source_sales_order_id && <div className="detail-item"><dt>Đơn bán nguồn</dt><dd><Link className="code-link mono" href={`/admin/orders/${order.source_sales_order_id}`}>Mở đơn bán</Link></dd></div>}</dl><div className="table-wrap"><table><thead><tr><th>Vật tư</th><th>Số lượng</th><th>Giá mua</th><th>Thành tiền</th><th>Phân nguồn</th></tr></thead><tbody>{lines.map((line) => { const allocation = allocations.find((row) => row.purchase_order_line_id === line.id); return <tr key={line.id}><td>{line.material_name_snapshot}</td><td>{line.quantity} {symbols.get(line.ordered_uom_id)}</td><td>{line.unit_cost_vnd == null ? "Ẩn theo quyền" : formatVnd(vnd(line.unit_cost_vnd))}</td><td>{line.line_total_cost_vnd == null ? "Ẩn theo quyền" : formatVnd(vnd(line.line_total_cost_vnd))}</td><td>{allocation ? `${purchaseStateLabel(allocation.supply_mode)} · ${allocation.allocated_base_quantity} base` : "Chưa gắn dòng bán"}</td></tr>; })}</tbody></table></div><div className="source-history"><h3>Lịch sử source-linked</h3>{receipts.map((row) => <p key={row.id}><strong>{row.receipt_number}</strong><span>Nhận {row.received_base_quantity} base · {row.payable_amount_vnd ? formatVnd(vnd(row.payable_amount_vnd)) : "Giá trị ẩn"}</span></p>)}{fulfillments.map((row) => <p key={row.id}><strong>{row.supplier_reference ?? "NCC giao thẳng"}</strong><span>NCC xác minh {row.supplier_base_quantity} base · {row.payable_amount_vnd ? formatVnd(vnd(row.payable_amount_vnd)) : "Giá trị ẩn"}</span></p>)}{receipts.length + fulfillments.length === 0 && <p className="muted">Chưa có receipt hoặc supplier fulfillment.</p>}</div></section><aside className="card card-pad command-panel"><h2>Hành động tiếp theo</h2>
      {order.state === "DRAFT" && access.permissions.has("purchasing.confirm") && <form action={confirmPurchaseOrderAction}><input type="hidden" name="entityId" value={order.id} /><input type="hidden" name="operationId" value={randomUUID()} /><button className="button button-primary action-full" type="submit">Xác nhận đơn mua</button></form>}
      {order.state === "CONFIRMED" && order.destination_type === "WAREHOUSE" && firstLine && access.permissions.has("inventory.receive") && <form className="command-panel" action={receivePurchaseOrderAction}><input type="hidden" name="purchaseOrderId" value={order.id} /><input type="hidden" name="purchaseOrderLineId" value={firstLine.id} /><input type="hidden" name="receivedAt" value={new Date().toISOString()} /><input type="hidden" name="operationId" value={randomUUID()} /><div className="field"><label htmlFor="receivedQuantity">Lượng thực nhận ({symbols.get(firstLine.ordered_uom_id)})</label><input id="receivedQuantity" name="quantity" inputMode="decimal" required /></div><button className="button button-primary action-full" type="submit">Xác nhận nhận hàng</button><p className="muted command-note">Tồn kho và AP được ghi cùng receipt source.</p></form>}
      {order.state === "CONFIRMED" && order.destination_type === "CUSTOMER_SITE" && firstLine && access.permissions.has("inventory.receive") && <form className="command-panel" action={verifySupplierFulfillmentAction}><input type="hidden" name="purchaseOrderId" value={order.id} /><input type="hidden" name="purchaseOrderLineId" value={firstLine.id} /><input type="hidden" name="operationId" value={randomUUID()} /><div className="field"><label htmlFor="supplierQuantity">Lượng NCC xác minh ({symbols.get(firstLine.ordered_uom_id)})</label><input id="supplierQuantity" name="quantity" inputMode="decimal" required /></div><div className="field"><label htmlFor="supplierReference">Mã phiếu / đầu mối NCC</label><input id="supplierReference" name="supplierReference" /></div><button className="button button-primary action-full" type="submit">Xác minh NCC giao</button><p className="muted command-note">AP theo lượng NCC; khách nhận/tính tiền được xác minh riêng trên phiếu giao.</p></form>}
      {["DRAFT", "CONFIRMED"].includes(order.state) && receipts.length + fulfillments.length === 0 && access.permissions.has("purchasing.cancel") && <form className="inline-command" action={cancelPurchaseOrderAction}><input type="hidden" name="entityId" value={order.id} /><input type="hidden" name="operationId" value={randomUUID()} /><div className="field"><label htmlFor="reason">Lý do hủy</label><input id="reason" name="reason" minLength={3} required /></div><button className="button button-danger action-full" type="submit">Hủy đơn mua</button></form>}
      {order.state === "CLOSED" && <p className="muted">Đã hoàn tất lượng mua. Hóa đơn NCC đến sau chỉ dùng đối soát, không tạo AP lần hai.</p>}
    </aside></div>
  </>;
}
