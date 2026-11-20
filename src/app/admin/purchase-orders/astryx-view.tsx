import Link from "next/link";
import { ActionNotice } from "@/components/sales/action-notice";
import { AxButtonLink, AxFilterRadios, AxPageHead, AxPerson, AxStatus, toneOf } from "@/components/astryx/ax-kit";
import { AxExpandRow } from "@/components/astryx/ax-expand-row";
import { AxField, AxFilters, AxSelectField, axHref } from "@/components/astryx/buystock-kit";
import { ListPager } from "@/components/ui/list-pager";
import { formatBusinessDate } from "@/lib/core/business-time";
import { formatVnd, vnd } from "@/lib/core/money";
import { formatQuantity } from "@/lib/core/quantity";
import { purchaseStateLabel, purchaseStateTone } from "@/modules/purchasing/presentation";

export type AxPurchaseRow = { id: string; purchase_order_number: string; supplier_name_snapshot: string; destination_type: string; destination_name_snapshot: string; source_sales_order_id: string | null; state: string; expected_at: string | null; total_cost_vnd?: string | null };
export type AxPurchaseLine = { purchase_order_id: string; id: string; material_name_snapshot: string; quantity: string; symbol: string; line_total_cost_vnd?: string | null };
/** Gửi NCC: `null` = không áp dụng (chưa xác nhận); `text` rỗng = chưa gửi. */
export type AxSent = { applicable: boolean; text: string };

const DOT: Record<string, string> = { DRAFT: "#E8890C", CONFIRMED: "#0B63C6", CLOSED: "#12804A", CANCELLED: "#8493A8" };
const TEMPLATE = "36px 150px minmax(0,1.4fr) minmax(0,1.2fr) 130px 110px 190px 190px";

