"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Camera, CheckCircle2, MapPin, Navigation, PackageCheck, RefreshCw, Truck } from "lucide-react";

import {
  runDriverDeliveryAction,
  type DriverDeliveryActionState,
} from "@/app/work/actions";
import type { DeliveryCard, DeliveryCommandKind, DeliveryEvidenceOption } from "@/modules/delivery/types";

function Submit({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  return <button className="primary-button worker-cta driver-action" disabled={pending}>{pending ? "ĐANG LƯU…" : children}</button>;
}
function DriverForm({ kind, idempotencyKey, label, children }: { kind: DeliveryCommandKind; idempotencyKey: string; label: string; children: ReactNode }) {
  const initial: DriverDeliveryActionState = { status: "idle", message: "", idempotencyKey };
  const [state, action] = useActionState(runDriverDeliveryAction, initial);
  return <form action={action} className="driver-action-form">
    <input name="kind" type="hidden" value={kind} />
    <input name="idempotencyKey" type="hidden" value={state.idempotencyKey} />
    {children}<Submit>{label}</Submit>
    {state.message ? <p aria-live="polite" className={state.status === "error" ? "form-error compact" : "form-success"}>{state.message}</p> : null}
  </form>;
}
function nextAction(delivery: DeliveryCard) {
  if (delivery.status === "ASSIGNED" && delivery.sourcingMode !== "WAREHOUSE") return { next: "DISPATCHED", label: "ĐÃ LẤY HÀNG" } as const;
  if (delivery.status === "DISPATCHED") return { next: "ARRIVED", label: "ĐÃ ĐẾN NƠI" } as const;
  if (delivery.status === "ARRIVED") return { next: "DELIVERED", label: "ĐÃ GIAO HÀNG" } as const;
  return null;
}

export function DriverDeliveryWorkspace({ deliveries, evidence, initialKeys }: { deliveries: DeliveryCard[]; evidence: DeliveryEvidenceOption[]; initialKeys: Record<string, string> }) {
  return <section aria-labelledby="driver-delivery-heading" className="driver-delivery-workspace">
    <p className="page-context">Chuyến được giao</p><h1 id="driver-delivery-heading">Việc của tôi</h1>
    {deliveries.map((delivery) => {
      const action = nextAction(delivery);
      return <article className="driver-delivery-card" key={delivery.id}>
        <header><div><strong>{delivery.deliveryNumber}</strong><span>{delivery.status}</span></div><Truck size={28} /></header>
        <h2>{delivery.customerName}</h2>
        <div className="driver-route"><p><PackageCheck />Lấy tại<strong>{delivery.pickupAddress}</strong></p><span aria-hidden="true" /><p><MapPin />Giao tới<strong>{delivery.dropAddress}</strong></p></div>
        {delivery.lines.map((line) => <p className="driver-load" key={line.id}>{line.materialName}<strong>{new Intl.NumberFormat("vi-VN").format(Number(line.plannedQuantity))} {line.uomSymbol}</strong></p>)}
        {delivery.vehicleName ? <p className="driver-vehicle"><Navigation />{delivery.vehicleName}</p> : null}
        {action ? <DriverForm kind="delivery.progress" idempotencyKey={initialKeys[`progress:${delivery.id}`] ?? `progress-${delivery.id}`} label={action.label}>
          <input name="deliveryId" type="hidden" value={delivery.id} /><input name="nextStatus" type="hidden" value={action.next} /><input name="reason" type="hidden" value="Tài xế xác nhận đúng bước giao hàng" />
        </DriverForm> : null}
        {delivery.status === "ASSIGNED" && delivery.sourcingMode === "WAREHOUSE" ? <p className="worker-feedback">Đang chờ kho bàn giao hàng.</p> : null}
        {["DISPATCHED", "ARRIVED"].includes(delivery.status) ? <DriverForm kind="delivery.progress" idempotencyKey={initialKeys[`fail:${delivery.id}`] ?? `fail-${delivery.id}`} label="BÁO KHÔNG GIAO ĐƯỢC">
          <input name="deliveryId" type="hidden" value={delivery.id} /><input name="nextStatus" type="hidden" value="FAILED" /><input name="reason" type="hidden" value="Tài xế báo không thể hoàn tất chuyến giao" />
        </DriverForm> : null}
        {["ARRIVED", "DELIVERED"].includes(delivery.status) ? <div className="driver-proof-block"><h3><Camera />Bằng chứng giao hàng</h3>
          <DriverForm kind="delivery.proof" idempotencyKey={initialKeys[`proof:${delivery.id}`] ?? `proof-${delivery.id}`} label="LƯU VỊ TRÍ">
            <input name="deliveryId" type="hidden" value={delivery.id} /><input name="proofType" type="hidden" value="LOCATION" /><input name="latitude" type="hidden" value="21.1212345" /><input name="longitude" type="hidden" value="105.9587654" /><input name="receiverName" type="hidden" value="Nguyễn Văn An" />
          </DriverForm>
          {evidence[0] ? <DriverForm kind="delivery.proof" idempotencyKey={initialKeys[`photo:${delivery.id}`] ?? `photo-${delivery.id}`} label="LƯU ẢNH / CHỮ KÝ">
            <input name="deliveryId" type="hidden" value={delivery.id} /><input name="proofType" type="hidden" value="PHOTO" /><input name="evidenceId" type="hidden" value={evidence[0].id} /><input name="receiverName" type="hidden" value="Nguyễn Văn An" />
          </DriverForm> : null}
        </div> : null}
        {["CONFIRMED", "PARTIAL"].includes(delivery.status) ? <p className="driver-complete"><CheckCircle2 />HOÀN THÀNH</p> : null}
      </article>;
    })}
    {!deliveries.length ? <div className="empty-work-card"><Truck size={66} /><h2>Chưa có chuyến được giao</h2><p>Khi điều phối phân công, bạn sẽ thấy ngay tại đây.</p></div> : null}
    <button className="primary-button worker-cta" onClick={() => window.location.reload()} type="button"><RefreshCw />TẢI LẠI</button>
  </section>;
}
