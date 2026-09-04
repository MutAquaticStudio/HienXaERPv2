"use client";

import { AlertTriangle, CheckCircle2, MapPinned, Route, ShieldCheck, Truck, UserRound } from "lucide-react";
import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import {
  runRoutePlanAction,
  type RoutePlanActionState,
} from "@/app/app/dispatch/route-actions";
import type {
  RouteOptimizationSnapshot,
  RoutePlanStatus,
} from "@/modules/route-optimization/types";

const statusLabels: Record<RoutePlanStatus, string> = {
  DRAFT: "Chờ duyệt",
  APPROVED: "Đã duyệt · chưa phân công",
  APPLIED: "Đã áp dụng P7",
  SUPERSEDED: "Đã thay thế",
  CANCELLED: "Đã hủy",
};

function Submit({ children, tone = "primary" }: { children: ReactNode; tone?: "primary" | "secondary" }) {
  const { pending } = useFormStatus();
  return <button className={tone === "primary" ? "primary-button route-plan-submit" : "secondary-button route-plan-submit"} disabled={pending}>
    {pending ? "ĐANG GỬI…" : children}
  </button>;
}

function CommandForm({
  idempotencyKey,
  kind,
  children,
}: {
  idempotencyKey: string;
  kind: "route.plan.create" | "route.plan.approve" | "route.plan.apply";
  children: ReactNode;
}) {
  const [state, action] = useActionState(runRoutePlanAction, {
    status: "idle",
    message: "",
    idempotencyKey,
  } satisfies RoutePlanActionState);
  const formRef = useRef<HTMLFormElement>(null);
  const draftRef = useRef<FormData | null>(null);
  useEffect(() => {
    if (state.status !== "error" || !formRef.current || !draftRef.current) return;
    for (const [name, value] of draftRef.current.entries()) {
      const control = formRef.current.elements.namedItem(name);
      if (typeof value === "string" && (control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)) {
        if (control instanceof HTMLInputElement && control.type === "checkbox") control.checked = value === control.value;
        else control.value = value;
      }
    }
  }, [state]);
  return <form action={action} className="route-plan-form" onSubmit={(event) => { draftRef.current = new FormData(event.currentTarget); }} ref={formRef}>
    <input name="kind" type="hidden" value={kind} />
    <input name="idempotencyKey" type="hidden" value={state.idempotencyKey} />
    {children}
    {state.message ? <p aria-live="polite" className={state.status === "error" ? "form-error compact" : "form-success"} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
  </form>;
}

function WarningList({ messages }: { messages: Array<{ code: string; message: string }> }) {
  if (!messages.length) return null;
  return <ul className="route-plan-warnings">
    {messages.map((item, index) => <li key={`${item.code}-${index}`}><AlertTriangle aria-hidden="true" /><span>{item.message}</span></li>)}
  </ul>;
}

function PlanCard({
  plan,
  canManage,
  keyFor,
}: {
  plan: RouteOptimizationSnapshot["plans"][number];
  canManage: boolean;
  keyFor: (name: string) => string;
}) {
  return <article className="route-plan-card">
    <header>
      <div><span className="page-context">{plan.planNumber}</span><h3>{statusLabels[plan.status]}</h3></div>
      <span className={`route-plan-status route-plan-status-${plan.status.toLowerCase()}`}>{plan.providerMode === "MANUAL_FALLBACK" ? "Thứ tự thủ công" : "Đề xuất bản đồ"}</span>
    </header>
    <dl className="route-plan-facts">
      <div><dt><Truck aria-hidden="true" />Xe</dt><dd>{plan.vehicleName}</dd></div>
      <div><dt><UserRound aria-hidden="true" />Tài xế</dt><dd>{plan.driverName}</dd></div>
      <div><dt><MapPinned aria-hidden="true" />Ngày</dt><dd>{plan.scheduledDate}</dd></div>
    </dl>
    <ol className="route-stop-list" aria-label={`Thứ tự ${plan.planNumber}`}>
      {plan.stops.map((stop) => <li key={stop.id}>
        <span>{stop.stopSequence}</span><div><strong>{stop.customerName}</strong><small>{stop.deliveryNumber} · {stop.pickupAddress} → {stop.dropAddress}</small><WarningList messages={stop.warnings} /></div>
      </li>)}
    </ol>
    <WarningList messages={plan.warnings} />
    {plan.status === "DRAFT" && canManage ? <details className="route-plan-command"><summary><ShieldCheck aria-hidden="true" />Duyệt đề xuất</summary>
      <CommandForm idempotencyKey={keyFor(`approve:${plan.id}`)} kind="route.plan.approve">
        <input name="routePlanId" type="hidden" value={plan.id} />
        <label><span>Lý do duyệt</span><textarea defaultValue="Đã rà soát xe, tài xế, tải và thứ tự giao hàng." name="reason" required /></label>
        <p>Việc duyệt chỉ chốt đề xuất. Delivery và phân công P7 vẫn chưa thay đổi.</p>
        <Submit>Duyệt đề xuất</Submit>
      </CommandForm>
    </details> : null}
    {plan.status === "APPROVED" && canManage ? <details className="route-plan-command route-plan-command-risk"><summary><CheckCircle2 aria-hidden="true" />Áp dụng lộ trình bằng P7</summary>
      <CommandForm idempotencyKey={keyFor(`apply:${plan.id}`)} kind="route.plan.apply">
        <input name="routePlanId" type="hidden" value={plan.id} />
        <label><span>Lý do áp dụng</span><textarea defaultValue="Đã xác nhận điều phối và sẵn sàng phân công chuyến." name="reason" required /></label>
        <label className="route-plan-confirm"><input name="confirmApply" required type="checkbox" value="apply-p7" /><span>Tôi hiểu thao tác này sẽ gọi quy trình phân công P7 cho từng chuyến; không nhận hoặc chuyển việc bể công việc.</span></label>
        <p>Hệ thống sẽ dừng toàn bộ nếu có chuyến đã đổi trạng thái hoặc đang ở POOL_CLAIM.</p>
        <Submit>Áp dụng bằng P7</Submit>
      </CommandForm>
    </details> : null}
  </article>;
}

export function RoutePlanWorkspace({
  data,
  canManage,
  initialKeys,
}: {
  data: RouteOptimizationSnapshot;
  canManage: boolean;
  initialKeys: Record<string, string>;
}) {
  const keyFor = (name: string) => initialKeys[name] ?? `route-${name}`;
  const defaultDate = data.candidates[0]?.scheduledDate ?? "2026-09-01";
  return <section className="commercial-panel route-plan-workspace" aria-labelledby="route-plan-heading">
    <div className="commercial-section-heading"><div><p className="page-context">RO1 · Đề xuất, không thay thế Delivery</p><h2 id="route-plan-heading">Tối ưu lộ trình giao hàng</h2><p>Chỉ điều phối duyệt và áp dụng. Trước khi áp dụng, dữ liệu Delivery/P7 không bị thay đổi.</p></div><Route aria-hidden="true" size={30} /></div>
    <div className="route-plan-guardrail"><ShieldCheck aria-hidden="true" /><p>Việc <strong>POOL_CLAIM</strong> chỉ được hiển thị cảnh báo. RO1 không nhận việc hộ, không đổi sang DIRECT và không ghi thẳng phân công từ trình duyệt.</p></div>
    {canManage ? <details className="route-plan-create" open>
      <summary>Tạo đề xuất lộ trình</summary>
      <CommandForm idempotencyKey={keyFor("create")} kind="route.plan.create">
        <div className="route-plan-create-grid">
          <label><span>Ngày chạy lộ trình</span><input defaultValue={defaultDate} name="scheduledDate" required type="date" /></label>
          <label><span>Xe</span><select defaultValue="" name="vehicleId" required><option disabled value="">Chọn xe</option>{data.vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.code} · {vehicle.plateNumber} · {vehicle.vehicleType}</option>)}</select></label>
          <label><span>Tài xế</span><select defaultValue="" name="driverUserId" required><option disabled value="">Chọn tài xế</option>{data.drivers.map((driver) => <option key={driver.userId} value={driver.userId}>{driver.displayName} · {driver.employeeCode}{driver.activeAssignmentCount ? ` · ${driver.activeAssignmentCount} chuyến đang phân công` : ""}</option>)}</select></label>
        </div>
        <fieldset className="route-candidate-list"><legend>Chuyến có thể đưa vào đề xuất</legend>{data.candidates.map((candidate) => <label key={candidate.id}>
          <input defaultChecked name="deliveryId" type="checkbox" value={candidate.id} />
          <span><strong>{candidate.deliveryNumber} · {candidate.customerName}</strong><small>{candidate.pickupAddress} → {candidate.dropAddress} · Ưu tiên {candidate.priority}</small>{candidate.assignmentMode === "POOL_CLAIM" ? <em>POOL_CLAIM · chỉ xem, áp dụng sẽ bị chặn</em> : null}</span>
        </label>)}</fieldset>
        {!data.candidates.length ? <p className="route-plan-empty">Không có Delivery ở trạng thái chờ phân công để lập đề xuất.</p> : <Submit>Tạo đề xuất lộ trình</Submit>}
      </CommandForm>
    </details> : <p className="route-plan-empty">Bạn chỉ có quyền xem lộ trình đã duyệt.</p>}
    <div className="route-plan-list" aria-label="Danh sách đề xuất lộ trình">
      {data.plans.map((plan) => <PlanCard canManage={canManage} key={plan.id} keyFor={keyFor} plan={plan} />)}
      {!data.plans.length ? <p className="route-plan-empty">Chưa có đề xuất lộ trình nào.</p> : null}
    </div>
  </section>;
}
