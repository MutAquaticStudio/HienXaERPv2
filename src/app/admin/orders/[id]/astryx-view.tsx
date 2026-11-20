import Link from "next/link";
import type { ReactNode } from "react";
import { AxPageHead, AxStatus, AxButtonLink, type AxTone } from "@/components/astryx/ax-kit";
import { AxBanner, AxFacts, AxFlow, AxPanel, AxStrip, AxSum, AxTag } from "@/components/astryx/sales-kit";

/** Các bước của "Tiến trình đơn" theo trạng thái thật của đơn (không thêm trạng thái mới): nhãn lấy từ nghiệp vụ bán hàng. */
export function orderFlow(commercial: string, fulfillment: string, fromPortal: boolean): { steps: string[]; at: number } | null {
  if (commercial === "CANCELLED") return null;
  if (commercial === "DRAFT") return fromPortal ? { steps: ["Khách đặt", "Chờ duyệt", "Đã xác nhận", "Hoàn tất"], at: 1 } : { steps: ["Bản nháp", "Đã xác nhận", "Đang giao", "Hoàn tất"], at: 0 };
  const steps = ["Bản nháp", "Đã xác nhận", "Đang giao", "Hoàn tất"];
  if (commercial === "CLOSED" || ["FULFILLED", "CLOSED_REMAINDER"].includes(fulfillment)) return { steps, at: 4 };
  return { steps, at: ["NOT_STARTED", "", undefined].includes(fulfillment) ? 1 : 2 };
}

export type AxOrderLineView = { id: string; name: string; quantity: string; unitPrice: string; listNote: string | null; total: string; priceSource: string; source: ReactNode };
export type AxOrderDetailProps = {
  id: string; number: string; customer: string; site: string; address: string; requestedAt: string; quotationRevisionId: string | null;
  commercial: { label: string; tone: AxTone | "danger" }; fulfillmentLabel: string; paymentLabel: string; flow: { steps: string[]; at: number } | null;
  fromPortal: boolean; isDraft: boolean; portalNote: string | null; seller: ReactNode;
  discount: string | null; totalLabel: string; total: string; prepaid: { paid: string; receipts: string; remaining: string } | null;
  lines: AxOrderLineView[]; deliveries: { id: string; number: string; stateLabel: string }[]; linesError?: boolean;
  /** Các khối chức năng đã dựng sẵn ở trang (giữ nguyên server action, operationId, expectedVersion). */
  slots: {
    print: ReactNode; notices: ReactNode; photos: ReactNode;
    approve: ReactNode; cancelBanner: ReactNode; // chỉ dùng cho đơn khách tự đặt đang chờ duyệt
    primary: ReactNode[]; secondary: ReactNode[]; danger: ReactNode[]; notes: ReactNode[];
  };
};

