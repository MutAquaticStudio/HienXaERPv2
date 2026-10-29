import { applyDocumentListScope } from "@/lib/document-list-scope";
import { formatBusinessDate, formatBusinessDateTime } from "@/lib/core/business-time";
import { formatQuantity } from "@/lib/core/quantity";
import { ExpandableRows } from "@/components/lists/expandable-rows";
import { ListFilterGroup, countText } from "@/components/lists/list-filter-group";
import Link from "next/link";
import { AutoFilterForm } from "@/components/ui/auto-filter-form";
import { ButtonLink } from "@/components/ui/button-link";
import { ListPager } from "@/components/ui/list-pager";
import { StatusBadge } from "@/components/ui/status-badge";
import { ActionNotice } from "@/components/sales/action-notice";
import { requireInternalPermission } from "@/lib/access/context";
import { CORE_LIST_PAGE_SIZE, parseCoreListQuery, ilikePattern } from "@/lib/core-list";
import { formatVnd, vnd } from "@/lib/core/money";
import { createServerSupabase } from "@/lib/supabase/server";
import { salesDeliveryStateLabel, salesStateLabel, salesStateTone } from "@/modules/sales/presentation";
import { loadSellers } from "@/modules/sales/seller";

type OrderRow = { id: string; order_number: string; sales_owner_employee_id: string | null; customer_name_snapshot: string; site_name_snapshot: string; commercial_state: string; fulfillment_state: string; payment_state: string; total_vnd: string; requested_delivery_at: string | null; created_at: string };
type LineRow = { sales_order_id: string; line_number: number; material_name_snapshot: string; quantity: string; line_total_vnd: string; units_of_measure: { symbol: string } | { symbol: string }[] | null };
type Query = { notice?: string; error?: string; q?: string; state?: string; page?: string; seller?: string };