/** Danh sách đơn mua kiểu Astryx: cùng dữ liệu, bộ lọc và nhãn trạng thái (purchaseStateLabel) với bản Classic. */
export function AstryxPurchaseOrdersView({ rows, lines, sent, states, current, counts, query, suppliers, supplierValue, dates, canCreate, canReadPrice, notice, error, isFiltered, page, total }: {
  rows: AxPurchaseRow[]; lines: AxPurchaseLine[]; sent: Record<string, AxSent>;
  states: readonly { value: string; label: string }[]; current: string; counts: string[];
  query: string; suppliers: { id: string; name: string; active: boolean }[]; supplierValue: string;
  dates: { createdFrom: string; createdTo: string; deliveryFrom: string; deliveryTo: string };
  canCreate: boolean; canReadPrice: boolean; notice?: string; error?: string; isFiltered: boolean; page: number; total: number;
}) {
  const params = { q: query, supplier: supplierValue, ...dates };
  const href = (state: string) => axHref("/admin/purchase-orders", { state, ...params });
  const sentCell = (id: string) => {
    const info = sent[id];
    if (!info?.applicable) return <span className="hx-muted">—</span>;
    return info.text ? <span>{info.text}</span> : <AxStatus tone="warning">Chưa gửi</AxStatus>;
  };
  return <>
    <AxPageHead crumbs={["Mua hàng", "Đơn mua"]} title="Đơn mua"
      actions={<><AxButtonLink href="/admin/purchases/returns">Trả hàng nhập</AxButtonLink>{canCreate && <AxButtonLink href="/admin/purchase-orders/new" kind="primary">+ Tạo đơn mua</AxButtonLink>}</>} />
    <ActionNotice notice={notice} error={error} />
    <div className="bs-layout">
      <div className="hx-side">
        <AxFilters action="/admin/purchase-orders" label="Bộ lọc đơn mua" showClear={isFiltered} clearHref="/admin/purchase-orders">
          {current && <input type="hidden" name="state" value={current} />}
          <AxField label="Tìm kiếm" name="q" type="search" defaultValue={query} placeholder="Mã đơn mua, NCC, điểm đến" />
          <AxSelectField label="Nhà cung cấp" name="supplier" defaultValue={supplierValue} options={[{ value: "", label: "Tất cả" }, ...suppliers.map((item) => ({ value: item.id, label: item.active ? item.name : `${item.name} (ngừng)` }))]} />
          <AxField label="Ngày tạo từ" name="createdFrom" type="date" defaultValue={dates.createdFrom} />
          <AxField label="Ngày tạo đến" name="createdTo" type="date" defaultValue={dates.createdTo} />
          <AxField label="Ngày nhận từ" name="deliveryFrom" type="date" defaultValue={dates.deliveryFrom} />
          <AxField label="Ngày nhận đến" name="deliveryTo" type="date" defaultValue={dates.deliveryTo} />
        </AxFilters>
        <AxFilterRadios title="Trạng thái" options={states.map((state, index) => ({ href: href(state.value), label: ["DRAFT", "CONFIRMED", "CLOSED", "CANCELLED"].includes(state.value) ? purchaseStateLabel(state.value) : state.label, count: counts[index], active: state.value === current, dot: DOT[state.value] }))} />
      </div>
      <section className="hx-card bs-main" style={{ overflow: "hidden", boxShadow: "var(--sh-2)" }} aria-label="Danh sách đơn mua">
        <div className="hx-ch bd"><b className="hx-sec">{total} đơn mua</b><span className="hx-muted">25 / trang</span></div>
        <div className="hx-th" style={{ gridTemplateColumns: TEMPLATE }}><span /><span>Mã đơn mua</span><span>Nhà cung cấp</span><span>Điểm đến</span><span className="hx-num">Giá trị</span><span>Dự kiến</span><span>Trạng thái</span><span>Gửi NCC</span></div>
        {rows.length === 0 ? <div className="hx-empty" role="status"><p>{isFiltered ? "Không có đơn mua phù hợp." : "Chưa có đơn mua trong chi nhánh này."}</p>{isFiltered && <AxButtonLink href="/admin/purchase-orders">Xóa bộ lọc</AxButtonLink>}</div>
          : rows.map((order) => {
            const link = `/admin/purchase-orders/${order.id}`;
            const orderLines = lines.filter((line) => line.purchase_order_id === order.id);
            return <AxExpandRow key={order.id} id={order.id} label={order.purchase_order_number} template={TEMPLATE} muted={order.state === "CANCELLED"}
              cells={[
                <Link key="n" href={link} className="hx-code">{order.purchase_order_number}</Link>,
                <Link key="s" href={link}><AxPerson name={order.supplier_name_snapshot} sub={order.source_sales_order_id ? "Từ đơn bán" : "Mua về kho"} /></Link>,
                <span key="d">{purchaseStateLabel(order.destination_type)}<small className="bs-sub">{order.destination_name_snapshot}</small></span>,
                <span key="v" className="hx-num">{canReadPrice && order.total_cost_vnd != null ? formatVnd(vnd(order.total_cost_vnd)) : "—"}</span>,
                <span key="e">{order.expected_at ? formatBusinessDate(order.expected_at) : "Chưa hẹn"}</span>,
                <AxStatus key="t" tone={toneOf(purchaseStateTone(order.state))}>{purchaseStateLabel(order.state)}</AxStatus>,
                <span key="g">{sentCell(order.id)}</span>,
              ]}
              detail={<>
                <div style={{ gridColumn: "1 / -1" }}><h4>Hàng hóa</h4>{orderLines.length ? <ul style={{ margin: 0, paddingLeft: 18 }}>{orderLines.map((line) => <li key={line.id}>{line.material_name_snapshot} · {formatQuantity(line.quantity)} {line.symbol}{canReadPrice && line.line_total_cost_vnd != null && <b className="hx-num" style={{ marginLeft: 8 }}>{formatVnd(vnd(line.line_total_cost_vnd))}</b>}</li>)}</ul> : <p className="hx-muted">Chưa có dòng hàng.</p>}</div>
                <div><h4>Giao nhận</h4><ul style={{ margin: 0, paddingLeft: 18 }}><li>{purchaseStateLabel(order.destination_type)}: {order.destination_name_snapshot}</li><li>Dự kiến: {order.expected_at ? formatBusinessDate(order.expected_at) : "Chưa hẹn"}</li><li>Gửi NCC: {sentCell(order.id)}</li></ul></div>
                <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "flex-end" }}><AxButtonLink href={link} kind="primary" small>Mở đơn mua</AxButtonLink></div></>} />;
          })}
        <ListPager page={page} total={total} params={{ q: query, state: current, supplier: supplierValue || undefined, createdFrom: dates.createdFrom || undefined, createdTo: dates.createdTo || undefined, deliveryFrom: dates.deliveryFrom || undefined, deliveryTo: dates.deliveryTo || undefined }} />
      </section>
    </div>
  </>;
}
