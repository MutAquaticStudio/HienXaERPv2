"use client";

import Link from "next/link";
import { useActionState, useMemo, useRef, useState } from "react";
import { parseBusinessDateTime } from "@/lib/core/business-time";
import { applyRoutePlanAction, createRoutePlanAction, type RouteActionState } from "@/modules/routing/actions";
import { businessDateKey, windowLabel } from "@/modules/routing/presentation";
import { effectiveWindow, overlappingIndexes, parseStopMinutes, STOP_MINUTES_MAX, STOP_MINUTES_MIN, STOP_MINUTES_SUGGESTED, stopWindows } from "@/modules/routing/stop-schedule";

type DeliveryOption = { id: string; delivery_number: string; site_name_snapshot: string; delivery_address_snapshot: string; scheduled_at: string | null; scheduled_end_at?: string | null };
type VehicleOption = { id: string; plate_number: string };
type EmployeeOption = { id: string; display_name: string };

const initialState: RouteActionState = { status: "idle", message: "" };

/**
 * Lập lộ trình in three steps (FB2 Đợt 7): pick deliveries of a day, then vehicle, driver and departure, then check the
 * order with each stop's expected time. A delivery without a schedule takes its stop time when the route is applied.
 */
export function RoutePlanForm({ deliveries, vehicles, employees }: { deliveries: DeliveryOption[]; vehicles: VehicleOption[]; employees: EmployeeOption[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [day, setDay] = useState("");
  const [departure, setDeparture] = useState("");
  const [minutes, setMinutes] = useState(String(STOP_MINUTES_SUGGESTED));
  const [state, action, pending] = useActionState(createRoutePlanAction, initialState);
  const operationId = useRef<string | null>(null);
  const departureIso = departure ? parseBusinessDateTime(departure) ?? "" : "";
  const stopMinutes = parseStopMinutes(minutes);
  const shown = deliveries.filter((delivery) => !day || !delivery.scheduled_at || businessDateKey(delivery.scheduled_at) === day || selected.includes(delivery.id));
  const ordered = selected.map((id) => deliveries.find((row) => row.id === id)).filter((row): row is DeliveryOption => !!row);
  const windows = useMemo(() => departureIso && stopMinutes ? stopWindows(departureIso, stopMinutes, ordered.length) : [], [departureIso, stopMinutes, ordered.length]);
  const overlaps = overlappingIndexes(ordered.map((delivery, index) => effectiveWindow(delivery.scheduled_at, delivery.scheduled_end_at ?? null, windows[index] ?? null)));

  function move(id: string, direction: -1 | 1) {
    setSelected((current) => {
      const next = [...current];
      const index = next.indexOf(id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= next.length) return next;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  return (
    <form action={action} className="form-stack route-plan-form" onSubmit={(event) => {
      operationId.current ??= crypto.randomUUID();
      (event.currentTarget.elements.namedItem("operation_id") as HTMLInputElement).value = operationId.current;
    }}>
      <fieldset className="route-step">
        <legend><span className="route-step-number">1</span> Chọn phiếu giao</legend>
        <div className="form-grid">
          <label className="field"><span>Ngày giao</span><input type="date" value={day} onChange={(event) => setDay(event.target.value)} /></label>
          <p className="muted route-step-note">Hiện phiếu có lịch trong ngày và phiếu chưa có lịch. Đã chọn {selected.length} phiếu.</p>
        </div>
        <div className="table-wrap"><table className="route-delivery-table"><thead><tr><th scope="col">Chọn</th><th scope="col">Phiếu giao</th><th scope="col">Công trình</th><th scope="col">Lịch giao</th></tr></thead><tbody>
          {shown.map((delivery) => <tr key={delivery.id}>
            <td data-label="Chọn"><input type="checkbox" aria-label={`Chọn ${delivery.delivery_number}`} checked={selected.includes(delivery.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, delivery.id] : current.filter((id) => id !== delivery.id))} /></td>
            <td data-label="Phiếu giao"><strong>{delivery.delivery_number}</strong></td>
            <td data-label="Công trình">{delivery.site_name_snapshot}<small className="table-subline">{delivery.delivery_address_snapshot}</small></td>
            <td data-label="Lịch giao">{delivery.scheduled_at ? windowLabel(delivery.scheduled_at, delivery.scheduled_end_at ?? null) : <span className="muted">Chưa có lịch</span>}</td>
          </tr>)}
        </tbody></table>{!shown.length && <p className="empty-inline">Không có phiếu giao chờ xếp xe trong ngày này.</p>}</div>
      </fieldset>

      <fieldset className="route-step">
        <legend><span className="route-step-number">2</span> Xe, tài xế và giờ đi</legend>
        <div className="form-grid">
          <label className="field"><span>Giờ khởi hành thực tế (giờ địa phương)</span><input type="datetime-local" value={departure} onChange={(event) => setDeparture(event.target.value)} required /></label>
          <label className="field"><span>Xe</span><select name="vehicle_id" required defaultValue=""><option value="">Chọn xe</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.plate_number}</option>)}</select></label>
          <label className="field"><span>Tài xế</span><select name="driver_employee_id" required defaultValue=""><option value="">Chọn nhân sự</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.display_name}</option>)}</select></label>
          <label className="field"><span>Thời gian mỗi điểm (phút)</span><input type="number" name="stop_minutes" inputMode="numeric" min={STOP_MINUTES_MIN} max={STOP_MINUTES_MAX} step={1} value={minutes} onChange={(event) => setMinutes(event.target.value)} required />
            <small className="muted">Gồm chạy xe và bốc dỡ tại một điểm.</small></label>
        </div>
      </fieldset>
      <input type="hidden" name="departure_at_iso" value={departureIso} />
      <input type="hidden" name="delivery_ids" value={JSON.stringify(selected)} />
      <input type="hidden" name="operation_id" defaultValue="" />

      <fieldset className="route-step">
        <legend><span className="route-step-number">3</span> Thứ tự và giờ dự kiến</legend>
        <p className="muted">Khi dịch vụ bản đồ lỗi hoặc thiếu tọa độ, hệ thống giữ thứ tự này; nếu bản đồ đề xuất thứ tự khác, giờ dự kiến tính lại theo thứ tự mới. Phiếu đã có lịch giữ nguyên lịch.</p>
        {ordered.length ? <ol className="route-stop-list">{ordered.map((delivery, index) => <li key={delivery.id} className={overlaps.has(index) ? "route-stop warning" : "route-stop"}>
          <div><strong>{index + 1}. {delivery.delivery_number}</strong> · {delivery.site_name_snapshot}
            <small className="table-subline">{delivery.scheduled_at ? `Giữ lịch phiếu: ${windowLabel(delivery.scheduled_at, delivery.scheduled_end_at ?? null)}` : windows[index] ? `Giờ dự kiến: ${windowLabel(windows[index].start, windows[index].end)}` : "Nhập giờ đi để xem giờ dự kiến"}</small>
            {overlaps.has(index) && <small className="table-subline route-stop-alert" role="note">Lịch chồng với điểm khác trên cùng xe; áp dụng sẽ bị từ chối.</small>}</div>
          <span className="route-stop-move"><button className="button button-secondary button-compact" type="button" aria-label={`Đưa ${delivery.delivery_number} lên`} disabled={index === 0} onClick={() => move(delivery.id, -1)}>↑</button>
            <button className="button button-secondary button-compact" type="button" aria-label={`Đưa ${delivery.delivery_number} xuống`} disabled={index === ordered.length - 1} onClick={() => move(delivery.id, 1)}>↓</button></span>
        </li>)}</ol> : <p className="empty-inline">Chọn phiếu giao ở bước 1.</p>}
      </fieldset>
      <div className="form-actions">
        <button className="button button-primary" type="submit" disabled={pending || selected.length === 0 || state.status === "success"}>{pending ? "Đang tạo đề xuất..." : "Tạo đề xuất lộ trình"}</button>
      </div>
      {state.message && <p role="status" className={state.status === "error" ? "error-message" : "muted"}>{state.message}{state.planId ? <Link className="code-link" href={`/admin/routes?plan=${state.planId}`}> Xem lộ trình</Link> : null}</p>}
    </form>
  );
}

export function ApplyRoutePlanButton({ planId, version }: { planId: string; version: number }) {
  const [state, action, pending] = useActionState(applyRoutePlanAction, initialState);
  const operationId = useRef<string | null>(null);
  return <form action={action} className="form-actions" onSubmit={(event) => {
    operationId.current ??= crypto.randomUUID();
    (event.currentTarget.elements.namedItem("operation_id") as HTMLInputElement).value = operationId.current;
  }}><input type="hidden" name="plan_id" value={planId} /><input type="hidden" name="expected_version" value={version} /><input type="hidden" name="operation_id" defaultValue="" /><button className="button button-primary" type="submit" disabled={pending || state.status === "success"}>{pending ? "Đang phân giao..." : "Áp dụng và phân giao"}</button>{state.message && <p role="status" className={state.status === "error" ? "error-message" : "muted"}>{state.message}</p>}</form>;
}
