import Link from "next/link";
import { ActionNotice } from "@/components/sales/action-notice";
import { AxButtonLink, AxFilterRadios, AxPageHead, AxPerson, AxStatus, toneOf } from "@/components/astryx/ax-kit";
import { AxExpandRow } from "@/components/astryx/ax-expand-row";
import { formatBusinessDate, formatBusinessDateTime } from "@/lib/core/business-time";
import { formatVnd, vnd } from "@/lib/core/money";
import { formatQuantity } from "@/lib/core/quantity";
import { salesDeliveryStateLabel, salesStateLabel, salesStateTone } from "@/modules/sales/presentation";

export type AxOrderRow = { id: string; order_number: string; sales_owner_employee_id: string | null; customer_name_snapshot: string; site_name_snapshot: string; commercial_state: string; fulfillment_state: string; payment_state: string; total_vnd: string; requested_delivery_at: string | null; created_at: string };
export type AxOrderLine = { sales_order_id: string; line_number: number; material_name_snapshot: string; quantity: string; line_total_vnd: string; symbol: string };

const DOT: Record<string, string> = { PORTAL_WAITING: "#E8890C", DRAFT: "#8493A8", CONFIRMED: "#0B63C6", CANCELLED: "#8493A8" };
const TEMPLATE = "36px 120px minmax(0,1.6fr) 130px 190px 130px 110px 120px";

