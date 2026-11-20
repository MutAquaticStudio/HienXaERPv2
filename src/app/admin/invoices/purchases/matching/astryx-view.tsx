import Link from "next/link";
import type { ReactNode } from "react";
import { AxInvoiceTabs } from "@/components/astryx/fin-tabs";
import { AxPageHead, AxStatus } from "@/components/astryx/ax-kit";
import { AxBanner } from "@/components/astryx/sales-kit";
import { AxLegacy, AxTable } from "@/components/astryx/buystock-kit";
import { ListPager } from "@/components/ui/list-pager";

export type AxDocRow = { id: string; number: string; supplier: string; kind: string; value: string; matched: boolean; business: string };

/** Đối chiếu hóa đơn nhà cung cấp kiểu Astryx; form "Đối chiếu hóa đơn mới" là thành phần Classic hiện có (`createForm`). */
export function AstryxMatchingView({ permissions, rows, createForm, hasNext, page }: { permissions: { has: (permission: string) => boolean }; rows: AxDocRow[]; createForm: ReactNode; hasNext: boolean; page: number }) {
  return <>
    <AxPageHead crumbs={["Mua hàng", "Hóa đơn mua", "Đối chiếu"]} title="Đối chiếu hóa đơn nhà cung cấp" />
    <p className="hx-muted" style={{ margin: "-8px 0 12px" }}>Nhập hóa đơn của nhà cung cấp và so với đơn mua, phiếu nhập: số lượng đặt, đã nhận, trên hóa đơn và giá. Dòng lệch được tô màu.</p>
    <AxInvoiceTabs active="/admin/invoices/purchases/matching" permissions={permissions} />
    <div style={{ marginBottom: 16 }}><AxBanner status="info" title="Chưa phát hành hóa đơn" description="Duyệt nội bộ và xuất bảng đối chiếu được hỗ trợ. Chưa có kết nối dịch vụ hóa đơn để phát hành hoặc xác minh pháp lý; không báo đã phát hành." /></div>
    {createForm && <AxLegacy title="+ Đối chiếu hóa đơn mới">{createForm}</AxLegacy>}
    <AxTable label="Chứng từ đã đối chiếu" heads={["Số hóa đơn", "Nhà cung cấp", "Loại", { label: "Giá trị hóa đơn", num: true }, "Đối chiếu / duyệt", "Pháp lý"]} empty={rows.length === 0 ? <p>Chưa có chứng từ đối chiếu.</p> : undefined}>
      {rows.map((d) => <tr key={d.id}><td><Link className="hx-code" href={`/admin/invoices/purchases/matching/${d.id}`}>{d.number}</Link></td><td>{d.supplier}</td><td>{d.kind}</td><td className="hx-num">{d.value}</td>
        <td><div className="bs-inline"><AxStatus tone={d.matched ? "success" : "warning"}>{d.matched ? "Khớp" : "Có lệch"}</AxStatus><span>{d.business}</span></div></td><td>Chưa xác minh pháp lý</td></tr>)}
    </AxTable>
    <ListPager page={page} hasNext={hasNext} params={{}} />
  </>;
}
