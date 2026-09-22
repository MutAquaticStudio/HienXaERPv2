"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { applyRoutePlanAction, createRoutePlanAction, type RouteActionState } from "@/modules/routing/actions";

type DeliveryOption = { id: string; delivery_number: string; site_name_snapshot: string; delivery_address_snapshot: string; scheduled_at: string | null };
type VehicleOption = { id: string; plate_number: string };
type EmployeeOption = { id: string; display_name: string };

const initialState: RouteActionState = { status: "idle", message: "" };

export function RoutePlanForm({ deliveries, vehicles, employees }: { deliveries: DeliveryOption[]; vehicles: VehicleOption[]; employees: EmployeeOption[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [departure, setDeparture] = useState("");
  const [state, action, pending] = useActionState(createRoutePlanAction, initialState);
  const [operationId, setOperationId] = useState("");
  useEffect(() => setOperationId(crypto.randomUUID()), []);

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
    <form action={action} className="form-stack">
      <div className="form-grid">
        <label className="field"><span>Giờ khởi hành thực tế (giờ địa phương)</span><input type="datetime-local" value={departure} onChange={(event) => setDeparture(event.target.value)} required /></label>
        <label className="field"><span>Xe</span><select name="vehicle_id" required defaultValue=""><option value="">Chọn xe</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.plate_number}</option>)}</select></label>
        <label className="field"><span>Tài xế</span><select name="driver_employee_id" required defaultValue=""><option value="">Chọn nhân sự</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.display_name}</option>)}</select></label>
      </div>
      <input type="hidden" name="departure_at_iso" value={departure ? new Date(departure).toISOString() : ""} />
      <input type="hidden" name="delivery_ids" value={JSON.stringify(selected)} />
      <input type="hidden" name="operation_id" value={operationId} />
      <div className="table-wrap"><table><thead><tr><th>Chọn</th><th>Chuyến giao</th><th>Công trình</th><th>Dự kiến</th></tr></thead><tbody>
        {deliveries.map((delivery) => <tr key={delivery.id}><td><input type="checkbox" aria-label={`Chọn ${delivery.delivery_number}`} checked={selected.includes(delivery.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, delivery.id] : current.filter((id) => id !== delivery.id))} /></td><td><strong>{delivery.delivery_number}</strong></td><td>{delivery.site_name_snapshot}<div className="muted">{delivery.delivery_address_snapshot}</div></td><td>{delivery.scheduled_at ? new Date(delivery.scheduled_at).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "Chưa chốt"}</td></tr>)}
      </tbody></table></div>
      <div className="card card-pad"><h3>Thứ tự thủ công trước khi gọi provider</h3><p className="muted">Khi provider lỗi hoặc thiếu tọa độ, hệ thống giữ đúng thứ tự này, không tự phân giao.</p>
        {selected.map((id, index) => { const delivery = deliveries.find((row) => row.id === id); return <div className="detail-item" key={id}><span>{index + 1}. {delivery?.delivery_number ?? id} · {delivery?.site_name_snapshot}</span><span><button className="button button-secondary" type="button" aria-label={`Đưa ${delivery?.delivery_number} lên`} disabled={index === 0} onClick={() => move(id, -1)}>↑</button> <button className="button button-secondary" type="button" aria-label={`Đưa ${delivery?.delivery_number} xuống`} disabled={index === selected.length - 1} onClick={() => move(id, 1)}>↓</button></span></div>; })}
      </div>
      <button className="button button-primary" type="submit" disabled={pending || !operationId || selected.length === 0 || state.status === "success"}>{pending ? "Đang tạo đề xuất..." : "Tạo đề xuất lộ trình"}</button>
      {state.message && <p role="status" className={state.status === "error" ? "error-message" : "muted"}>{state.message}{state.planId ? <Link className="code-link" href={`/admin/routes?plan=${state.planId}`}> Xem RoutePlan</Link> : null}</p>}
    </form>
  );
}

export function ApplyRoutePlanButton({ planId, version }: { planId: string; version: number }) {
  const [state, action, pending] = useActionState(applyRoutePlanAction, initialState);
  const [operationId, setOperationId] = useState("");
  useEffect(() => setOperationId(crypto.randomUUID()), []);
  return <form action={action} className="form-actions"><input type="hidden" name="plan_id" value={planId} /><input type="hidden" name="expected_version" value={version} /><input type="hidden" name="operation_id" value={operationId} /><button className="button button-primary" type="submit" disabled={pending || !operationId || state.status === "success"}>{pending ? "Đang Apply..." : "Apply và phân giao"}</button>{state.message && <p role="status" className={state.status === "error" ? "error-message" : "muted"}>{state.message}</p>}</form>;
}
