import Link from "next/link";
import type { ReactNode } from "react";
import { AxButtonLink, AxPageHead } from "@/components/astryx/ax-kit";
import { AxField, AxFilters, AxSelectField } from "@/components/astryx/buystock-kit";
import { AxMaterialRows } from "@/components/astryx/products-material-rows";
import type { MaterialListRow } from "@/components/catalog/material-list-rows";
import { BulkPageCheckbox, BulkSelection } from "@/components/lists/bulk-selection";
import { ListPager } from "@/components/ui/list-pager";
import { CORE_LIST_PAGE_SIZE } from "@/lib/core-list";

/** Danh sách vật tư kiểu Astryx. Các nút/hộp thoại Classic (tạo vật tư, hàng cùng loại, thao tác hàng loạt) truyền vào qua slot và giữ nguyên chức năng. */
export function AstryxProductsView({ rows, ids, can, groups, variantOptions, group, variant, state, use, query, total, page, createButton, variantButton, editVariantButton, bulkBar, currentVariant }: {
  rows: MaterialListRow[]; ids: string[]; can: { manage: boolean; price: boolean; stock: boolean; cost: boolean };
  groups: { id: string; name: string }[]; variantOptions: { id: string; name: string }[]; group: string; variant: string; state: string; use: string; query: string; total: number; page: number;
  createButton: ReactNode; variantButton: ReactNode; editVariantButton: ReactNode; bulkBar: ReactNode;
  currentVariant: { name: string; attributeNames: string[]; active: boolean } | null;
}) {
  const filtered = Boolean(query || state || group || use || variant);
  return <>
    <AxPageHead crumbs={["Kho hàng", "Vật tư"]} title="Vật tư"
      actions={<>
        {can.manage && <><AxButtonLink href="/admin/products/manage?kind=groups">Nhóm vật tư</AxButtonLink><AxButtonLink href="/admin/products/manage?kind=units">Đơn vị tính</AxButtonLink></>}
        {can.price && <AxButtonLink href="/admin/products/pricing">Thiết lập giá</AxButtonLink>}
        {variantButton}{createButton}
      </>} />
    <div className="bs-layout">
      <div className="hx-side">
        <AxFilters action="/admin/products" label="Bộ lọc vật tư" showClear={filtered} clearHref="/admin/products">
          <AxField label="Tìm kiếm" name="q" type="search" defaultValue={query} placeholder="Mã hoặc tên vật tư" />
          <AxSelectField label="Nhóm vật tư" name="group" defaultValue={group} options={[{ value: "", label: "Tất cả" }, ...groups.map((item) => ({ value: item.id, label: item.name }))]} />
          {variantOptions.length > 0 && <AxSelectField label="Hàng cùng loại" name="variant" defaultValue={variant} options={[{ value: "", label: "Tất cả" }, ...variantOptions.map((item) => ({ value: item.id, label: item.name }))]} />}
          <AxSelectField label="Trạng thái" name="state" defaultValue={state} options={[{ value: "", label: "Tất cả" }, { value: "ACTIVE", label: "Đang dùng" }, { value: "INACTIVE", label: "Ngừng dùng" }]} />
          <AxSelectField label="Cho phép" name="use" defaultValue={use} options={[{ value: "", label: "Tất cả" }, { value: "SALE", label: "Được bán" }, { value: "PURCHASE", label: "Được mua" }]} />
        </AxFilters>
      </div>
      <div className="bs-main">
        <BulkSelection key={JSON.stringify([query, state, group, use, variant, page])}>
          <div className="hx-ch" style={{ padding: "0 0 12px" }}><b className="hx-sec">{total} vật tư</b><span className="hx-muted">{CORE_LIST_PAGE_SIZE} / trang</span></div>
          {can.manage && bulkBar}
          {currentVariant && <div className="hx-card hx-pad" style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <span>Hàng cùng loại <b>{currentVariant.name}</b> · thuộc tính {currentVariant.attributeNames.join(", ")}{currentVariant.active ? "" : " · đã ngừng"}</span>{can.manage && editVariantButton}</div>}
          <div className="hx-card bs-panel"><div className="bs-scroll"><table className="bs-table" aria-label="Danh sách vật tư">
            <thead><tr>{can.manage && <th scope="col"><BulkPageCheckbox ids={ids} /></th>}<th scope="col"><span className="sr-only">Mở rộng</span></th><th scope="col">Mã</th><th scope="col">Tên vật tư</th><th scope="col">Nhóm</th><th scope="col">ĐVT</th>
              {can.price && <th scope="col" className="hx-num">Giá bán</th>}{can.cost && <th scope="col" className="hx-num">Giá vốn</th>}{can.stock && <th scope="col" className="hx-num">Tồn kho</th>}<th scope="col">Trạng thái</th></tr></thead>
            <AxMaterialRows rows={rows} showPrice={can.price} showCost={can.cost} showStock={can.stock} selectable={can.manage} />
          </table></div>
          {rows.length === 0 && <div className="hx-empty" role="status"><p>Không có vật tư phù hợp.</p>{filtered && <Link className="hx-btn" href="/admin/products">Xóa bộ lọc</Link>}</div>}</div>
        </BulkSelection>
        <ListPager page={page} total={total} params={{ q: query, state, group: group || undefined, use: use || undefined, variant: variant || undefined }} />
      </div>
    </div>
  </>;
}
