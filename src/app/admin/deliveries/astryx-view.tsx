import Link from "next/link";
import { AxButtonLink, AxFilterRadios, AxPageHead, AxPerson, AxStatus, toneOf } from "@/components/astryx/ax-kit";
import { AxExpandRow } from "@/components/astryx/ax-expand-row";
import { AxEmpty } from "@/components/astryx/fin-kit";
import { formatBusinessDateTime } from "@/lib/core/business-time";
import { formatQuantity } from "@/lib/core/quantity";
import { ListPager } from "@/components/ui/list-pager";
import { deliveryStateLabel, deliveryStateTone } from "@/modules/delivery/presentation";

export type AxDeliveryRow = { id: string; sales_order_id: string; delivery_number: string; customer_name_snapshot: string; site_name_snapshot: string; execution_state: string; result_kind: string | null; scheduled_at: string | null; who: string };
export type AxDeliveryLine = { id: string; delivery_id: string; material_name_snapshot: string; planned_base_quantity: string; actual_base_quantity: string | null; base_uom_symbol: string };

const DOT: Record<string, string> = { PLANNED: "#E8890C", ASSIGNED: "#0B63C6", DISPATCHED: "#0B63C6", RESULT_SUBMITTED: "#0E8A9A", VERIFIED: "#12804A", CANCELLED: "#8493A8" };
const TEMPLATE = "36px 120px minmax(0,1.6fr) 150px 150px 130px 150px";

/** Danh sách phiếu giao kiểu Astryx: cùng dữ liệu, bộ lọc trạng thái (liên kết) và xem nhanh hàng trên phiếu. */
export function AstryxDeliveriesView({ rows, lines, states, current, counts, q, total, page, hasNext, canSplit, canCancel, isFiltered }: {
  rows: AxDeliveryRow[]; lines: AxDeliveryLine[]; states: readonly string[]; current: string; counts: string[]; q: string; total?: number; page: number; hasNext: boolean;
  canSplit: boolean; canCancel: boolean; isFiltered: boolean;
}) {
  const href = (state: string) => {
    const params = new URLSearchParams();
    if (state) params.set("state", state);
    if (q) params.set("q", q);
    const text = params.toString();
    return text ? `/admin/deliveries?${text}` : "/admin/deliveries";
  };
  return <>
    <AxPageHead crumbs={["Giao hàng", "Phiếu giao"]} title="Phiếu giao" />
    <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
      <div className="hx-side">
        <form method="get" action="/admin/deliveries" className="hx-card hx-pad" aria-label="Bộ lọc phiếu giao" style={{ display: "grid", gap: 12 }}>
          {current && <input type="hidden" name="state" value={current} />}
          <label className="hx-label">Tìm kiếm<input className="hx-in" type="search" name="q" defaultValue={q} placeholder="Mã phiếu, khách, công trình, đầu mối" style={{ width: "100%" }} /></label>
          <button type="submit" className="hx-btn p">Lọc</button>
          {isFiltered && <Link href="/admin/deliveries" style={{ color: "var(--hx-blue-t)", fontWeight: 600 }}>Xóa lọc</Link>}
        </form>
        <AxFilterRadios title="Trạng thái" options={states.map((state, index) => ({ href: href(state), label: state ? deliveryStateLabel(state) : "Tất cả", count: counts[index], active: state === current, dot: DOT[state] }))} />
      </div>
      <section className="hx-card" style={{ flex: 1, minWidth: 0, overflow: "hidden", boxShadow: "var(--sh-2)" }} aria-label="Danh sách phiếu giao">
        <div className="hx-th" style={{ gridTemplateColumns: TEMPLATE }}><span /><span>Mã phiếu</span><span>Khách / công trình</span><span>Lịch</span><span>Người / xe</span><span>Kết quả</span><span>Trạng thái</span></div>
        {rows.length === 0 ? <AxEmpty title={isFiltered ? "Không có phiếu giao phù hợp." : "Chưa có phiếu giao."} action={isFiltered ? <AxButtonLink href="/admin/deliveries">Xóa bộ lọc</AxButtonLink> : undefined} />
          : rows.map((row) => {
            const link = `/admin/deliveries/${row.id}`;
            const deliveryLines = lines.filter((line) => line.delivery_id === row.id);
            const open = ["PLANNED", "ASSIGNED"].includes(row.execution_state);
            return <AxExpandRow key={row.id} id={row.id} label={row.delivery_number} template={TEMPLATE} muted={row.execution_state === "CANCELLED"}
              cells={[
                <Link key="n" href={link} className="hx-code">{row.delivery_number}</Link>,
                <Link key="c" href={link}><AxPerson name={row.customer_name_snapshot} sub={row.site_name_snapshot} /></Link>,
                <span key="s">{row.scheduled_at ? formatBusinessDateTime(row.scheduled_at) : "Chưa hẹn"}</span>,
                <span key="w">{row.who}</span>,
                <span key="r">{row.result_kind ? deliveryStateLabel(row.result_kind) : "Chưa có"}</span>,
                <AxStatus key="t" tone={toneOf(deliveryStateTone(row.execution_state))}>{deliveryStateLabel(row.execution_state)}</AxStatus>,
              ]}
              detail={<>
                <div style={{ gridColumn: "1 / -1" }}><h4>Hàng trên phiếu</h4>{deliveryLines.length ? <ul style={{ margin: 0, paddingLeft: 18 }}>{deliveryLines.map((line) => <li key={line.id}>{line.material_name_snapshot} · {formatQuantity(line.planned_base_quantity)} {line.base_uom_symbol}{line.actual_base_quantity != null && <span className="hx-muted"> · Thực giao {formatQuantity(line.actual_base_quantity)} {line.base_uom_symbol}</span>}</li>)}</ul> : <p className="hx-muted">Chưa có dòng hàng.</p>}</div>
                <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <AxButtonLink href={link} kind="primary" small>Mở phiếu giao</AxButtonLink><AxButtonLink href={`/admin/orders/${row.sales_order_id}`} small>Mở đơn bán</AxButtonLink>
                  {open && canSplit && deliveryLines.length > 0 && <AxButtonLink href={`${link}/split`} small>Tách phiếu</AxButtonLink>}
                  {open && canCancel && <Link className="hx-btn d sm" href={`${link}/cancel`}>Hủy kế hoạch</Link>}</div></>} />;
          })}
        <div style={{ padding: "0 16px" }}><ListPager page={page} total={total} hasNext={hasNext} params={{ q: q || undefined, state: current || undefined }} /></div>
      </section>
    </div>
  </>;
}

/** Khung trang một bước của phiếu giao (tách phiếu, hủy kế hoạch): đầu trang + nội dung + liên kết quay lại. */
export function AstryxDeliveryFlowView({ number, title, subtitle, orderId, deliveryId, children }: { number: string; title: string; subtitle: string; orderId: string; deliveryId: string; children: React.ReactNode }) {
  return <>
    <AxPageHead crumbs={["Giao hàng", "Phiếu giao", number]} title={title} />
    <p className="hx-muted" style={{ margin: "-8px 0 16px" }}>{subtitle}</p>
    <div style={{ display: "grid", gap: 16, maxWidth: 960 }}>{children}
      <p style={{ margin: 0 }}><Link className="hx-code" href={`/admin/deliveries/${deliveryId}`}>Về phiếu giao</Link> · <Link className="hx-code" href={`/admin/orders/${orderId}`}>Về đơn bán</Link></p></div>
  </>;
}
