import type { ReactNode } from "react";
import { AxPageHead, AxStatus } from "@/components/astryx/ax-kit";
import { AxDetails, AxLegacy, AxPanel, AxTable } from "@/components/astryx/buystock-kit";

export type AxTransferHistory = { id: string; at: string; who: string; action: string; qty: string; value: string | null; reason: string };

/** Chi tiết phiếu chuyển kho kiểu Astryx. Nút một chạm và các form xuất/nhận từng phần, báo thiếu, duyệt hao hụt là thành phần Classic hiện có (`oneTap`, `eventForms`). */
export function AstryxTransferDetail({ number, from, to, createdAt, createdBy, reason, status, tone, material, code, quantities, inTransitValue, oneTap, eventForms, history, showValue, notice, error }: {
  number: string; from: string; to: string; createdAt: string; createdBy: string; reason: string; status: string; tone: "success" | "warning" | "info"; material: string; code: string;
  quantities: { planned: string; shipped: string; received: string; inTransit: string; lost: string }; inTransitValue: string | null; oneTap: ReactNode; eventForms: { kind: string; title: string; node: ReactNode }[];
  history: AxTransferHistory[]; showValue: boolean; notice?: string; error?: string;
}) {
  return <>
    <AxPageHead crumbs={["Kho hàng", "Chuyển kho", number]} title={number} actions={<><AxStatus tone={tone}>{status}</AxStatus>{oneTap}</>} />
    {notice && <p className="form-message success" role="status">{notice}</p>}
    {error && <p className="form-message" role="alert">{error}</p>}
    <AxPanel title="Thông tin phiếu"><AxDetails items={[{ label: "Từ kho", value: from }, { label: "Tới kho", value: to }, { label: "Ngày tạo", value: `${createdAt} · ${createdBy}` }, { label: "Ghi chú", value: reason }]} /></AxPanel>
    <AxTable label="Hàng chuyển" heads={["Hàng hóa", { label: "SL chuyển", num: true }, { label: "Đã xuất", num: true }, { label: "Đã nhận", num: true }, { label: "Đang chuyển", num: true }, { label: "Thiếu / hao hụt", num: true }, ...(inTransitValue !== null ? [{ label: "Giá trị đang chuyển", num: true }] : [])]}>
      <tr><td><b>{material}</b><small className="bs-sub">{code}</small></td><td className="hx-num">{quantities.planned}</td><td className="hx-num">{quantities.shipped}</td><td className="hx-num">{quantities.received}</td><td className="hx-num">{quantities.inTransit}</td><td className="hx-num">{quantities.lost}</td>
        {inTransitValue !== null && <td className="hx-num">{inTransitValue}</td>}</tr>
    </AxTable>
    {eventForms.length > 0 && <AxLegacy title="Xuất / nhận từng phần, báo thiếu, duyệt hao hụt">{eventForms.map((item) => <section key={item.kind}><h3 style={{ margin: "0 0 8px", fontSize: 15 }}>{item.title}</h3>{item.node}</section>)}</AxLegacy>}
    <AxTable label="Lịch sử phiếu" heads={["Thời gian", "Người làm", "Thao tác", { label: "Số lượng", num: true }, ...(showValue ? [{ label: "Giá trị", num: true }] : []), "Ghi chú"]}
      empty={history.length === 0 ? <p>Chưa xuất kho.</p> : undefined}>
      {history.map((e) => <tr key={e.id}><td>{e.at}</td><td>{e.who}</td><td>{e.action}</td><td className="hx-num">{e.qty}</td>{showValue && <td className="hx-num">{e.value ?? "—"}</td>}<td>{e.reason}</td></tr>)}
    </AxTable>
  </>;
}
