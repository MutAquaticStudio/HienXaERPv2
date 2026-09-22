import Link from "next/link";
import { ButtonLink } from "@/components/ui/button-link";
import { ListPager } from "@/components/ui/list-pager";
import { StatusBadge } from "@/components/ui/status-badge";
import { ActionNotice } from "@/components/sales/action-notice";
import { requireInternalPermission } from "@/lib/access/context";
import { CORE_LIST_PAGE_SIZE, parseCoreListQuery, ilikePattern } from "@/lib/core-list";
import { formatVnd, vnd } from "@/lib/core/money";
import { createServerSupabase } from "@/lib/supabase/server";
import { salesStateLabel, salesStateTone } from "@/modules/sales/presentation";

type OrderRow = { id: string; order_number: string; customer_name_snapshot: string; site_name_snapshot: string; commercial_state: string; fulfillment_state: string; payment_state: string; total_vnd: string; requested_delivery_at: string | null; created_at: string };
type Query = { notice?: string; error?: string; q?: string; state?: string; page?: string };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Query> }) {
  const access = await requireInternalPermission("orders.read");
  const query = await searchParams;
  const list = parseCoreListQuery(query);
  const supabase = await createServerSupabase();
  let request = supabase.from("sales_orders").select("id").eq("branch_id", access.branchId);
  if (list.q) request = request.or(`order_number.ilike.${ilikePattern(list.q)},customer_name_snapshot.ilike.${ilikePattern(list.q)},site_name_snapshot.ilike.${ilikePattern(list.q)}`);
  if (list.state) request = request.eq("commercial_state", list.state);
  const { data, error } = await request.order("created_at", { ascending: false }).order("id", { ascending: false }).range(list.from, list.to + 1);
  if (error) throw new Error("Không thể tải đơn bán.");
  const hasNext = (data?.length ?? 0) > CORE_LIST_PAGE_SIZE;
  const visibleIds = (data ?? []).slice(0, CORE_LIST_PAGE_SIZE).map((row) => row.id);
  let rows: OrderRow[] = [];
  if (visibleIds.length) {
    const { data: orderData, error: orderError } = await supabase.from("sales_order_read")
      .select("id, order_number, customer_name_snapshot, site_name_snapshot, commercial_state, fulfillment_state, payment_state, total_vnd, requested_delivery_at, created_at")
      .eq("branch_id", access.branchId).in("id", visibleIds);
    if (orderError) throw new Error("Không thể tải chi tiết đơn bán.");
    const byId = new Map((orderData as OrderRow[]).map((row) => [row.id, row]));
    rows = visibleIds.map((id) => byId.get(id)).filter((row): row is OrderRow => Boolean(row));
    if (rows.length !== visibleIds.length) throw new Error("Danh sách đơn bán không nhất quán.");
  }
  return <><header className="page-heading"><div><p className="eyebrow">Bán hàng</p><h1>Đơn bán</h1><p className="lede">Một danh sách cho trạng thái thương mại, thực hiện và thanh toán được dẫn xuất.</p></div>{access.permissions.has("orders.create") && <ButtonLink href="/admin/orders/new">Tạo đơn bán</ButtonLink>}</header><ActionNotice notice={query.notice} error={query.error} />
    <form className="filter-bar"><label>Tìm kiếm<input name="q" defaultValue={list.q} placeholder="Mã đơn, khách hàng, công trình" /></label><label>Thương mại<select name="state" defaultValue={list.state}><option value="">Tất cả</option><option value="DRAFT">Nháp</option><option value="CONFIRMED">Đã xác nhận</option><option value="CANCELLED">Đã hủy</option></select></label><button className="button button-secondary" type="submit">Áp dụng</button>{(list.q || list.state) && <Link className="code-link" href="/admin/orders">Xóa lọc</Link>}</form>
    <section className="card"><div className="section-head"><h2>Đơn bán</h2><span className="scope-chip">25 / trang</span></div><div className="table-wrap"><table><thead><tr><th>Mã đơn</th><th>Khách hàng / công trình</th><th>Giá trị</th><th>Thương mại</th><th>Thực hiện</th><th>Thanh toán</th><th>Ngày tạo</th></tr></thead><tbody>{rows.map((order) => <tr key={order.id}><td><Link className="mono code-link" href={`/admin/orders/${order.id}`}>{order.order_number}</Link></td><td>{order.customer_name_snapshot}<small className="table-subline">{order.site_name_snapshot}</small></td><td className="mono">{formatVnd(vnd(order.total_vnd))}</td><td><StatusBadge tone={salesStateTone(order.commercial_state)}>{salesStateLabel(order.commercial_state)}</StatusBadge></td><td>{salesStateLabel(order.fulfillment_state)}</td><td>{salesStateLabel(order.payment_state)}</td><td>{new Intl.DateTimeFormat("vi-VN").format(new Date(order.created_at))}</td></tr>)}</tbody></table>{!rows.length && <p className="empty-inline">Không có đơn bán phù hợp.</p>}</div><ListPager page={list.page} hasNext={hasNext} params={{ q: list.q, state: list.state }} /></section></>;
}
