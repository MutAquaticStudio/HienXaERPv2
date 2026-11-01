"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { applyDispatchProposalAction, quickAssignDeliveryAction } from "@/modules/delivery/dispatch-actions";

export type WaitingDelivery = { id: string; number: string; customer: string; site: string; start: string | null; version: number | null;
  proposal: { reason: string; start: string } | null; declined: string | null;
  /** Made on the server so the page and the browser agree on them. */
  assignOperationId: string; proposalOperationId: string };
export type AssignOption = { id: string; label: string };

const HOUR = 60 * 60 * 1000;
/** ISO time → value of a datetime-local input in Vietnam time (UTC+7, no daylight saving). */
const localValue = (iso: string) => new Date(Date.parse(iso) + 7 * HOUR).toISOString().slice(0, 16);
const time = (value: string | null) => value ? new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value)) : "Chưa hẹn giờ";
const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

/**
 * Deliveries still without a driver, as a compact table that scrolls inside its box: search by code, customer or site,
 * apply a suggestion, or "Gán" a driver + truck + time right on the row (same assignment command and checks).
 */
export function DispatchWaitingTable({ day, rows, canAssign, drivers, vehicles, stopMinutes }: {
  day: string; rows: readonly WaitingDelivery[]; canAssign: boolean; drivers: readonly AssignOption[]; vehicles: readonly AssignOption[]; stopMinutes: number;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const shown = useMemo(() => {
    const needle = fold(query.trim());
    return needle ? rows.filter((row) => fold(`${row.number} ${row.customer} ${row.site}`).includes(needle)) : rows;
  }, [query, rows]);
  const canQuickAssign = canAssign && drivers.length > 0 && vehicles.length > 0;
  const columns = canAssign ? 4 : 3;

  return <div className="dispatch-waiting-body">
    {rows.length > 5 && <label className="dispatch-waiting-search"><span className="sr-only">Tìm phiếu chờ</span>
      <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm mã phiếu, khách, công trình" /></label>}
    <div className="dispatch-waiting-scroll">
      <table className="dispatch-waiting-table">
        <thead><tr><th>Phiếu</th><th>Khách / công trình</th><th>Giờ hẹn</th>{canAssign && <th><span className="sr-only">Thao tác</span></th>}</tr></thead>
        <tbody>{shown.map((row) => {
          const start = row.proposal?.start ?? row.start ?? `${day}T01:00:00.000Z`;
          const end = new Date(Date.parse(start) + stopMinutes * 60 * 1000).toISOString();
          return <Fragment key={row.id}>
            <tr>
              <td><Link className="code-link mono" href={`/admin/deliveries/${row.id}`}>{row.number}</Link></td>
              <td><strong>{row.customer}</strong><small className="table-subline">{row.site}</small>
                {row.declined && <small className="table-subline field-error">Thợ đã từ chối: {row.declined}</small>}
                {row.proposal && <small className="table-subline">Gợi ý: {row.proposal.reason}</small>}</td>
              <td className="mono">{time(row.start)}</td>
              {canAssign && <td className="dispatch-waiting-actions">
                {row.proposal && <form action={applyDispatchProposalAction}><input type="hidden" name="deliveryId" value={row.id} /><input type="hidden" name="day" value={day} />
                  <input type="hidden" name="operationId" value={row.proposalOperationId} /><button className="button button-secondary button-compact" type="submit">Áp dụng gợi ý</button></form>}
                {canQuickAssign && row.version !== null && <button type="button" className="button button-primary button-compact" aria-expanded={open === row.id}
                  aria-controls={`assign-${row.id}`} onClick={() => setOpen(open === row.id ? null : row.id)}>{open === row.id ? "Đóng" : "Gán"}</button>}
              </td>}
            </tr>
            {open === row.id && <tr className="dispatch-assign-row" id={`assign-${row.id}`}><td colSpan={columns}>
              <form className="dispatch-assign-form" action={quickAssignDeliveryAction} aria-label={`Gán người và xe cho ${row.number}`}>
                <input type="hidden" name="deliveryId" value={row.id} /><input type="hidden" name="version" value={row.version ?? ""} />
                <input type="hidden" name="day" value={day} /><input type="hidden" name="operationId" value={row.assignOperationId} />
                <label>Người giao<select name="employeeId" required defaultValue=""><option value="">Chọn người</option>{drivers.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
                <label>Xe<select name="vehicleId" required defaultValue=""><option value="">Chọn xe</option>{vehicles.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
                <label>Bắt đầu<input type="datetime-local" name="scheduledStart" required defaultValue={localValue(start)} /></label>
                <label>Kết thúc<input type="datetime-local" name="scheduledEnd" required defaultValue={localValue(end)} /></label>
                <button className="button button-primary button-compact" type="submit">Phân giao</button>
              </form>
            </td></tr>}
          </Fragment>;
        })}</tbody>
      </table>
      {shown.length === 0 && <p className="muted card-pad">Không có phiếu khớp “{query}”.</p>}
    </div>
    {canAssign && !canQuickAssign && <p className="muted">Chưa gán nhanh được: cần ít nhất một người giao (vai trò Thợ &amp; tài xế) và một xe đang dùng.</p>}
  </div>;
}
