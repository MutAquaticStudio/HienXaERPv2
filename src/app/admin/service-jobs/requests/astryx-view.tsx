import Link from "next/link";
import { AxButtonLink, AxFilterRadios, AxPageHead, AxPerson, AxStatus, toneOf } from "@/components/astryx/ax-kit";

export type AxServiceRequestRow = { id: string; number: string; customer: string; site: string; service: string; quantity: string; wish: string; slot: string; sentAt: string; stateLabel: string; stateTone: "success" | "warning" | "info" | "danger" };
const TEMPLATE = "110px minmax(0,1.3fr) minmax(0,1fr) 150px 150px 170px";

/** "Yêu cầu từ khách" kiểu Astryx: hộp thư các yêu cầu dịch vụ khách gửi từ cổng khách, lọc theo trạng thái bằng liên kết. */
export function AstryxServiceRequestsView({ rows, state, filters }: { rows: AxServiceRequestRow[]; state: string; filters: { value: string; label: string }[] }) {
  const current = filters.find((item) => item.value === state)?.label ?? "Yêu cầu";
  return <>
    <AxPageHead crumbs={["Bán hàng", "Dịch vụ", "Yêu cầu từ khách"]} title="Yêu cầu từ khách" actions={<AxButtonLink href="/admin/service-jobs">Về đơn dịch vụ</AxButtonLink>} />
    <p className="hx-muted" style={{ margin: "-8px 0 16px", maxWidth: 820 }}>Khách gửi yêu cầu trên cổng khách với ngày và buổi mong muốn. Mở yêu cầu để xếp lịch thành đơn dịch vụ (chọn giờ, xe hoặc máy, thợ) hoặc từ chối kèm lý do. Khách chưa bị tính tiền; giá cuối theo khối lượng đã xác minh.</p>
    <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
      <div className="hx-side"><AxFilterRadios title="Trạng thái" options={filters.map((item) => ({ href: `/admin/service-jobs/requests?state=${item.value}`, label: item.label, active: item.value === state }))} /></div>
      <section className="hx-card" style={{ flex: 1, minWidth: 0, overflow: "hidden", boxShadow: "var(--sh-2)" }} aria-label={current}>
        <div className="sx-ph"><h2>{rows.length} yêu cầu</h2></div>
        <div className="hx-th" style={{ gridTemplateColumns: TEMPLATE }}><span>Mã</span><span>Khách / công trình</span><span>Dịch vụ</span><span>Khách mong muốn</span><span>Gửi lúc</span><span>Trạng thái</span></div>
        {rows.length === 0 ? <div className="hx-empty" role="status"><p>{state === "SUBMITTED" ? "Không có yêu cầu nào đang chờ xác nhận lịch." : "Không có yêu cầu nào trong mục này."}</p></div>
          : rows.map((row) => <div className="hx-row" key={row.id}><div className="hx-tr" style={{ gridTemplateColumns: TEMPLATE }}>
            <Link href={`/admin/service-jobs/requests/${row.id}`} className="hx-code">{row.number}</Link>
            <AxPerson name={row.customer} sub={row.site} />
            <span>{row.service}<small className="sx-cell-sub">{row.quantity}</small></span>
            <span>{row.wish}<small className="sx-cell-sub">{row.slot}</small></span>
            <span>{row.sentAt}</span>
            <span><AxStatus tone={toneOf(row.stateTone)}>{row.stateLabel}</AxStatus></span>
          </div></div>)}
      </section>
    </div>
  </>;
}
