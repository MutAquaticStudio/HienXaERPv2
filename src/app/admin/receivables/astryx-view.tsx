import Link from "next/link";
import type { ReactNode } from "react";
import { AxButtonLink, AxFilterRadios, AxPageHead, AxPerson, AxStatus } from "@/components/astryx/ax-kit";
import { AxEmpty, AxGrid, AxKpi } from "@/components/astryx/fin-kit";
import { AxDebtTabs } from "@/components/astryx/fin-tabs";
import { ListPager } from "@/components/ui/list-pager";
import { formatBusinessDate } from "@/lib/core/business-time";
import { formatVnd, vnd } from "@/lib/core/money";
import Decimal from "decimal.js";

export type AxReceivableRow = { id: string; customer_id: string; customer_name: string; site_name: string | null; source_label: string; original_amount_vnd: string; outstanding_amount_vnd: string; due_date: string; recorded_at: string; state: string };

const TEMPLATE = "minmax(0,1.5fr) minmax(0,1.2fr) 110px 110px 140px 150px 170px";

/**
 * Công nợ phải thu kiểu Astryx. Bảng, tab và bộ lọc dựng lại; khối khách đang chọn (ghi thu, phân bổ phiếu tiền đã có, khoản có/hàng trả)
 * là biểu mẫu có server action của Classic, truyền vào `children` và giữ nguyên để không đổi nghiệp vụ thu tiền.
 */
export function AstryxReceivablesView({ rows, customerId, selectedName, q, state, page, hasNext, permissions, notice, children }: {
  rows: AxReceivableRow[]; customerId?: string; selectedName?: string; q: string; state: string; page: number; hasNext: boolean; permissions: { has: (permission: string) => boolean };
  notice: ReactNode; children: ReactNode;
}) {
  const href = (value: string) => {
    const params = new URLSearchParams();
    if (value) params.set("state", value);
    if (q) params.set("q", q);
    if (customerId) params.set("customer", customerId);
    const text = params.toString();
    return text ? `/admin/receivables?${text}` : "/admin/receivables";
  };
  const pageTotal = rows.reduce((sum, row) => sum.plus(row.outstanding_amount_vnd), new Decimal(0));
  const overdue = rows.filter((row) => row.state === "OVERDUE");
  const overdueTotal = overdue.reduce((sum, row) => sum.plus(row.outstanding_amount_vnd), new Decimal(0));
  const isFiltered = Boolean(q || state || customerId);
  return <>
    <AxPageHead crumbs={["Tài chính", "Công nợ", "Phải thu"]} title="Công nợ phải thu" actions={<AxButtonLink href="/admin/cashbook">Mở sổ quỹ</AxButtonLink>} />
    <AxDebtTabs active="/admin/receivables" permissions={permissions} />
    {notice}
    <div className="fk-kpis">
      <AxKpi lead tone="b" label="Còn phải thu trên trang này" value={formatVnd(vnd(pageTotal.toFixed(0)))} note={`${rows.length} khoản còn dư`} />
      <AxKpi tone="r" label="Quá hạn trên trang này" value={formatVnd(vnd(overdueTotal.toFixed(0)))} note={`${overdue.length} khoản`} />
    </div>
    {customerId && <p className="hx-card hx-pad" role="status" style={{ marginBottom: 16 }}>Đang xem công nợ của <b>{selectedName ?? "khách hàng đã chọn"}</b>. <Link className="hx-code" href="/admin/receivables">Xem tất cả khách</Link></p>}
    {customerId && <div style={{ display: "grid", gap: 16, marginBottom: 16 }}>{children}</div>}
    <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
      <div className="hx-side">
        <form method="get" action="/admin/receivables" className="hx-card hx-pad" aria-label="Bộ lọc phải thu" style={{ display: "grid", gap: 12 }}>
          {customerId && <input type="hidden" name="customer" value={customerId} />}{state && <input type="hidden" name="state" value={state} />}
          <label className="hx-label">Tìm kiếm<input className="hx-in" type="search" name="q" defaultValue={q} placeholder="Khách, công trình, nguồn" style={{ width: "100%" }} /></label>
          <button type="submit" className="hx-btn p">Lọc</button>
          {isFiltered && <Link href="/admin/receivables" style={{ color: "var(--hx-blue-t)", fontWeight: 600 }}>Xóa lọc</Link>}
        </form>
        <AxFilterRadios title="Trạng thái" options={[{ href: href(""), label: "Tất cả còn dư", active: state === "" }, { href: href("OVERDUE"), label: "Quá hạn", active: state === "OVERDUE", dot: "#B4291F" }]} />
      </div>
      <section className="hx-card" style={{ flex: 1, minWidth: 0, overflow: "hidden", boxShadow: "var(--sh-2)" }} aria-label="Các khoản phải thu">
        {rows.length === 0 ? <AxEmpty title="Không có khoản phải thu phù hợp." />
          : <AxGrid label="Các khoản phải thu" template={TEMPLATE} minWidth={980} num={[4, 5]} heads={["Khách / công trình", "Nguồn", "Phát sinh", "Hạn", "Gốc", "Còn lại", "Thao tác"]}
            rows={rows.map((item) => ({ key: item.id, cells: [
              <AxPerson key="c" name={item.customer_name} sub={item.site_name ?? "Chưa gắn công trình"} />,
              <span key="s">{item.source_label}</span>, <span key="r">{formatBusinessDate(item.recorded_at)}</span>, <span key="d">{formatBusinessDate(item.due_date)}</span>,
              <span key="o">{formatVnd(vnd(item.original_amount_vnd))}</span>,
              <span key="a" style={{ display: "grid", justifyItems: "end", gap: 2 }}><b className={item.state === "OVERDUE" ? "fk-neg" : undefined}>{formatVnd(vnd(item.outstanding_amount_vnd))}</b>
                <AxStatus tone={item.state === "OVERDUE" ? "error" : "success"}>{item.state === "OVERDUE" ? "Quá hạn" : "Còn hạn"}</AxStatus></span>,
              <span key="x" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><Link className="hx-code" href={`/admin/receivables/${item.id}`}>Chi tiết</Link><Link className="hx-code" href={`/admin/receivables?customer=${item.customer_id}`}>Ghi thu</Link></span>,
            ] }))} />}
        <div style={{ padding: "0 16px" }}><ListPager page={page} hasNext={hasNext} params={{ q: q || undefined, state: state || undefined, customer: customerId }} /></div>
      </section>
    </div>
  </>;
}