const STATES = [
  { value: "", label: "Đang làm việc" },
  { value: "PORTAL_WAITING", label: "Khách đặt · chờ duyệt" },
  { value: "DRAFT", label: "Nháp" },
  { value: "CONFIRMED", label: "Đã xác nhận" },
  { value: "CANCELLED", label: "Đã hủy" },
  { value: "ALL", label: "Tất cả" },
] as const;
const symbol = (value: LineRow["units_of_measure"]) => (Array.isArray(value) ? value[0] : value)?.symbol ?? "";

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Query> }) {
  const access = await requireInternalPermission("orders.read");
  const query = await searchParams;
  const list = parseCoreListQuery(query);
  const supabase = await createServerSupabase();
  // FB16 (D38): "NV bán hàng" filter — "Đơn của tôi" or one seller.
  const sellers = await loadSellers(supabase, access.branchId);
  const seller = query.seller === "me" ? access.employeeId : sellers.some((item) => item.id === query.seller) ? query.seller! : "";
  const sellerParam = seller ? query.seller : undefined;
  const scoped = (state: string) => {
    let request = supabase.from("sales_orders").select("id").eq("branch_id", access.branchId);
    if (seller) request = request.eq("sales_owner_employee_id", seller);
    if (list.q) request = request.or(`order_number.ilike.${ilikePattern(list.q)},customer_name_snapshot.ilike.${ilikePattern(list.q)},site_name_snapshot.ilike.${ilikePattern(list.q)}`);
    // D15: "Khách đặt · chờ duyệt" = portal orders still in draft.
    return state === "PORTAL_WAITING" ? request.eq("order_channel", "CUSTOMER_PORTAL").eq("commercial_state", "DRAFT")
      : applyDocumentListScope(request, "commercial_state", state);
  };
  // Counts beside each filter stop at 99: an exact count over a long history is not worth the wait on every visit.
  const [{ data, error }, ...counts] = await Promise.all([
    scoped(list.state).order("created_at", { ascending: false }).order("id", { ascending: false }).range(list.from, list.to + 1),
    ...STATES.map((state) => scoped(state.value).limit(100)),
  ]);
  if (error) throw new Error("Không thể tải đơn bán.");
  const hasNext = (data?.length ?? 0) > CORE_LIST_PAGE_SIZE;
  const visibleIds = (data ?? []).slice(0, CORE_LIST_PAGE_SIZE).map((row) => row.id);
  let rows: OrderRow[] = [];
  let lines: LineRow[] = [];
  if (visibleIds.length) {
    const [{ data: orderData, error: orderError }, lineResult] = await Promise.all([
      supabase.from("sales_order_read")
        .select("id, order_number, sales_owner_employee_id, customer_name_snapshot, site_name_snapshot, commercial_state, fulfillment_state, payment_state, total_vnd::text, requested_delivery_at, created_at")
        .eq("branch_id", access.branchId).in("id", visibleIds),
      supabase.from("sales_order_lines").select("sales_order_id, line_number, material_name_snapshot, quantity, line_total_vnd::text, units_of_measure:ordered_uom_id(symbol)")
        .in("sales_order_id", visibleIds).order("line_number").limit(500),
    ]);
    if (orderError) throw new Error("Không thể tải chi tiết đơn bán.");
    const byId = new Map((orderData as OrderRow[]).map((row) => [row.id, row]));
    rows = visibleIds.map((id) => byId.get(id)).filter((row): row is OrderRow => Boolean(row));
    if (rows.length !== visibleIds.length) throw new Error("Danh sách đơn bán không nhất quán.");
    lines = (lineResult.data ?? []) as unknown as LineRow[];
  }
  const isFiltered = Boolean(list.q || list.state || seller);
  const sellerName = (id: string | null) => sellers.find((item) => item.id === id)?.name;
  const canCreate = access.permissions.has("orders.create");
  const currentLabel = STATES.find((state) => state.value === list.state)?.label ?? "Đang làm việc";
  return <div className="page-stack">
    <header className="page-heading">
      <div><p className="eyebrow">Bán hàng</p><h1>Đơn bán</h1><p className="lede">Bấm một dòng để mở đơn; mũi tên để xem nhanh hàng hóa ngay trong danh sách.</p></div>
      {canCreate && <div className="action-cluster"><ButtonLink href="/admin/orders/import" variant="secondary">Nhập từ Excel</ButtonLink><ButtonLink href="/admin/orders/new" variant="commerce">+ Tạo đơn bán</ButtonLink></div>}
    </header>
    <ActionNotice notice={query.notice} error={query.error} />
    <div className="list-layout">
      <AutoFilterForm className="card card-pad list-filters" aria-label="Bộ lọc đơn bán">
        <label className="list-filters-search">Tìm kiếm<input type="search" name="q" defaultValue={list.q} placeholder="Mã đơn, tên khách hoặc công trình" /></label>
        <label className="list-filters-search">NV bán hàng<select name="seller" defaultValue={sellerParam ?? ""}>
          <option value="">Tất cả</option><option value="me">Đơn của tôi</option>
          {sellers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        <ListFilterGroup key={list.state} legend="Trạng thái đơn" name="state" value={list.state}
          options={STATES.map((state, index) => ({ ...state, count: countText(counts[index].data) }))} />
        {isFiltered && <Link className="code-link" href="/admin/orders">Xóa lọc</Link>}
      </AutoFilterForm>
      <section className="card list-main">
        <div className="section-head"><h2>{currentLabel}</h2><span className="scope-chip">{CORE_LIST_PAGE_SIZE} / trang</span></div>
        {rows.length > 0 ? <div className="table-wrap"><table className="row-link-table">
          <thead><tr><th><span className="sr-only">Xem nhanh</span></th><th>Mã đơn</th><th>Khách hàng / công trình</th><th className="numeric">Giá trị</th><th>Trạng thái</th><th>Giao hàng</th><th>Thanh toán</th><th>Ngày tạo</th></tr></thead>
          <ExpandableRows columns={8} rows={rows.map((order) => {
            const href = `/admin/orders/${order.id}`;
            const orderLines = lines.filter((line) => line.sales_order_id === order.id);
            return { id: order.id, label: order.order_number, className: order.commercial_state === "CANCELLED" ? "row-muted" : undefined,
              cells: <>
                <td className="mono" data-label="Mã đơn"><Link className="code-link" href={href} tabIndex={-1}>{order.order_number}</Link>{sellerName(order.sales_owner_employee_id) && <small className="table-subline seller-subline">NV: {sellerName(order.sales_owner_employee_id)}</small>}</td>
                <td className="row-title" data-label="Khách hàng"><Link className="code-link row-link" href={href}>{order.customer_name_snapshot}</Link><small className="table-subline">{order.site_name_snapshot}</small></td>
                <td className="numeric mono" data-label="Giá trị">{formatVnd(vnd(order.total_vnd))}</td>
                <td data-label="Trạng thái"><StatusBadge tone={salesStateTone(order.commercial_state)}>{salesStateLabel(order.commercial_state)}</StatusBadge></td>
                <td data-label="Giao hàng">{salesDeliveryStateLabel(order.fulfillment_state)}</td>
                <td data-label="Thanh toán">{salesStateLabel(order.payment_state)}</td>
                <td data-label="Ngày tạo">{formatBusinessDate(order.created_at)}</td>
              </>,
              detail: <div className="row-expansion-grid">
                <section><h3>Hàng hóa</h3>{orderLines.length ? <ul className="clean-list">{orderLines.map((line) => <li key={line.line_number}>
                  {line.material_name_snapshot} · {formatQuantity(line.quantity)} {symbol(line.units_of_measure)}<small className="mono">{formatVnd(vnd(line.line_total_vnd))}</small></li>)}</ul>
                  : <p className="muted">Chưa có dòng hàng.</p>}</section>
                <section><h3>Giao hàng & thanh toán</h3><ul className="clean-list">
                  <li>Giao dự kiến: {order.requested_delivery_at ? formatBusinessDateTime(order.requested_delivery_at) : "Chưa hẹn"}</li>
                  <li>Giao hàng: {salesDeliveryStateLabel(order.fulfillment_state)}</li>
                  <li>Thanh toán: {salesStateLabel(order.payment_state)}</li>
                </ul></section>
                <section className="row-expansion-actions"><Link className="button button-primary" href={href}>Mở đơn</Link><a className="button button-secondary" href={`/api/orders/${order.id}/pdf`}>Tải PDF</a></section>
              </div> };
          })} />
        </table></div> : <div className="orders-empty" role="status">
          <p>{isFiltered ? "Không có đơn bán phù hợp. Thử tên khác hoặc xóa bộ lọc." : "Chưa có đơn bán trong chi nhánh này."}</p>
          {isFiltered ? <Link className="button button-secondary" href="/admin/orders">Xóa bộ lọc</Link> : canCreate && <ButtonLink href="/admin/orders/new" variant="commerce">Tạo đơn bán đầu tiên</ButtonLink>}
        </div>}
        <ListPager page={list.page} hasNext={hasNext} params={{ q: list.q, state: list.state, seller: sellerParam }} />
      </section>
    </div>
  </div>;
}