/** Danh sách đơn bán kiểu Astryx: cùng dữ liệu và bộ lọc (qua địa chỉ) với bản Classic; chỉ khác cách dựng giao diện. */
export function AstryxOrdersView({ rows, lines, states, current, counts, query, sellers, sellerValue, dates, canCreate, notice, error, sellerName, isFiltered }: {
  rows: AxOrderRow[]; lines: AxOrderLine[];
  states: readonly { value: string; label: string }[]; current: string; counts: string[];
  query: string; sellers: { id: string; name: string }[]; sellerValue: string;
  dates: { createdFrom: string; createdTo: string; deliveryFrom: string; deliveryTo: string };
  canCreate: boolean; notice?: string; error?: string; sellerName: (id: string | null) => string | undefined; isFiltered: boolean;
}) {
  const href = (state: string) => {
    const params = new URLSearchParams();
    if (state) params.set("state", state);
    if (query) params.set("q", query);
    if (sellerValue) params.set("seller", sellerValue);
    for (const [key, value] of Object.entries(dates)) if (value) params.set(key, value);
    const text = params.toString();
    return text ? `/admin/orders?${text}` : "/admin/orders";
  };
  const currentLabel = states.find((state) => state.value === current)?.label ?? "Đang làm việc";
  return <>
    <AxPageHead crumbs={["Bán hàng", "Đơn bán"]} title="Đơn bán"
      actions={canCreate ? <><AxButtonLink href="/admin/orders/import">Nhập từ Excel</AxButtonLink><AxButtonLink href="/admin/orders/new" kind="commerce">+ Tạo đơn bán</AxButtonLink></> : undefined} />
    <ActionNotice notice={notice} error={error} />
    <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
      <div className="hx-side">
        <form method="get" action="/admin/orders" className="hx-card hx-pad" aria-label="Bộ lọc đơn bán" style={{ display: "grid", gap: 12 }}>
          {current && <input type="hidden" name="state" value={current} />}
          <label className="hx-label">Tìm kiếm<input className="hx-in" type="search" name="q" defaultValue={query} placeholder="Mã đơn, tên khách hoặc công trình" style={{ width: "100%" }} /></label>
          <label className="hx-label">NV bán hàng<select className="hx-in" name="seller" defaultValue={sellerValue} style={{ width: "100%" }}>
            <option value="">Tất cả</option><option value="me">Đơn của tôi</option>{sellers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="hx-label">Ngày tạo từ<input className="hx-in" type="date" name="createdFrom" defaultValue={dates.createdFrom} style={{ width: "100%" }} /></label>
          <label className="hx-label">Ngày tạo đến<input className="hx-in" type="date" name="createdTo" defaultValue={dates.createdTo} style={{ width: "100%" }} /></label>
          <label className="hx-label">Ngày giao từ<input className="hx-in" type="date" name="deliveryFrom" defaultValue={dates.deliveryFrom} style={{ width: "100%" }} /></label>
          <label className="hx-label">Ngày giao đến<input className="hx-in" type="date" name="deliveryTo" defaultValue={dates.deliveryTo} style={{ width: "100%" }} /></label>
          <button type="submit" className="hx-btn p">Lọc</button>
          {isFiltered && <Link href="/admin/orders" style={{ color: "var(--hx-blue-t)", fontWeight: 600 }}>Xóa lọc</Link>}
        </form>
        <AxFilterRadios title="Trạng thái đơn" options={states.map((state, index) => ({ href: href(state.value), label: state.label, count: counts[index], active: state.value === current, dot: DOT[state.value] }))} />
      </div>
      <section className="hx-card" style={{ flex: 1, minWidth: 0, overflow: "hidden", boxShadow: "var(--sh-2)" }} aria-label={currentLabel}>
        <div className="hx-th" style={{ gridTemplateColumns: TEMPLATE }}><span /><span>Mã đơn</span><span>Khách hàng / công trình</span><span className="hx-num">Giá trị</span><span>Trạng thái</span><span>Giao hàng</span><span>Ngày tạo</span><span>Ngày giao</span></div>
        {rows.length === 0 ? <div className="hx-empty" role="status"><p>{isFiltered ? "Không có đơn bán phù hợp. Thử tên khác hoặc xóa bộ lọc." : "Chưa có đơn bán trong chi nhánh này."}</p>
          {isFiltered ? <AxButtonLink href="/admin/orders">Xóa bộ lọc</AxButtonLink> : canCreate && <AxButtonLink href="/admin/orders/new" kind="commerce">Tạo đơn bán đầu tiên</AxButtonLink>}</div>
          : rows.map((order) => {
            const orderLines = lines.filter((line) => line.sales_order_id === order.id);
            const link = `/admin/orders/${order.id}`;
            return <AxExpandRow key={order.id} id={order.id} label={order.order_number} template={TEMPLATE} muted={order.commercial_state === "CANCELLED"}
              cells={[
                <Link key="n" href={link} className="hx-code">{order.order_number}</Link>,
                <Link key="c" href={link}><AxPerson name={order.customer_name_snapshot} sub={order.site_name_snapshot} /></Link>,
                <span key="v" className="hx-num">{formatVnd(vnd(order.total_vnd))}</span>,
                <AxStatus key="s" tone={toneOf(salesStateTone(order.commercial_state))}>{salesStateLabel(order.commercial_state)}</AxStatus>,
                <span key="d">{salesDeliveryStateLabel(order.fulfillment_state)}</span>,
                <span key="t">{formatBusinessDate(order.created_at)}</span>,
                <span key="g">{order.requested_delivery_at ? formatBusinessDate(order.requested_delivery_at) : <span className="hx-muted">Chưa hẹn</span>}</span>,
              ]}
              detail={<>
                <div style={{ gridColumn: "1 / -1" }}><h4>Hàng hóa</h4>{orderLines.length ? <ul style={{ margin: 0, paddingLeft: 18 }}>{orderLines.map((line) => <li key={line.line_number}>{line.material_name_snapshot} · {formatQuantity(line.quantity)} {line.symbol} <b className="hx-num" style={{ marginLeft: 8 }}>{formatVnd(vnd(line.line_total_vnd))}</b></li>)}</ul> : <p className="hx-muted">Chưa có dòng hàng.</p>}</div>
                <div><h4>Giao hàng và thanh toán</h4><ul style={{ margin: 0, paddingLeft: 18 }}>
                  <li>Giao dự kiến: {order.requested_delivery_at ? formatBusinessDateTime(order.requested_delivery_at) : "Chưa hẹn"}</li>
                  <li>Giao hàng: {salesDeliveryStateLabel(order.fulfillment_state)}</li><li>Thanh toán: {salesStateLabel(order.payment_state)}</li>{sellerName(order.sales_owner_employee_id) && <li>NV bán hàng: {sellerName(order.sales_owner_employee_id)}</li>}</ul></div>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end", justifyContent: "flex-end" }}><AxButtonLink href={link} kind="primary" small>Mở đơn</AxButtonLink><a className="hx-btn sm" href={`/api/orders/${order.id}/pdf`}>Tải PDF</a></div></>} />;
          })}
      </section>
    </div>
  </>;
}
