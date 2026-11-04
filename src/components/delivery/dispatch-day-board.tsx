import Link from "next/link";
import { randomUUID } from "node:crypto";
import { StatusBadge } from "@/components/ui/status-badge";
import { autoDispatchDayAction } from "@/modules/delivery/dispatch-actions";
import { DispatchWaitingTable, type AssignOption } from "./dispatch-waiting-table";
import { deliveryStateLabel, deliveryStateTone } from "@/modules/delivery/presentation";

export type DispatchDay = {
  mode: "OFF" | "SUGGEST" | "AUTO";
  drivers: { employee_id: string; name: string; vehicles: { id: string; code: string; plate: string }[];
    deliveries: { id: string; number: string; customer: string; site: string; state: string; start: string | null; end: string | null; vehicle: string | null }[] }[];
  waiting: { id: string; number: string; customer: string; site: string; start: string | null; proposal: { reason: string; start: string } | null; declined: string | null }[];
};

const time = (value: string | null) => value ? new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value)) : "—";
const modeLabel = { AUTO: "Tự động", SUGGEST: "Gợi ý", OFF: "Tắt" } as const;

/** Choices for "Gán" on a waiting delivery: people who may take delivery work, trucks, and each delivery's version. */
export type DispatchAssignOptions = { drivers: AssignOption[]; vehicles: AssignOption[]; versions: Record<string, number>; stopMinutes: number };

/**
 * D22: the day by driver (timeline of deliveries), what still waits for a truck, and "Tự chia việc". The waiting
 * deliveries are a compact table that scrolls inside its box, beside the drivers on a wide screen.
 */
export function DispatchDayBoard({ day, board, canAssign, notice, error, assign }: { day: string; board: DispatchDay; canAssign: boolean; notice?: string; error?: string; assign?: DispatchAssignOptions }) {
  return <section className="card card-pad dispatch-day" aria-labelledby="dispatch-day-title">
    <div className="section-head flush"><h2 id="dispatch-day-title">Lịch giao theo tài xế</h2>
      <form className="inline-actions" action="/admin/dispatch" method="get"><label className="sr-only" htmlFor="dispatch-day">Ngày</label>
        <input id="dispatch-day" name="day" type="date" defaultValue={day} /><button className="button button-secondary" type="submit">Xem ngày</button></form></div>
    <p className="muted">Tự điều phối: <strong>{modeLabel[board.mode]}</strong> (Cài đặt → Vận hành giao hàng). Xe cần có “Tài xế mặc định” để được tự chia.</p>
    {notice && <p className="form-message success" role="status">{notice}</p>}
    {error && <p className="form-message" role="alert">{error}</p>}
    <div className="dispatch-day-columns">
    <div className="dispatch-waiting" id="dispatch-waiting">
      <div className="section-head flush"><h3>Chờ điều phối ({board.waiting.length})</h3>
        {canAssign && board.waiting.length > 0 && <form action={autoDispatchDayAction}><input type="hidden" name="day" value={day} />
          <input type="hidden" name="operationId" value={randomUUID()} /><button className="button button-primary button-compact" type="submit">Tự chia việc</button></form>}</div>
      {board.waiting.length === 0 ? <p className="muted">Không có phiếu chờ điều phối.</p>
        : <DispatchWaitingTable day={day} canAssign={canAssign} drivers={assign?.drivers ?? []} vehicles={assign?.vehicles ?? []} stopMinutes={assign?.stopMinutes ?? 60}
          rows={board.waiting.map((item) => ({ ...item, version: assign?.versions[item.id] ?? null, assignOperationId: randomUUID(), proposalOperationId: randomUUID() }))} />}
    </div>
    {board.drivers.length === 0 ? <p className="muted">Chưa có tài xế nào trong lịch. Khai báo “Tài xế mặc định” cho xe trong danh mục Xe để tự chia việc; vẫn có thể bấm “Gán” ở phiếu chờ để phân tay.</p> : <div className="dispatch-drivers">
      {board.drivers.map((driver) => <article className="dispatch-driver" key={driver.employee_id}>
        <header><strong>{driver.name}</strong><small>{driver.vehicles.map((vehicle) => vehicle.plate).join(", ") || "Chưa gắn xe"} · {driver.deliveries.length} phiếu</small></header>
        {driver.deliveries.length === 0 ? <p className="muted">Rảnh cả ngày.</p> : <ol className="dispatch-timeline">
          {driver.deliveries.map((item) => <li key={item.id}><span className="mono">{time(item.start)}–{time(item.end)}</span>
            <Link className="code-link mono" href={`/admin/deliveries/${item.id}`}>{item.number}</Link><span>{item.customer} · {item.site}</span>
            <StatusBadge tone={deliveryStateTone(item.state)}>{deliveryStateLabel(item.state)}</StatusBadge></li>)}</ol>}
      </article>)}
    </div>}
    </div>
  </section>;
}
