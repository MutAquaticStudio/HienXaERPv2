import { applyDocumentListScope } from "@/lib/document-list-scope";
import { formatBusinessDate } from "@/lib/core/business-time";
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
  request = applyDocumentListScope(request, "commercial_state", list.state);
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
  const isFiltered = Boolean(list.q || list.state);
  return <>
    <header className="page-heading">
      <div><p className="eyebrow">Bán hàng</p><h1>Đơn bán</h1><p className="lede">Tìm đơn, xem tiến độ giao hàng và theo dõi thanh toán tại một nơi.</p></div>
      {access.permissions.has("orders.create") && <ButtonLink href="/admin/orders/new">Tạo đơn bán</ButtonLink>}
    </header>
    <ActionNotice notice={query.notice} error={query.error} />
    <form className="filter-bar" aria-label="Bộ lọc đơn bán">
      <label>Tìm kiếm<input type="search" name="q" defaultValue={list.q} placeholder="Mã đơn, tên khách hoặc công trình" /></label>
      <label>Trạng thái đơn<select name="state" defaultValue={list.state}><option value="">Đang làm việc (trừ đã hủy)</option><option value="ALL">Tất cả, gồm lịch sử hủy</option><option value="DRAFT">Nháp</option><option value="CONFIRMED">Đã xác nhận</option><option value="CANCELLED">Đã hủy</option></select></label>
      <button className="button button-secondary" type="submit">Áp dụng</button>
      {isFiltered && <Link className="code-link" href="/admin/orders">Xóa lọc</Link>}
    </form>
    <section className="card">
      <div className="section-head"><h2>Đơn bán</h2><span className="scope-chip">{CORE_LIST_PAGE_SIZE} / trang</span></div>
      {rows.length > 0 ? <>
        <div className="table-wrap orders-table-view"><table>
          <thead><tr><th>Mã đơn</th><th>Khách hàng / công trình</th><th>Giá trị</th><th>Thương mại</th><th>Thực hiện</th><th>Thanh toán</th><th>Ngày tạo</th></tr></thead>
          <tbody>{rows.map((order) => <tr key={order.id}>
            <td><Link className="mono code-link" href={`/admin/orders/${order.id}`}>{order.order_number}</Link></td>
            <td>{order.customer_name_snapshot}<small className="table-subline">{order.site_name_snapshot}</small></td>
            <td className="mono">{formatVnd(vnd(order.total_vnd))}</td>
            <td><StatusBadge tone={salesStateTone(order.commercial_state)}>{salesStateLabel(order.commercial_state)}</StatusBadge></td>
            <td>{salesStateLabel(order.fulfillment_state)}</td><td>{salesStateLabel(order.payment_state)}</td>
            <td>{formatBusinessDate(order.created_at)}</td>
          </tr>)}</tbody>
        </table></div>
        <ul className="orders-card-list" aria-label="Danh sách đơn bán">
          {rows.map((order) => <li key={order.id}><article className="order-summary-card">
            <div className="order-summary-head">
              <Link className="mono code-link" href={`/admin/orders/${order.id}`}>{order.order_number}</Link>
              <StatusBadge tone={salesStateTone(order.commercial_state)}>{salesStateLabel(order.commercial_state)}</StatusBadge>
            </div>
            <p className="order-summary-customer">{order.customer_name_snapshot}</p>
            <p className="order-summary-site">{order.site_name_snapshot}</p>
            <dl className="order-summary-values">
              <div><dt>Giá trị đơn</dt><dd className="mono">{formatVnd(vnd(order.total_vnd))}</dd></div>
              <div><dt>Ngày tạo</dt><dd>{formatBusinessDate(order.created_at)}</dd></div>
              <div><dt>Giao hàng</dt><dd>{salesStateLabel(order.fulfillment_state)}</dd></div>
              <div><dt>Thanh toán</dt><dd>{salesStateLabel(order.payment_state)}</dd></div>
            </dl>
            <Link className="button button-secondary order-summary-action" href={`/admin/orders/${order.id}`} aria-label={`Xem chi tiết đơn ${order.order_number}`}>Xem chi tiết</Link>
          </article></li>)}
        </ul>
      </> : <div className="orders-empty" role="status">
        <p>{isFiltered ? "Không có đơn bán phù hợp. Thử tên khác hoặc xóa bộ lọc." : "Chưa có đơn bán trong chi nhánh này."}</p>
        {isFiltered ? <Link className="button button-secondary" href="/admin/orders">Xóa bộ lọc</Link> : access.permissions.has("orders.create") && <ButtonLink href="/admin/orders/new">Tạo đơn bán đầu tiên</ButtonLink>}
      </div>}
      <ListPager page={list.page} hasNext={hasNext} params={{ q: list.q, state: list.state }} />
    </section>
  </>;
}
