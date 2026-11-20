import Link from "next/link";
import type { ReactNode } from "react";
import { AxButtonLink, AxPageHead, AxStatus, toneOf } from "@/components/astryx/ax-kit";
import { AxCard, AxSearch } from "@/components/astryx/fin-kit";
import { deliveryStateLabel, deliveryStateTone } from "@/modules/delivery/presentation";

export type AxDispatchTicket = { id: string; delivery_number: string; customer_name_snapshot: string; site_name_snapshot: string; execution_state: string };
export type AxDispatchColumn = { title: string; bucket: string; rows: AxDispatchTicket[]; hasNext: boolean; page: number; prevHref: string | null; nextHref: string | null;
  /** Số phiếu đã hiện ở khung "Chờ điều phối" phía trên (chỉ cột Chờ phân giao, khi không tìm kiếm). */
  shownAbove: number };

const BAR: Record<string, string> = { planned: "#E8890C", assigned: "#0B63C6", active: "#0E8A9A", exception: "#B4291F" };

/**
 * Điều phối giao hàng kiểu Astryx: lịch theo tài xế (thành phần chức năng của Classic, có "Gán" / "Tự chia việc"),
 * bốn cột Kanban đúng cột của app (Chờ phân giao, Đã phân giao, Đang thực hiện, Ngoại lệ), bản đồ vị trí.
 */
export function AstryxDispatchView({ columns, q, dayBoard, fleetMap, canManage, canAssign, waitingCount }: {
  columns: AxDispatchColumn[]; q: string; dayBoard: ReactNode; fleetMap: ReactNode; canManage: boolean; canAssign: boolean; waitingCount: number;
}) {
  return <>
    <AxPageHead crumbs={["Giao hàng", "Điều phối"]} title="Điều phối giao hàng"
      actions={<>{canManage && <><AxButtonLink href="/admin/dispatch/resources?kind=vehicles">Xe</AxButtonLink><AxButtonLink href="/admin/dispatch/resources?kind=machines">Máy / thiết bị</AxButtonLink></>}
        {canAssign && waitingCount > 0 && <AxButtonLink href="#dispatch-waiting" kind="primary">Gán nhanh</AxButtonLink>}</>} />
    <div style={{ display: "grid", gap: 16 }}>
      {dayBoard}
      {fleetMap}
      <AxCard label="Tìm phiếu trên bảng phân giao"><AxSearch action="/admin/dispatch" q={q} placeholder="Mã phiếu, khách hàng, công trình" /></AxCard>
      <section className="fk-kanban" aria-label="Bảng phân giao">{columns.map((column) => {
        const rows = column.rows;
        return <div className="fk-kcol" key={column.bucket}>
          <div className="fk-khead"><span className="hx-dot" style={{ background: BAR[column.bucket] ?? "#8493A8", width: 10, height: 10 }} /><h2>{column.title}</h2><span className="n">{rows.length}{column.hasNext ? "+" : ""}</span></div>
          {column.shownAbove > 0 && <a className="fk-note" href="#dispatch-waiting" style={{ color: "var(--hx-blue-t)", fontWeight: 600 }}>{column.shownAbove} phiếu cần giao đến hôm nay ở khung “Chờ điều phối” phía trên</a>}
          {rows.map((row) => <Link className="fk-ticket" href={`/admin/deliveries/${row.id}`} key={row.id}>
            <b className="hx-code">{row.delivery_number}</b><span style={{ fontWeight: 600 }}>{row.customer_name_snapshot}</span><small>{row.site_name_snapshot}</small>
            <span><AxStatus tone={toneOf(deliveryStateTone(row.execution_state))}>{deliveryStateLabel(row.execution_state)}</AxStatus></span></Link>)}
          {rows.length === 0 && column.shownAbove === 0 && <p className="fk-note">Không có phiếu.</p>}
          <nav aria-label={`Phân trang ${column.title}`} style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
            <span className="fk-note">Trang {column.page}</span>
            <span style={{ display: "flex", gap: 8 }}>{column.prevHref && <AxButtonLink href={column.prevHref} small>Trước</AxButtonLink>}{column.nextHref && <AxButtonLink href={column.nextHref} small>Tiếp</AxButtonLink>}</span></nav>
        </div>;
      })}</section>
    </div>
  </>;
}
