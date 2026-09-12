import Link from "next/link";
import { ActionNotice } from "@/components/sales/action-notice";
import { ButtonLink } from "@/components/ui/button-link";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireInternalPermission } from "@/lib/access/context";
import { formatVnd, vnd } from "@/lib/core/money";
import { createServerSupabase } from "@/lib/supabase/server";
import { purchaseStateLabel, purchaseStateTone } from "@/modules/purchasing/presentation";

type PurchaseOrder = { id: string; purchase_order_number: string; supplier_name_snapshot: string; destination_type: string; destination_name_snapshot: string; source_sales_order_id: string | null; state: string; expected_at: string | null; total_cost_vnd: string | null; created_at: string };
export default async function PurchaseOrdersPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const access = await requireInternalPermission("purchasing.read");
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("purchase_order_read").select("id, purchase_order_number, supplier_name_snapshot, destination_type, destination_name_snapshot, source_sales_order_id, state, expected_at, total_cost_vnd, created_at").eq("branch_id", access.branchId).order("created_at", { ascending: false });
  if (error) throw new Error("Không thể tải đơn mua.");
  const rows = data as PurchaseOrder[];
  const query = await searchParams;
  return <><header className="page-heading"><div><p className="eyebrow">Cung ứng</p><h1>Đơn mua</h1><p className="lede">Nguồn hàng giữ liên kết về nhu cầu bán, không tạo nhập/xuất kho giả.</p></div>{access.permissions.has("purchasing.create") && <ButtonLink href="/admin/purchase-orders/new">Tạo đơn mua</ButtonLink>}</header><ActionNotice notice={query.notice} error={query.error} /><section className="card"><div className="section-head"><h2>{rows.length} đơn mua</h2></div><div className="table-wrap"><table><thead><tr><th>Mã PO</th><th>Nhà cung cấp</th><th>Điểm đến</th><th>Giá trị</th><th>Dự kiến</th><th>Trạng thái</th><th>Nguồn</th></tr></thead><tbody>{rows.map((order) => <tr key={order.id}><td><Link className="mono code-link" href={`/admin/purchase-orders/${order.id}`}>{order.purchase_order_number}</Link></td><td>{order.supplier_name_snapshot}</td><td>{purchaseStateLabel(order.destination_type)}<small className="table-subline">{order.destination_name_snapshot}</small></td><td className="mono">{order.total_cost_vnd == null ? "Không có quyền xem" : formatVnd(vnd(order.total_cost_vnd))}</td><td>{order.expected_at ? new Intl.DateTimeFormat("vi-VN").format(new Date(order.expected_at)) : "Chưa hẹn"}</td><td><StatusBadge tone={purchaseStateTone(order.state)}>{purchaseStateLabel(order.state)}</StatusBadge></td><td>{order.source_sales_order_id ? "Từ đơn bán" : "Mua về kho"}</td></tr>)}</tbody></table>{!rows.length && <p className="empty-inline">Chưa có đơn mua trong chi nhánh này.</p>}</div></section></>;
}
