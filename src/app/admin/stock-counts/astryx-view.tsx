import Link from "next/link";
import type { ReactNode } from "react";
import { ActionNotice } from "@/components/sales/action-notice";
import { AxButtonLink, AxPageHead, AxStatus } from "@/components/astryx/ax-kit";
import { AxField, AxFilters, AxSelectField, AxTable } from "@/components/astryx/buystock-kit";
import { ListPager } from "@/components/ui/list-pager";

export type AxCountRow = { id: string; number: string; warehouse: string; cutoff: string; lineCount: number; up: number; down: number; stateLabel: string; tone: "success" | "warning" | "info" | "danger" };

/** Danh sách phiếu kiểm kho kiểu Astryx; nút "Tạo phiếu kiểm" là thành phần Classic hiện có (`openButton`). */
export function AstryxStockCountsView({ rows, total, page, query, state, warehouse, warehouses, states, openButton, notice, error }: {
  rows: AxCountRow[]; total: number; page: number; query: string; state: string; warehouse: string; warehouses: { id: string; name: string }[]; states: { value: string; label: string }[];
  openButton: ReactNode; notice?: string; error?: string;
}) {
  const filtered = Boolean(query || state || warehouse);
  return <>
    <AxPageHead crumbs={["Kho hàng", "Kiểm kho"]} title="Kiểm kho" actions={<><AxButtonLink href="/admin/inventory">Tồn kho</AxButtonLink>{openButton}</>} />
    <ActionNotice notice={notice} error={error} />
    <div className="bs-layout">
      <div className="hx-side">
        <AxFilters action="/admin/stock-counts" label="Bộ lọc phiếu kiểm" showClear={filtered} clearHref="/admin/stock-counts">
          <AxField label="Tìm kiếm" name="q" type="search" defaultValue={query} placeholder="Mã phiếu" />
          <AxSelectField label="Kho" name="warehouse" defaultValue={warehouse} options={[{ value: "", label: "Tất cả kho" }, ...warehouses.map((row) => ({ value: row.id, label: row.name }))]} />
          <AxSelectField label="Trạng thái" name="state" defaultValue={state} options={[{ value: "", label: "Tất cả" }, ...states]} />
        </AxFilters>
      </div>
      <div className="bs-main">
        <div className="hx-ch" style={{ padding: "0 0 12px" }}><b className="hx-sec">{total} phiếu kiểm</b></div>
        <AxTable label="Danh sách phiếu kiểm kho" heads={["Mã phiếu", "Kho", "Chốt sổ lúc", { label: "Đã đếm", num: true }, { label: "Lệch tăng", num: true }, { label: "Lệch giảm", num: true }, "Trạng thái"]}
          empty={rows.length === 0 ? <p>{filtered ? "Không có phiếu kiểm phù hợp." : "Chưa có phiếu kiểm. Bấm “+ Tạo phiếu kiểm” để bắt đầu."}</p> : undefined}>
          {rows.map((row) => <tr key={row.id}>
            <td><Link className="hx-code" href={`/admin/stock-counts/${row.id}`}>{row.number}</Link></td><td>{row.warehouse}</td><td>{row.cutoff}</td>
            <td className="hx-num">{row.lineCount}</td><td className="hx-num">{row.up || "—"}</td><td className="hx-num">{row.down || "—"}</td>
            <td><AxStatus tone={row.tone}>{row.stateLabel}</AxStatus></td></tr>)}
        </AxTable>
        <ListPager page={page} total={total} params={{ q: query || undefined, state: state || undefined, warehouse: warehouse || undefined }} />
      </div>
    </div>
  </>;
}
