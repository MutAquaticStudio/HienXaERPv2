import type { ReactNode } from "react";
import { AxPageHead, AxStatus } from "@/components/astryx/ax-kit";
import { AxFacts, AxLegacy, AxPanel } from "@/components/astryx/buystock-kit";
import { AxInvoiceTabs } from "@/components/astryx/fin-tabs";

export type AxMatchLine = { id: string; source: string; po: string | null; material: string; unit: string; ordered: string; received: string; invoiced: string; poPrice: string; priceSource: string | null; invoicePrice: string; value: string; reservedNote: string | null;
  qtyOff: boolean; priceOff: boolean; valueOff: boolean; resultLabel: string; matched: boolean };

/** Chi tiết đối chiếu hóa đơn nhà cung cấp kiểu Astryx: dòng lệch tô màu, nhãn kết quả như Classic; form duyệt/hủy là thành phần Classic hiện có (`reviewForms`). */
export function AstryxMatchingDetail({ permissions, number, supplier, date, matchedAll, declared, source, businessText, reason, csvHref, lines, reviewForms }: {
  permissions: { has: (permission: string) => boolean }; number: string; supplier: string; date: string; matchedAll: boolean; declared: string; source: string; businessText: string; reason: string | null; csvHref: string;
  lines: AxMatchLine[]; reviewForms: { key: string; title: string; node: ReactNode }[];
}) {
  const matched = lines.filter((line) => line.matched).length;
  return <>
    <AxPageHead crumbs={["Mua hàng", "Hóa đơn mua", "Đối chiếu", number]} title={number} actions={<a className="hx-btn" href={csvHref}>Xuất bảng đối chiếu theo nguồn</a>} />
    <p className="hx-muted" style={{ margin: "-8px 0 12px" }}>{supplier} · {date}</p>
    <AxInvoiceTabs active="/admin/invoices/purchases/matching" permissions={permissions} />
    <AxFacts items={[{ label: "Đối chiếu", value: matchedAll ? "Đã khớp nguồn" : "Còn ngoại lệ đối chiếu", sub: `${matched}/${lines.length} dòng khớp` }, { label: "Khai báo trên hóa đơn", value: declared }, { label: "Nguồn đã ghi", value: source }, { label: "Duyệt nội bộ", value: businessText, sub: "Chưa xác minh pháp lý, không phát hành hóa đơn điện tử." }]} />
    {reason && <p className="hx-muted">{reason}</p>}
    <AxPanel title="Dòng hóa đơn" sub={`${matched}/${lines.length} dòng khớp`} pad={false}>
      <div className="bs-scroll"><table className="bs-table" aria-label="Dòng hóa đơn đối chiếu"><thead><tr><th scope="col">Phiếu nhập / đơn mua</th><th scope="col">Hàng · ĐVT</th><th scope="col" className="hx-num">SL đặt</th><th scope="col" className="hx-num">SL nhận</th><th scope="col" className="hx-num">SL hóa đơn</th><th scope="col" className="hx-num">Giá đơn mua</th><th scope="col" className="hx-num">Giá hóa đơn</th><th scope="col" className="hx-num">Thành tiền nhận → hóa đơn</th><th scope="col">Kết quả</th></tr></thead>
        <tbody>{lines.map((l) => <tr key={l.id}>
          <td><b className="hx-code">{l.source}</b>{l.po && <small className="bs-sub">Đơn mua {l.po}</small>}</td><td>{l.material}<small className="bs-sub">{l.unit}</small></td>
          <td className="hx-num">{l.ordered}</td><td className="hx-num">{l.received}</td><td className={`hx-num${l.qtyOff ? " hx-neg" : ""}`}>{l.invoiced}</td>
          <td className="hx-num">{l.poPrice}{l.priceSource && <small className="bs-sub">{l.priceSource}</small>}</td><td className={`hx-num${l.priceOff ? " hx-neg" : ""}`}>{l.invoicePrice}</td>
          <td className={`hx-num${l.valueOff ? " hx-neg" : ""}`}>{l.value}{l.reservedNote && <small className="bs-sub">{l.reservedNote}</small>}</td>
          <td><AxStatus tone={l.matched ? "success" : "warning"}>{l.resultLabel}</AxStatus></td></tr>)}</tbody></table></div>
    </AxPanel>
    {reviewForms.map((form) => <AxLegacy key={form.key} title={form.title}>{form.node}</AxLegacy>)}
  </>;
}
