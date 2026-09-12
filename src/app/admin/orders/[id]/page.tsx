import { randomUUID } from "node:crypto";
import Link from "next/link";
import { ActionNotice } from "@/components/sales/action-notice";
import { ButtonLink } from "@/components/ui/button-link";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireInternalPermission } from "@/lib/access/context";
import { formatVnd, vnd } from "@/lib/core/money";
import { createServerSupabase } from "@/lib/supabase/server";
import { cancelSalesOrderAction, confirmSalesOrderAction } from "@/modules/sales/actions";
import { salesStateLabel, salesStateTone } from "@/modules/sales/presentation";
import { notFound } from "next/navigation";

type Order = { id: string; order_number: string; commercial_state: string; fulfillment_state: string; payment_state: string; customer_name_snapshot: string; site_name_snapshot: string; delivery_address_snapshot: string; total_vnd: string; requested_delivery_at: string | null; quotation_revision_id: string | null; created_at: string };
type Line = { id: string; line_number: number; material_name_snapshot: string; quantity: string; unit_price_vnd: string; line_total_vnd: string; price_source_type: string; units_of_measure: { symbol: string } | { symbol: string }[] | null };
type Supply = { sales_order_line_id: string; allocated_base_quantity: string; remaining_base_quantity: string };
function relation<T>(value: T | T[] | null) { return Array.isArray(value) ? value[0] ?? null : value; }

export default async function OrderDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string; error?: string }> }) {
  const access = await requireInternalPermission("orders.read");
  const { id } = await params;
  const supabase = await createServerSupabase();
  const [orderResult, lineResult, supplyResult] = await Promise.all([
    supabase.from("sales_order_read").select("id, order_number, commercial_state, fulfillment_state, payment_state, customer_name_snapshot, site_name_snapshot, delivery_address_snapshot, total_vnd, requested_delivery_at, quotation_revision_id, created_at").eq("id", id).eq("branch_id", access.branchId).maybeSingle(),
    supabase.from("sales_order_lines").select("id, line_number, material_name_snapshot, quantity, unit_price_vnd, line_total_vnd, price_source_type, units_of_measure:ordered_uom_id(symbol)").eq("sales_order_id", id).order("line_number"),
    supabase.from("sales_line_supply_read").select("sales_order_line_id, allocated_base_quantity, remaining_base_quantity").eq("sales_order_id", id),
  ]);
  if (orderResult.error || !orderResult.data) notFound();
  const order = orderResult.data as Order;
  const lines = (lineResult.data ?? []) as unknown as Line[];
  const supplies = new Map(((supplyResult.data ?? []) as Supply[]).map((row) => [row.sales_order_line_id, row]));
  const query = await searchParams;
  return <><header className="page-heading"><div><p className="eyebrow">Đơn bán</p><h1>{order.order_number}</h1><p className="lede">Hồ sơ điều hành với ba trục trạng thái riêng, không lưu shadow state.</p></div><ButtonLink href="/admin/orders" variant="secondary">Về danh sách</ButtonLink></header><ActionNotice notice={query.notice} error={query.error} /><section className="axis-grid"><article className="card axis-card"><span>Thương mại</span><StatusBadge tone={salesStateTone(order.commercial_state)}>{salesStateLabel(order.commercial_state)}</StatusBadge></article><article className="card axis-card"><span>Thực hiện</span><strong>{salesStateLabel(order.fulfillment_state)}</strong></article><article className="card axis-card"><span>Thanh toán</span><strong>{salesStateLabel(order.payment_state)}</strong></article></section><div className="two-column"><section className="card card-pad"><h2>Thông tin & dòng hàng</h2><dl className="detail-grid"><div className="detail-item"><dt>Khách hàng</dt><dd>{order.customer_name_snapshot}</dd></div><div className="detail-item"><dt>Công trình</dt><dd>{order.site_name_snapshot}</dd></div><div className="detail-item field-full"><dt>Địa chỉ giao snapshot</dt><dd>{order.delivery_address_snapshot}</dd></div><div className="detail-item"><dt>Giao dự kiến</dt><dd>{order.requested_delivery_at ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(order.requested_delivery_at)) : "Chưa hẹn"}</dd></div><div className="detail-item"><dt>Tổng đơn</dt><dd className="mono">{formatVnd(vnd(order.total_vnd))}</dd></div></dl><div className="table-wrap"><table><thead><tr><th>Vật tư</th><th>Số lượng</th><th>Đơn giá</th><th>Thành tiền</th><th>Nguồn giá</th><th>Phân nguồn</th></tr></thead><tbody>{lines.map((line) => { const supply = supplies.get(line.id); return <tr key={line.id}><td>{line.material_name_snapshot}</td><td>{line.quantity} {relation(line.units_of_measure)?.symbol}</td><td className="mono">{formatVnd(vnd(line.unit_price_vnd))}</td><td className="mono">{formatVnd(vnd(line.line_total_vnd))}</td><td>{line.price_source_type}</td><td>{supply && new Number(supply.remaining_base_quantity).valueOf() <= 0 ? <StatusBadge tone="success">Đủ nguồn</StatusBadge> : access.permissions.has("purchasing.create") ? <Link className="code-link" href={`/admin/purchase-orders/new?salesLineId=${line.id}`}>Đặt NCC giao thẳng</Link> : `${supply?.remaining_base_quantity ?? "—"} base còn thiếu`}</td></tr>; })}</tbody></table></div></section><aside className="card card-pad"><h2>Hành động tiếp theo</h2>{order.quotation_revision_id && <p className="muted">Nguồn: revision báo giá <span className="mono">{order.quotation_revision_id}</span></p>}{order.commercial_state === "DRAFT" && access.permissions.has("orders.confirm") && <form action={confirmSalesOrderAction}><input type="hidden" name="entityId" value={order.id} /><input type="hidden" name="operationId" value={randomUUID()} /><button className="button button-primary action-full" type="submit">Xác nhận & giữ hạn mức</button></form>}{["DRAFT", "CONFIRMED"].includes(order.commercial_state) && access.permissions.has("orders.cancel") && <form className="inline-command" action={cancelSalesOrderAction}><input type="hidden" name="entityId" value={order.id} /><input type="hidden" name="operationId" value={randomUUID()} /><div className="field"><label htmlFor="reason">Lý do hủy</label><input id="reason" name="reason" minLength={3} required /></div><button className="button button-danger action-full" type="submit">Hủy đơn</button></form>}{["CANCELLED", "CLOSED"].includes(order.commercial_state) && <p className="muted">Đơn đã ở trạng thái kết thúc, không còn command thương mại.</p>}</aside></div></>;
}