/** Chi tiết đơn bán kiểu Astryx: dải thông tin, băng "Chờ duyệt" cho đơn khách tự đặt, dòng hàng, tiến trình, thanh toán và hành động tiếp theo. */
export function AstryxOrderDetailView(props: AxOrderDetailProps) {
  const { slots } = props;
  const waiting = props.fromPortal && props.isDraft;
  return <>
    <AxPageHead crumbs={["Bán hàng", "Đơn bán", props.number]} title={props.number}
      actions={<>{slots.print}<AxButtonLink href="/admin/orders">Về danh sách</AxButtonLink></>} />
    <div style={{ marginTop: -12, marginBottom: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <AxStatus tone={props.commercial.tone}>{waiting ? "Khách đặt · Chờ duyệt" : props.commercial.label}</AxStatus>
      <span className="hx-muted">{props.customer} · {props.site}</span>
    </div>
    {props.fromPortal && <AxBanner status={waiting ? "warning" : "info"} title={waiting ? "Đơn khách tự đặt trên cổng khách, đang chờ văn phòng duyệt" : "Đơn khách tự đặt trên cổng khách"}
      description={<>{waiting ? "Kiểm tra hàng, giá và ngày giao (sửa bản nháp nếu cần), rồi bấm “Duyệt đơn” để giữ hạn mức và tự phân nguồn (đơn chờ vì kho chưa đủ hàng và đặt trong 7 ngày thì hệ thống tự duyệt lại khi kho có hàng, nếu khách trong hạn mức); hoặc hủy đơn — khách thấy ghi chú hủy nếu có." : "Khách tự đặt; đơn đã được xử lý theo quy trình thường."}{props.portalNote ? ` Ghi chú của khách: “${props.portalNote}”.` : ""}</>}
      actions={waiting ? <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{slots.cancelBanner}{slots.approve}</div> : undefined} />}
    <div className="sx-stack" style={{ marginBottom: 16 }}>{slots.notices}</div>
    <div className="sx-stack">
      <AxStrip items={[
        { label: "Khách hàng", value: props.customer },
        { label: "Công trình giao", value: props.site, sub: props.address },
        { label: "Giao dự kiến", value: props.requestedAt },
        { label: "NV bán hàng", value: props.seller },
      ]} />
      <div className="sx-cols">
        <div className="sx-stack">
          <AxPanel id="order-lines" title="Dòng hàng" sub={`${props.lines.length} dòng${props.quotationRevisionId ? " · nguồn: phiên bản báo giá" : ""}`} flush>
            <div className="sx-table-wrap"><table className="sx-table stack">
              <thead><tr><th scope="col">Vật tư</th><th scope="col" className="num">Số lượng</th><th scope="col" className="num">Đơn giá</th><th scope="col" className="num">Thành tiền</th><th scope="col">Nguồn giá</th><th scope="col">Phân nguồn</th></tr></thead>
              <tbody>{props.lines.map((line) => <tr key={line.id}>
                <td data-label="Vật tư"><b>{line.name}</b></td>
                <td data-label="Số lượng" className="num">{line.quantity}</td>
                <td data-label="Đơn giá" className="num">{line.unitPrice}{line.listNote && <small>{line.listNote}</small>}</td>
                <td data-label="Thành tiền" className="num"><b>{line.total}</b></td>
                <td data-label="Nguồn giá">{line.priceSource}</td>
                <td data-label="Phân nguồn">{line.source}</td>
              </tr>)}</tbody>
            </table></div>
          </AxPanel>
          {props.deliveries.length > 0 && <AxPanel title="Phiếu giao liên quan" flush>
            <table className="sx-table"><thead><tr><th scope="col">Phiếu giao</th><th scope="col">Trạng thái</th></tr></thead>
              <tbody>{props.deliveries.map((delivery) => <tr key={delivery.id}><td><Link className="hx-code" href={`/admin/deliveries/${delivery.id}`}>{delivery.number}</Link></td><td>{delivery.stateLabel}</td></tr>)}</tbody></table>
          </AxPanel>}
          {slots.photos}
        </div>
        <div className="sx-stack">
          {props.flow && <AxPanel title="Tiến trình đơn"><AxFlow steps={props.flow.steps} at={props.flow.at} label="Tiến trình đơn bán" />
            <div style={{ marginTop: 12 }}><AxFacts items={[{ label: "Thương mại", value: props.commercial.label }, { label: "Thực hiện", value: props.fulfillmentLabel }, { label: "Thanh toán", value: props.paymentLabel }]} /></div></AxPanel>}
          {!props.flow && <AxPanel title="Trạng thái"><AxFacts items={[{ label: "Thương mại", value: props.commercial.label }, { label: "Thực hiện", value: props.fulfillmentLabel }, { label: "Thanh toán", value: props.paymentLabel }]} /></AxPanel>}
          <AxPanel title="Thanh toán">
            {props.discount && <AxSum label="Giảm giá" value={`−${props.discount}`} />}
            <AxSum big label={props.totalLabel} value={props.total} />
            {props.prepaid && <><AxSum label="Khách đã trả trước" value={props.prepaid.paid} />
              <p className="sx-note">{props.prepaid.receipts} · <Link className="hx-code" href="/admin/cashbook">Sổ quỹ</Link></p>
              <AxSum label="Còn phải trả" value={props.prepaid.remaining} /></>}
          </AxPanel>
          <AxPanel title="Hành động tiếp theo">
            <div className="sx-act">
              {[...slots.primary, ...slots.secondary, ...slots.danger, ...slots.notes].map((node, index) => node ? <div key={index}>{node}</div> : null)}
              {waiting && <AxTag tone="w">Đơn chờ duyệt: Duyệt hoặc Hủy ở băng phía trên</AxTag>}
            </div>
          </AxPanel>
        </div>
      </div>
    </div>
  </>;
}
