"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { CalendarDays, MapPin, PackageCheck, Route, Truck, UserRound } from "lucide-react";

import {
  runDeliveryAction,
  type DeliveryActionState,
} from "@/app/app/dispatch/actions";
import type { DeliveryCommandKind, DeliverySnapshot, DeliveryStatus } from "@/modules/delivery/types";

const columns: Array<{ status: DeliveryStatus; label: string }> = [
  { status: "PLANNED", label: "Chờ phân công" },
  { status: "ASSIGNED", label: "Đã phân công" },
  { status: "DISPATCHED", label: "Đang đi giao" },
  { status: "ARRIVED", label: "Đã đến nơi" },
  { status: "DELIVERED", label: "Chờ xác nhận" },
  { status: "CONFIRMED", label: "Hoàn thành" },
  { status: "PARTIAL", label: "Giao một phần" },
  { status: "FAILED", label: "Không giao được" },
  { status: "CANCELLED", label: "Đã hủy" },
];
function number(value: string) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 6 }).format(Number(value));
}
function Submit({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  return <button className="primary-button commercial-submit" disabled={pending}>{pending ? "Đang lưu…" : children}</button>;
}
function Form({ kind, idempotencyKey, children, label }: { kind: DeliveryCommandKind; idempotencyKey: string; children: ReactNode; label: string }) {
  const initial: DeliveryActionState = { status: "idle", message: "", idempotencyKey };
  const [state, action] = useActionState(runDeliveryAction, initial);
  return (
    <form action={action} className="commercial-inline-form delivery-inline-form">
      <input name="kind" type="hidden" value={kind} />
      <input name="idempotencyKey" type="hidden" value={state.idempotencyKey} />
      {children}
      <Submit>{label}</Submit>
      {state.message ? <p aria-live="polite" className={state.status === "error" ? "form-error compact" : "form-success"}>{state.message}</p> : null}
    </form>
  );
}
function Field({ label, name, defaultValue, type = "text" }: { label: string; name: string; defaultValue: string; type?: string }) {
  return <label className="master-field"><span>{label}</span><input defaultValue={defaultValue} name={name} required type={type} /></label>;
}

export function DispatchWorkspace({ data, initialKeys, canPlan, canAssign, canDispatch, canUpdate, canConfirm }: {
  data: DeliverySnapshot;
  initialKeys: Record<string, string>;
  canPlan: boolean;
  canAssign: boolean;
  canDispatch: boolean;
  canUpdate: boolean;
  canConfirm: boolean;
}) {
  const key = (name: string) => initialKeys[name] ?? `delivery-${name}`;
  return (
    <div className="commercial-workspace delivery-workspace">
      <header className="master-page-header commercial-page-header">
        <div><p className="page-context">Vận hành · Giao hàng</p><h1>Điều phối giao hàng</h1><p>Mỗi chuyến có xe, tài xế, điểm lấy/giao và bằng chứng rõ ràng trước khi xác nhận.</p></div>
        <div className="commercial-hero-icon"><Route size={30} /></div>
      </header>

      <section className="commercial-kpi-grid" aria-label="Tổng quan điều phối">
        <article><Truck /><span>Chuyến hôm nay</span><strong>{data.deliveries.filter((item) => item.scheduledDate === "2026-09-01").length}</strong></article>
        <article><UserRound /><span>Đã phân công</span><strong>{data.deliveries.filter((item) => Boolean(item.driverUserId)).length}</strong></article>
        <article><MapPin /><span>Đang trên đường</span><strong>{data.deliveries.filter((item) => ["DISPATCHED", "ARRIVED"].includes(item.status)).length}</strong></article>
        <article><PackageCheck /><span>Chờ xác nhận</span><strong>{data.deliveries.filter((item) => item.status === "DELIVERED").length}</strong></article>
      </section>

      {canPlan && data.planningOptions.length ? <section className="commercial-panel">
        <div className="commercial-section-heading"><div><p className="page-context">Sẵn sàng lập chuyến</p><h2>Nhu cầu giao đã đủ nguồn</h2></div></div>
        <div className="delivery-plan-grid">{data.planningOptions.map((option) => <article className="commercial-card" key={option.id}>
          <strong>{option.salesOrderNumber} · {option.customerName}</strong>
          <p>{option.materialName} · {number(option.allocatedQuantity)} {option.uomSymbol}</p>
          <small>{option.sourcingMode === "SUPPLIER_DIRECT" ? "Giao thẳng từ nhà cung cấp" : "Xuất từ kho"}</small>
          <Form kind="delivery.plan" idempotencyKey={key(`plan:${option.id}`)} label="Lập chuyến">
            <input name="supplyAllocationId" type="hidden" value={option.id} />
            <Field defaultValue={option.pickupAddress} label="Điểm lấy" name="pickupAddress" />
            <Field defaultValue={option.dropAddress} label="Điểm giao" name="dropAddress" />
            <Field defaultValue="2026-09-01" label="Ngày giao" name="scheduledDate" type="date" />
          </Form>
        </article>)}</div>
      </section> : null}

      <section className="commercial-panel delivery-board-panel">
        <div className="commercial-section-heading"><div><p className="page-context">Dispatcher board</p><h2>Luồng chuyến giao</h2></div></div>
        <div className="delivery-board" aria-label="Bảng trạng thái chuyến giao">
          {columns.map((column) => <section className="delivery-column" key={column.status}>
            <h3>{column.label}<span>{data.deliveries.filter((item) => item.status === column.status).length}</span></h3>
            {data.deliveries.filter((item) => item.status === column.status).map((delivery) => <article className="delivery-card" key={delivery.id}>
              <div className="delivery-card-heading"><strong>{delivery.deliveryNumber}</strong><span className={`commercial-status status-${delivery.status.toLowerCase()}`}>{column.label}</span></div>
              <b>{delivery.customerName}</b><small>{delivery.salesOrderNumber}</small>
              <p><MapPin size={16} />{delivery.pickupAddress} → {delivery.dropAddress}</p>
              <p><CalendarDays size={16} />{delivery.scheduledDate}</p>
              {delivery.lines.map((line) => <p key={line.id}><PackageCheck size={16} />{line.materialName} · {number(line.plannedQuantity)} {line.uomSymbol}</p>)}
              {delivery.vehicleName ? <small>{delivery.vehicleName} · {delivery.driverName}</small> : null}
              {canAssign && delivery.status === "PLANNED" && data.vehicles[0] && data.drivers[0] ? <Form kind="delivery.assign" idempotencyKey={key(`assign:${delivery.id}`)} label="Phân công">
                <input name="deliveryId" type="hidden" value={delivery.id} />
                <label className="master-field"><span>Xe</span><select name="vehicleId" required>{data.vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.code} · {vehicle.plateNumber}</option>)}</select></label>
                <label className="master-field"><span>Tài xế</span><select name="driverUserId" required>{data.drivers.map((driver) => <option key={driver.userId} value={driver.userId}>{driver.displayName}</option>)}</select></label>
              </Form> : null}
              {canDispatch && delivery.status === "ASSIGNED" ? <Form kind="delivery.progress" idempotencyKey={key(`dispatch:${delivery.id}`)} label="Bàn giao & xuất phát">
                <input name="deliveryId" type="hidden" value={delivery.id} /><input name="nextStatus" type="hidden" value="DISPATCHED" /><input name="reason" type="hidden" value="Kho đã bàn giao đủ hàng cho tài xế" />
              </Form> : null}
              {canUpdate && ["PLANNED", "ASSIGNED"].includes(delivery.status) ? <Form kind="delivery.progress" idempotencyKey={key(`cancel:${delivery.id}`)} label="Hủy chuyến">
                <input name="deliveryId" type="hidden" value={delivery.id} /><input name="nextStatus" type="hidden" value="CANCELLED" /><input name="reason" type="hidden" value="Điều phối hủy chuyến và lưu rõ nguyên nhân" />
              </Form> : null}
              {canConfirm && delivery.status === "DELIVERED" && delivery.lines[0] ? <Form kind="delivery.confirm" idempotencyKey={key(`confirm:${delivery.id}`)} label="Xác nhận giao hàng">
                <input name="deliveryId" type="hidden" value={delivery.id} /><input name="deliveryLineId" type="hidden" value={delivery.lines[0].id} />
                <Field defaultValue={delivery.lines[0].plannedQuantity} label="Thực giao" name="actualQuantity" type="number" />
                <Field defaultValue={delivery.lines[0].plannedQuantity} label="Thực nhận" name="acceptedQuantity" type="number" />
                <Field defaultValue="Nguyễn Văn An" label="Người nhận" name="receiverName" />
                <input name="reason" type="hidden" value="Đối chiếu biên bản giao nhận đã ký" />
              </Form> : null}
            </article>)}
          </section>)}
        </div>
      </section>
    </div>
  );
}
