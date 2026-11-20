import Link from "next/link";
import type { ReactNode } from "react";
import { AxInvoiceTabs } from "@/components/astryx/fin-tabs";
import { AxButtonLink, AxPageHead } from "@/components/astryx/ax-kit";
import { AxPanel, AxTable } from "@/components/astryx/buystock-kit";

export type AxRegistryRow = { id: string; supplier: string; source: string; value: string; reference: string; recovery: ReactNode; state: string };
export type AxEligibleRow = { id: string; supplier: string; source: string; value: string; action: ReactNode };

/** Sổ chứng từ nhà cung cấp kiểu Astryx. Thông báo khôi phục lệnh và nút "ghi nguồn" (InvoiceCommand) là thành phần Classic hiện có, truyền qua slot. */
export function AstryxPurchaseInvoicesView({ permissions, rows, eligible, total, page }: {
  permissions: { has: (permission: string) => boolean }; rows: AxRegistryRow[]; eligible: AxEligibleRow[]; total: number; page: number;
}) {
  return <>
    <AxPageHead crumbs={["Mua hàng", "Hóa đơn mua"]} title="Sổ chứng từ nhà cung cấp" actions={<AxButtonLink href="/admin/invoices/purchases/matching">Đối chiếu lượng, giá và giá trị</AxButtonLink>} />
    <p className="hx-muted" style={{ margin: "-8px 0 12px" }}>Đối chiếu nguồn mua và chứng từ; chưa xác thực pháp lý.</p>
    <AxInvoiceTabs active="/admin/invoices/purchases" permissions={permissions} />
    <AxPanel title="Đã ghi nguồn" pad={false}>
      <AxTable label="Chứng từ nguồn đã ghi" heads={["Nhà cung cấp", "Nguồn", { label: "Giá trị", num: true }, "Tham chiếu", "Chứng từ"]} empty={rows.length === 0 ? <p>Chưa ghi chứng từ nguồn.</p> : undefined}
        foot={<span>{total} bản ghi · trang {page}{page > 1 && <> · <Link className="hx-code" href={`?page=${page - 1}`}>Trang trước</Link></>}{page * 25 < total && <> · <Link className="hx-code" href={`?page=${page + 1}`}>Trang sau</Link></>}</span>}>
        {rows.map((row) => <tr key={row.id}><td>{row.supplier}</td><td>{row.source}</td><td className="hx-num">{row.value}</td><td>{row.reference}{row.recovery}</td><td>{row.state}</td></tr>)}
      </AxTable>
    </AxPanel>
    <AxPanel title="Nguồn công nợ phải trả chưa ghi sổ" pad={false}>
      <AxTable label="Nguồn công nợ phải trả chưa ghi sổ" heads={["Nhà cung cấp", "Nguồn", { label: "Giá trị nguồn", num: true }, "Thao tác"]} empty={eligible.length === 0 ? <p>Không có nguồn mua đủ điều kiện trong trang hiện tại.</p> : undefined}>
        {eligible.map((row) => <tr key={row.id}><td>{row.supplier}</td><td>{row.source}</td><td className="hx-num">{row.value}</td><td>{row.action}</td></tr>)}
      </AxTable>
    </AxPanel>
  </>;
}
