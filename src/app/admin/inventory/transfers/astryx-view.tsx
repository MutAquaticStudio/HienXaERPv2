import Link from "next/link";
import type { ReactNode } from "react";
import { AxButtonLink, AxPageHead, AxStatus } from "@/components/astryx/ax-kit";
import { AxTable } from "@/components/astryx/buystock-kit";
import { ListPager } from "@/components/ui/list-pager";

export type AxTransferRow = { id: string; number: string; at: string; from: string; to: string; material: string; code: string; planned: string; received: string; statusLabel: string; tone: "success" | "warning" | "info"; stepForm: ReactNode };

/** Danh sách chuyển kho kiểu Astryx. Nút một chạm (Xuất kho / Nhận đủ) là form Classic hiện có (server action, operationId) truyền vào qua `stepForm`. */
export function AstryxTransfersView({ rows, canManage, notice, hasNext, page }: { rows: AxTransferRow[]; canManage: boolean; notice?: string; hasNext: boolean; page: number }) {
  return <>
    <AxPageHead crumbs={["Kho hàng", "Chuyển kho"]} title="Chuyển kho" actions={<><AxButtonLink href="/admin/inventory">Tồn kho</AxButtonLink>{canManage && <AxButtonLink href="/admin/inventory/transfers/new" kind="primary">+ Chuyển hàng</AxButtonLink>}</>} />
    {notice && <p className="form-message success" role="status">{notice}</p>}
    <p className="hx-muted" style={{ margin: "-8px 0 16px" }}>Chuyển hàng giữa các kho: tạo phiếu (xuất ngay), kho nhận bấm “Nhận đủ” khi hàng tới.</p>
    <AxTable label="Danh sách phiếu chuyển kho" heads={["Mã chuyển hàng", "Thời gian", "Từ kho → Tới kho", "Hàng hóa", { label: "SL chuyển", num: true }, { label: "Đã nhận", num: true }, "Trạng thái", { label: "Bước tiếp theo", hidden: true }]}
      empty={rows.length === 0 ? <p>Chưa có phiếu chuyển kho.</p> : undefined}>
      {rows.map((item) => <tr key={item.id}>
        <td><Link className="hx-code" href={`/admin/inventory/transfers/${item.id}`}>{item.number}</Link></td><td>{item.at}</td><td>{item.from} → {item.to}</td>
        <td>{item.material}<small className="bs-sub">{item.code}</small></td><td className="hx-num">{item.planned}</td><td className="hx-num">{item.received}</td>
        <td><AxStatus tone={item.tone}>{item.statusLabel}</AxStatus></td><td>{item.stepForm}</td></tr>)}
    </AxTable>
    <ListPager page={page} hasNext={hasNext} params={{}} />
  </>;
}
