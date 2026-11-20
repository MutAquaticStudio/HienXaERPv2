import Link from "next/link";
import type { ReactNode } from "react";
import { AxButtonLink, AxPageHead, AxStatus } from "@/components/astryx/ax-kit";
import { AxField, AxFilters, AxSelectField, AxTable } from "@/components/astryx/buystock-kit";
import { BulkPageCheckbox, BulkRowCheckbox, BulkSelection } from "@/components/lists/bulk-selection";
import { ListPager } from "@/components/ui/list-pager";
import { formatVnd, vnd } from "@/lib/core/money";

export type AxSupplierRow = { id: string; code: string; name: string; phone: string | null; tax_code: string | null; payment_terms_days: number; active: boolean };

/** Danh sách nhà cung cấp kiểu Astryx. Nút tạo (hộp thoại danh mục) và thanh thao tác hàng loạt là thành phần Classic hiện có, truyền vào qua `createButton` / `bulkBar`. */
export function AstryxSuppliersView({ rows, debts, debtComplete, canManage, canReadPayables, canSeePricing, query, state, total, page, createButton, bulkBar, ids }: {
  rows: AxSupplierRow[]; debts: Record<string, string>; debtComplete: boolean; canManage: boolean; canReadPayables: boolean; canSeePricing: boolean;
  query: string; state: string; total: number; page: number; createButton: ReactNode; bulkBar: ReactNode; ids: string[];
}) {
  const filtered = Boolean(query || state);
  const heads = [...(canManage ? [{ label: "Chọn", hidden: true }] : []), "Mã", "Nhà cung cấp", "Điện thoại", ...(canReadPayables ? [{ label: "Còn phải trả", num: true }] : []), "Hạn thanh toán", "Trạng thái"];
  return <>
    <AxPageHead crumbs={["Mua hàng", "Nhà cung cấp"]} title="Nhà cung cấp"
      actions={<>{canSeePricing && <AxButtonLink href="/admin/suppliers/pricing">Bảng giá mua</AxButtonLink>}{createButton}</>} />
    <div className="bs-layout">
      <div className="hx-side">
        <AxFilters action="/admin/suppliers" label="Bộ lọc nhà cung cấp" showClear={filtered} clearHref="/admin/suppliers">
          <AxField label="Tìm kiếm" name="q" type="search" defaultValue={query} placeholder="Mã, tên, điện thoại" />
          <AxSelectField label="Trạng thái" name="state" defaultValue={state} options={[{ value: "", label: "Tất cả" }, { value: "ACTIVE", label: "Đang hoạt động" }, { value: "INACTIVE", label: "Ngừng giao dịch" }]} />
        </AxFilters>
      </div>
      <div className="bs-main">
        <BulkSelection key={JSON.stringify([query, state, page])}>
          <div className="hx-ch" style={{ padding: "0 0 12px" }}><b className="hx-sec">{total} nhà cung cấp</b><span className="hx-muted">25 / trang</span></div>
          {canManage && bulkBar}
          <AxTable label="Danh sách nhà cung cấp" heads={heads.map((head) => typeof head === "string" ? head : head)}
            empty={rows.length === 0 ? <p>{filtered ? "Không có nhà cung cấp phù hợp." : "Chưa có nhà cung cấp."}</p> : undefined}
            foot={canReadPayables && !debtComplete ? "Chưa tải đủ công nợ để hiển thị cột “Còn phải trả”. Xem tại Công nợ phải trả." : undefined}>
            {canManage && rows.length > 0 && <tr className="bs-group"><td><BulkPageCheckbox ids={ids} /></td><td colSpan={heads.length - 1}>Chọn tất cả trên trang này</td></tr>}
            {rows.map((supplier) => {
              const href = `/admin/suppliers/${supplier.id}`;
              const debt = BigInt(debts[supplier.id] ?? "0");
              return <tr key={supplier.id}>
                {canManage && <td><BulkRowCheckbox id={supplier.id} label={`${supplier.code} ${supplier.name}`} /></td>}
                <td><Link className="hx-code" href={href}>{supplier.code}</Link></td>
                <td><Link href={href}><b>{supplier.name}</b></Link>{supplier.tax_code && <small className="bs-sub">MST {supplier.tax_code}</small>}</td>
                <td>{supplier.phone ?? "Chưa có"}</td>
                {canReadPayables && <td className="hx-num">{!debtComplete ? "—" : debt > 0n ? <b>{formatVnd(vnd(debt.toString()))}</b> : "0 ₫"}</td>}
                <td>{supplier.payment_terms_days} ngày</td>
                <td><AxStatus tone={supplier.active ? "success" : "danger"}>{supplier.active ? "Đang hoạt động" : "Ngừng giao dịch"}</AxStatus></td>
              </tr>;
            })}
          </AxTable>
        </BulkSelection>
        <ListPager page={page} total={total} params={{ q: query, state }} />
      </div>
    </div>
  </>;
}
