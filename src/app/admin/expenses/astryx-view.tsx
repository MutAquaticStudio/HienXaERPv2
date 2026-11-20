import type { ReactNode } from "react";
import { AxPageHead, AxStatus } from "@/components/astryx/ax-kit";
import { AxCard, AxEmpty, AxGrid, AxSearch, AxTabLinks } from "@/components/astryx/fin-kit";
import { ListPager } from "@/components/ui/list-pager";

export type AxExpenseRow = { id: string; number: string; dateText: string; category: string; description: string; payee: string; settlementText: string; activity: string; sourceText: string | null; amountText: string; approved: boolean; approve: ReactNode };

/**
 * Chi phí vận hành kiểu Astryx: tab Tất cả | Chờ duyệt | Đã duyệt, tìm kiếm, bảng. Hộp thoại "Ghi chi phí", "Nhóm chi phí" và "Duyệt"
 * (biểu mẫu có server action của Classic) được truyền vào dưới dạng `ReactNode`.
 */
export function AstryxExpensesView({ notice, actions, tabs, q, state, focusId, pinned, visibleCount, page, total, hasNext, rows }: {
  notice: ReactNode; actions: ReactNode; tabs: { href: string; label: string; count?: string | number; active: boolean }[]; q: string; state: string; focusId?: string; pinned: boolean;
  visibleCount: number; page: number; total?: number; hasNext: boolean; rows: AxExpenseRow[];
}) {
  return <>
    <AxPageHead crumbs={["Tài chính", "Chi phí"]} title="Chi phí vận hành" actions={actions} />
    {notice}
    <AxTabLinks label="Trạng thái chi phí" items={tabs} />
    <AxCard label="Tìm chi phí" style={{ marginBottom: 16 }}><AxSearch action="/admin/expenses" q={q} placeholder="Mã, loại chi, người nhận, ghi chú" hidden={{ state }} /></AxCard>
    <AxCard title={`${visibleCount} khoản chi phí trên trang này${pinned ? " + 1 khoản được ghim" : ""}`} label="Danh sách chi phí" flush right={<span className="hx-muted">Chỉ tính chi phí đã duyệt</span>}>
      {rows.length === 0 ? <AxEmpty title="Chưa có chi phí." />
        : <AxGrid label="Danh sách chi phí" template="130px 110px minmax(0,1.5fr) minmax(0,1.3fr) minmax(0,1fr) 140px 120px 110px" num={[5]} minWidth={1100}
          heads={["Mã", "Ngày", "Loại chi / ghi chú", "Người nhận", "Phạm vi", "Số tiền", "Trạng thái", "Thao tác"]}
          rows={rows.map((item) => ({ key: item.id, selected: focusId === item.id, cells: [
            <span key="n"><b className="hx-code">{item.number}</b>{focusId === item.id && <small className="hx-sub" style={{ display: "block" }}>Được ghim</small>}</span>,
            item.dateText,
            <span key="c">{item.category}<small className="hx-sub" style={{ display: "block" }}>{item.description}</small></span>,
            <span key="p">{item.payee}<small className="hx-sub" style={{ display: "block" }}>{item.settlementText}</small></span>,
            <span key="a">{item.activity}{item.sourceText && <small className="hx-sub" style={{ display: "block" }}>{item.sourceText}</small>}</span>,
            <b key="m">{item.amountText}</b>,
            <AxStatus key="s" tone={item.approved ? "success" : "warning"}>{item.approved ? "Đã duyệt" : "Chờ duyệt"}</AxStatus>,
            item.approve] }))} />}
      <div style={{ padding: "0 16px" }}><ListPager page={page} total={total} hasNext={hasNext} params={{ q: q || undefined, state: state || undefined }} /></div>
    </AxCard>
  </>;
}
