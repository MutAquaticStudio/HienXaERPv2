import Link from "next/link";
import { ButtonLink } from "@/components/ui/button-link";
import { StatusBadge } from "@/components/ui/status-badge";
import { ActionNotice } from "@/components/sales/action-notice";
import { requireInternalPermission } from "@/lib/access/context";
import { formatVnd, vnd } from "@/lib/core/money";
import { createServerSupabase } from "@/lib/supabase/server";
import { salesStateLabel, salesStateTone } from "@/modules/sales/presentation";

type OrderRow = { id: string; order_number: string; customer_name_snapshot: string; site_name_snapshot: string; commercial_state: string; fulfillment_state: string; payment_state: string; total_vnd: string; requested_delivery_at: string | null; created_at: string };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const access = await requireInternalPermission("orders.read");
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("sales_order_read").select("id, order_number, customer_name_snapshot, site_name_snapshot, commercial_state, fulfillment_state, payment_state, total_vnd, requested_delivery_at, created_at").eq("branch_id", access.branchId).order("created_at", { ascending: false });
  if (error) throw new Error("Không thể tải đơn bán.");
  const rows = data as OrderRow[];
  const query = await searchParams;
  return <><header className="page-heading"><div><p className="eyebrow">Bán hàng</p><h1>Đơn bán</h1><p className="lede">Một danh sách cho trạng thái thương mại, thực hiện và thanh toán được dẫn xuất.</p></div>{access.permissions.has("orders.create") && <ButtonLink href="/admin/orders/new">Tạo đơn bán</ButtonLink>}</header><ActionNotice notice={query.notice} error={query.error} /><section className="card"><div className="section-head"><h2>{rows.length} đơn bán</h2></div><div className="table-wrap"><table><thead><tr><th>Mã đơn</th><th>Khách hàng / công trình</th><th>Giá trị</th><th>Thương mại</th><th>Thực hiện</th><th>Thanh toán</th><th>Ngày tạo</th></tr></thead><tbody>{rows.map((order) => <tr key={order.id}><td><Link className="mono code-link" href={`/admin/orders/${order.id}`}>{order.order_number}</Link></td><td>{order.customer_name_snapshot}<small className="table-subline">{order.site_name_snapshot}</small></td><td className="mono">{formatVnd(vnd(order.total_vnd))}</td><td><StatusBadge tone={salesStateTone(order.commercial_state)}>{salesStateLabel(order.commercial_state)}</StatusBadge></td><td>{salesStateLabel(order.fulfillment_state)}</td><td>{salesStateLabel(order.payment_state)}</td><td>{new Intl.DateTimeFormat("vi-VN").format(new Date(order.created_at))}</td></tr>)}</tbody></table>{!rows.length && <p className="empty-inline">Chưa có đơn bán trong chi nhánh này.</p>}</div></section></>;
}
