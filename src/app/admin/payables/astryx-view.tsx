import Decimal from "decimal.js";
import Link from "next/link";
import type { ReactNode } from "react";
import { AxButtonLink, AxFilterRadios, AxPageHead, AxPerson, AxStatus } from "@/components/astryx/ax-kit";
import { AxEmpty, AxGrid, AxKpi } from "@/components/astryx/fin-kit";
import { AxDebtTabs } from "@/components/astryx/fin-tabs";
import { ListPager } from "@/components/ui/list-pager";
import { formatBusinessDate } from "@/lib/core/business-time";
import { formatVnd, vnd } from "@/lib/core/money";

export type AxPayableRow = { id: string; supplier_id: string; supplier_name: string; source_label: string; original_amount_vnd: string; outstanding_amount_vnd: string; due_date: string; recorded_at: string; state: string };

const TEMPLATE = "minmax(0,1.4fr) minmax(0,1.2fr) 110px 110px 140px 150px 150px";

/**
 * Công nợ phải trả kiểu Astryx. Bảng, tab và bộ lọc dựng lại; khối nhà cung cấp đang chọn (ghi chi, phân bổ phiếu tiền đã có)
 * là biểu mẫu có server action của Classic, truyền vào `children` và giữ nguyên.
 */
export function AstryxPayablesView({ rows, supplierId, selectedName, q, state, page, hasNext, permissions, notice, children }: {
  rows: AxPayableRow[]; supplierId?: string; selectedName?: string; q: string; state: string; page: number; hasNext: boolean; permissions: { has: (permission: string) => boolean };
  notice: ReactNode; children: ReactNode;
}) {
  const href = (value: string) => {
    const params = new URLSearchParams();
    if (value) params.set("state", value);
    if (q) params.set("q", q);
    if (supplierId) params.set("supplier", supplierId);
    const text = params.toString();
    return text ? `/admin/payables?${text}` : "/admin/payables";
  };
  const total = rows.reduce((sum, row) => sum.plus(row.outstanding_amount_vnd), new Decimal(0));
  const overdue = rows.filter((row) => row.state === "OVERDUE");
  const overdueTotal = overdue.reduce((sum, row) => sum.plus(row.outstanding_amount_vnd), new Decimal(0));
  const isFiltered = Boolean(q || state || supplierId);
  return <>
    <AxPageHead crumbs={["Tài chính", "Công nợ", "Phải trả"]} title="Công nợ phải trả" actions={<><AxButtonLink href="/admin/expenses">Chi phí</AxButtonLink><AxButtonLink href="/admin/cashbook">Sổ tiền</AxButtonLink></>} />
    <AxDebtTabs active="/admin/payables" permissions={permissions} />
    {notice}
    <div className="fk-kpis">
      <AxKpi lead tone="b" label="Còn phải trả trên trang này" value={formatVnd(vnd(total.toFixed(0)))} note={`${rows.length} khoản còn dư · chỉ tính phần đã nhận hàng`} />
      <AxKpi tone="r" label="Quá hạn trên trang này" value={formatVnd(vnd(overdueTotal.toFixed(0)))} note={`${overdue.length} khoản`} />
    </div>
    {supplierId && <p className="hx-card hx-pad" role="status" style={{ marginBottom: 16 }}>Đang xem công nợ của <b>{selectedName ?? "nhà cung cấp đã chọn"}</b>. <Link className="hx-code" href="/admin/payables">Xem tất cả nhà cung cấp</Link></p>}
    {supplierId && <div style={{ display: "grid", gap: 16, marginBottom: 16 }}>{children}</div>}
    <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
      <div className="hx-side">
        <form method="get" action="/admin/payables" className="hx-card hx-pad" aria-label="Bộ lọc phải trả" style={{ display: "grid", gap: 12 }}>
          {supplierId && <input type="hidden" name="supplier" value={supplierId} />}{state && <input type="hidden" name="state" value={state} />}
          <label className="hx-label">Tìm kiếm<input className="hx-in" type="search" name="q" defaultValue={q} placeholder="Nhà cung cấp, nguồn" style={{ width: "100%" }} /></label>
          <button type="submit" className="hx-btn p">Lọc</button>
          {isFiltered && <Link href="/admin/payables" style={{ color: "var(--hx-blue-t)", fontWeight: 600 }}>Xóa lọc</Link>}
        </form>
        <AxFilterRadios title="Trạng thái" options={[{ href: href(""), label: "Tất cả còn dư", active: state === "" }, { href: href("OVERDUE"), label: "Quá hạn", active: state === "OVERDUE", dot: "#B4291F" }]} />
      </div>
      <section className="hx-card" style={{ flex: 1, minWidth: 0, overflow: "hidden", boxShadow: "var(--sh-2)" }} aria-label="Các khoản phải trả">
        {rows.length === 0 ? <AxEmpty title="Không có khoản phải trả phù hợp." />
          : <AxGrid label="Các khoản phải trả" template={TEMPLATE} minWidth={980} num={[4, 5]} heads={["Nhà cung cấp", "Nguồn", "Phát sinh", "Hạn", "Gốc", "Còn lại", "Thao tác"]}
            rows={rows.map((item) => ({ key: item.id, cells: [
              <AxPerson key="c" name={item.supplier_name} />, <span key="s">{item.source_label}</span>,
              <span key="r">{formatBusinessDate(item.recorded_at)}</span>, <span key="d">{formatBusinessDate(item.due_date)}</span>, <span key="o">{formatVnd(vnd(item.original_amount_vnd))}</span>,
              <span key="a" style={{ display: "grid", justifyItems: "end", gap: 2 }}><b className={item.state === "OVERDUE" ? "fk-neg" : undefined}>{formatVnd(vnd(item.outstanding_amount_vnd))}</b>
                <AxStatus tone={item.state === "OVERDUE" ? "error" : "success"}>{item.state === "OVERDUE" ? "Quá hạn" : "Còn hạn"}</AxStatus></span>,
              <span key="x" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><Link className="hx-code" href={`/admin/payables/${item.id}`}>Chi tiết</Link><Link className="hx-code" href={`/admin/payables?supplier=${item.supplier_id}`}>Ghi chi</Link></span>,
            ] }))} />}
        <div style={{ padding: "0 16px" }}><ListPager page={page} hasNext={hasNext} params={{ q: q || undefined, state: state || undefined, supplier: supplierId }} /></div>
      </section>
    </div>
  </>;
}
