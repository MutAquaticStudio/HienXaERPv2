import Link from "next/link";
import type { ReactNode } from "react";
import { AxButtonLink, AxPageHead, AxPerson, AxStatus, toneOf } from "@/components/astryx/ax-kit";
import { AutoFilterForm } from "@/components/ui/auto-filter-form";
import { BulkPageCheckbox, BulkRowCheckbox, BulkSelection } from "@/components/lists/bulk-selection";
import { ListFilterGroup } from "@/components/lists/list-filter-group";
import { ListPager } from "@/components/ui/list-pager";

export type AxCustomerListRow = { id: string; code: string; name: string; typeLabel: string; phone: string | null; tierName: string; debt: string | null; debtPositive: boolean; limit: string | null; active: boolean };

/** Danh sách khách hàng kiểu Astryx: cùng truy vấn, bộ lọc (địa chỉ GET), chọn nhiều và thao tác hàng loạt như bản Classic. */
export function AstryxCustomersView({ rows, total, branchName, query, filters, tiers, canManage, canReadFinance, debtComplete, ids, create, bulkPortal, bulkBar, page }: {
  rows: AxCustomerListRow[]; total: number; branchName: string;
  query: { q: string; state: string; type: string; tier: string };
  filters: { stateOptions: { value: string; label: string }[]; typeOptions: { value: string; label: string }[] };
  tiers: { code: string; name: string }[]; canManage: boolean; canReadFinance: boolean; debtComplete: boolean; ids: string[];
  create: ReactNode; bulkPortal: ReactNode; bulkBar: ReactNode; page: number;
}) {
  const isFiltered = Boolean(query.q || query.state || query.tier || query.type);
  const columns = `${canManage ? "36px " : ""}100px minmax(0,1.6fr) 140px 150px${canReadFinance ? " 140px 140px" : ""} 140px`;
  return <>
    <AxPageHead crumbs={["Bán hàng", "Khách hàng"]} title="Khách hàng"
      actions={canManage ? <>{bulkPortal}<AxButtonLink href="/admin/customers/manage?kind=sites">Công trình</AxButtonLink>{create}</> : undefined} />
    <p className="hx-muted" style={{ margin: "-8px 0 16px" }}>Hồ sơ khách hàng tại {branchName}. Bấm vào một dòng để xem chi tiết.</p>
    <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }} className="sx-legacy">
      <div className="hx-side">
        <AutoFilterForm className="hx-card hx-pad sx-filters" aria-label="Bộ lọc khách hàng">
          <label className="hx-label">Tìm kiếm<input className="hx-in" type="search" name="q" defaultValue={query.q} placeholder="Mã, tên, điện thoại" style={{ width: "100%" }} /></label>
          <label className="hx-label">Loại khách<select className="hx-in" name="type" defaultValue={query.type} style={{ width: "100%" }}>{filters.typeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label className="hx-label">Nhóm giá<select className="hx-in" name="tier" defaultValue={query.tier} style={{ width: "100%" }}><option value="">Tất cả</option><option value="DEFAULT">Giá chung</option>{tiers.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
          <ListFilterGroup key={query.state} legend="Trạng thái" name="state" value={query.state} options={filters.stateOptions} />
          {isFiltered && <Link href="/admin/customers" style={{ color: "var(--hx-blue-t)", fontWeight: 600 }}>Xóa lọc</Link>}
        </AutoFilterForm>
      </div>
      <BulkSelection key={JSON.stringify([query.q, query.state, query.tier, query.type, page])}>
        <section className="hx-card" style={{ flex: 1, minWidth: 0, overflow: "hidden", boxShadow: "var(--sh-2)" }} aria-label={`${total} khách hàng`}>
          <div className="sx-ph"><h2>{total} khách hàng</h2><span className="hx-muted">25 / trang</span></div>
          {canManage && bulkBar}
          <div className="hx-th" style={{ gridTemplateColumns: columns }}>{canManage && <span><BulkPageCheckbox ids={ids} /></span>}<span>Mã</span><span>Tên khách hàng</span><span>Điện thoại</span><span>Nhóm giá</span>{canReadFinance && <><span className="hx-num">Nợ hiện tại</span><span className="hx-num">Hạn mức</span></>}<span>Trạng thái</span></div>
          {rows.length === 0 ? <div className="hx-empty" role="status"><p>Không có khách hàng phù hợp.</p></div> : rows.map((row) => {
            const href = `/admin/customers/${row.id}`;
            return <div className="hx-row" key={row.id}><div className="hx-tr" style={{ gridTemplateColumns: columns }}>
              {canManage && <span><BulkRowCheckbox id={row.id} label={`${row.code} ${row.name}`} /></span>}
              <Link href={href} className="hx-code" tabIndex={-1}>{row.code}</Link>
              <Link href={href}><AxPerson name={row.name} sub={row.typeLabel} /></Link>
              <span>{row.phone ?? "Chưa có"}</span><span>{row.tierName}</span>
              {canReadFinance && <><span className="hx-num">{row.debt === null ? "—" : row.debtPositive ? <b>{row.debt}</b> : row.debt}</span><span className="hx-num">{row.limit ?? "Chưa duyệt"}</span></>}
              <span><AxStatus tone={toneOf(row.active ? "success" : "danger")}>{row.active ? "Đang hoạt động" : "Ngừng giao dịch"}</AxStatus></span>
            </div></div>;
          })}
          {canReadFinance && !debtComplete && <p className="hx-muted" style={{ padding: "8px 16px" }}>Chưa tải đủ công nợ để hiển thị cột “Nợ hiện tại”. Xem tại Công nợ phải thu.</p>}
          <ListPager page={page} total={total} params={{ q: query.q, state: query.state, tier: query.tier || undefined, type: query.type || undefined }} />
        </section>
      </BulkSelection>
    </div>
  </>;
}
