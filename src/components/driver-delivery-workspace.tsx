"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import {
  Camera,
  CheckCircle2,
  MapPin,
  Navigation,
  PackageCheck,
  RefreshCw,
  Truck,
} from "lucide-react";

import {
  runDriverDeliveryAction,
  type DriverDeliveryActionState,
} from "@/app/work/actions";
import {
  WorkerEvidenceUploader,
  type UploadedEvidence,
} from "@/components/worker-evidence-uploader";
import { WorkerIssueForm } from "@/components/worker-issue-form";
import type { BrowserSupabaseConfig } from "@/lib/supabase/client";
import type {
  DeliveryCard,
  DeliveryCommandKind,
  DeliveryEvidenceOption,
} from "@/modules/delivery/types";

const deliveryStatusLabels: Record<DeliveryCard["status"], string> = {
  PLANNED: "Chờ lập chuyến",
  ASSIGNED: "Đã phân công",
  DISPATCHED: "Đang đi lấy/giao",
  ARRIVED: "Đã đến nơi",
  DELIVERED: "Đã giao, chờ xác nhận",
  CONFIRMED: "Đã xác nhận",
  PARTIAL: "Giao một phần",
  FAILED: "Không giao được",
  CANCELLED: "Đã hủy",
};

function Submit({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button className="primary-button worker-cta driver-action" disabled={pending}>
      {pending ? "ĐANG LƯU…" : children}
    </button>
  );
}

function DriverForm({
  kind,
  idempotencyKey,
  label,
  children,
}: {
  kind: DeliveryCommandKind;
  idempotencyKey: string;
  label: string;
  children: ReactNode;
}) {
  const initial: DriverDeliveryActionState = { status: "idle", message: "", idempotencyKey };
  const [state, action] = useActionState(runDriverDeliveryAction, initial);
  return (
    <form action={action} className="driver-action-form">
      <input name="kind" type="hidden" value={kind} />
      <input name="idempotencyKey" type="hidden" value={state.idempotencyKey} />
      {children}
      <Submit>{label}</Submit>
      {state.message ? (
        <p aria-live="polite" className={state.status === "error" ? "form-error compact" : "form-success"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

function LocationProofForm({
  deliveryId,
  idempotencyKey,
}: {
  deliveryId: string;
  idempotencyKey: string;
}) {
  const initial: DriverDeliveryActionState = { status: "idle", message: "", idempotencyKey };
  const [state, action] = useActionState(runDriverDeliveryAction, initial);
  const [capturing, setCapturing] = useState(false);
  const [captureMessage, setCaptureMessage] = useState("");
  const [request, setRequest] = useState<{
    latitude: string;
    longitude: string;
    token: number;
  } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const submittedToken = useRef(0);

  useEffect(() => {
    if (!request || submittedToken.current === request.token) return;
    submittedToken.current = request.token;
    formRef.current?.requestSubmit();
  }, [request]);

  function captureLocation() {
    if (!navigator.onLine) {
      setCaptureMessage("Chưa gửi — vị trí vẫn chưa được ghi nhận trên hệ thống.");
      return;
    }
    if (!navigator.geolocation) {
      setCaptureMessage("Thiết bị không hỗ trợ lấy vị trí. Hãy bật GPS hoặc liên hệ điều phối.");
      return;
    }
    setCapturing(true);
    setCaptureMessage("Đang lấy vị trí từ thiết bị…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setRequest({
          latitude: position.coords.latitude.toFixed(7),
          longitude: position.coords.longitude.toFixed(7),
          token: Date.now(),
        });
        setCapturing(false);
        setCaptureMessage("Đang gửi vị trí thật…");
      },
      () => {
        setCapturing(false);
        setCaptureMessage("Không lấy được vị trí. Hãy cấp quyền vị trí rồi thử lại.");
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 12_000 },
    );
  }

  return (
    <form action={action} className="driver-action-form" ref={formRef}>
      <input name="kind" type="hidden" value="delivery.proof" />
      <input name="idempotencyKey" type="hidden" value={state.idempotencyKey} />
      <input name="deliveryId" type="hidden" value={deliveryId} />
      <input name="proofType" type="hidden" value="LOCATION" />
      <input name="latitude" type="hidden" value={request?.latitude ?? ""} />
      <input name="longitude" type="hidden" value={request?.longitude ?? ""} />
      <button className="primary-button worker-cta driver-action" disabled={capturing} onClick={captureLocation} type="button">
        {capturing ? "ĐANG LẤY VỊ TRÍ…" : "LƯU VỊ TRÍ HIỆN TẠI"}
      </button>
      {captureMessage ? <p aria-live="polite" className="worker-feedback">{captureMessage}</p> : null}
      {state.message ? (
        <p aria-live="polite" className={state.status === "error" ? "form-error compact" : "form-success"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

function nextAction(delivery: DeliveryCard) {
  if (delivery.status === "ASSIGNED" && delivery.sourcingMode !== "WAREHOUSE") return { next: "DISPATCHED", label: "ĐÃ LẤY HÀNG" } as const;
  if (delivery.status === "DISPATCHED") return { next: "ARRIVED", label: "ĐÃ ĐẾN NƠI" } as const;
  if (delivery.status === "ARRIVED") return { next: "DELIVERED", label: "ĐÃ GIAO HÀNG" } as const;
  return null;
}

export function DriverDeliveryWorkspace({
  deliveries,
  evidence,
  initialKeys,
  supabaseConfig,
  heading = "Việc của tôi",
  showReload = true,
}: {
  deliveries: DeliveryCard[];
  evidence: DeliveryEvidenceOption[];
  initialKeys: Record<string, string>;
  supabaseConfig: BrowserSupabaseConfig | null;
  heading?: string;
  showReload?: boolean;
}) {
  const [uploadedEvidence, setUploadedEvidence] = useState<UploadedEvidence[]>([]);
  const allEvidence = [
    ...uploadedEvidence,
    ...evidence.filter((item) => !uploadedEvidence.some((uploaded) => uploaded.id === item.id)),
  ];
  const addEvidence = (item: UploadedEvidence) => {
    setUploadedEvidence((current) => current.some((existing) => existing.id === item.id) ? current : [item, ...current]);
  };

  return (
    <section aria-labelledby="driver-delivery-heading" className="driver-delivery-workspace">
      <p className="page-context">Chuyến được giao</p>
      <h1 id="driver-delivery-heading">{heading}</h1>
      {deliveries.map((delivery) => {
        const action = nextAction(delivery);
        const proofEnabled = ["ARRIVED", "DELIVERED"].includes(delivery.status);
        return (
          <article className="driver-delivery-card" key={delivery.id}>
            <header>
              <div>
                <strong>{delivery.deliveryNumber}</strong>
                <span>{deliveryStatusLabels[delivery.status]}</span>
              </div>
              <Truck size={28} />
            </header>
            <h2>{delivery.customerName}</h2>
            <div className="driver-route">
              <p><PackageCheck />Lấy tại<strong>{delivery.pickupAddress}</strong></p>
              <span aria-hidden="true" />
              <p><MapPin />Giao tới<strong>{delivery.dropAddress}</strong></p>
            </div>
            {delivery.lines.map((line) => (
              <div className="driver-load" key={line.id}>
                <span>{line.materialName}</span>
                <strong>{new Intl.NumberFormat("vi-VN").format(Number(line.plannedQuantity))} {line.uomSymbol}</strong>
                <small>Số thực tế: {line.actualQuantity ?? "chờ điều phối xác nhận"}</small>
              </div>
            ))}
            {delivery.vehicleName ? <p className="driver-vehicle"><Navigation />{delivery.vehicleName}</p> : null}
            {action ? (
              <DriverForm kind="delivery.progress" idempotencyKey={initialKeys[`progress:${delivery.id}`] ?? `progress-${delivery.id}`} label={action.label}>
                <input name="deliveryId" type="hidden" value={delivery.id} />
                <input name="nextStatus" type="hidden" value={action.next} />
                <input name="reason" type="hidden" value="Tài xế xác nhận đúng bước giao hàng" />
              </DriverForm>
            ) : null}
            {delivery.status === "ASSIGNED" && delivery.sourcingMode === "WAREHOUSE" ? <p className="worker-feedback">Đang chờ kho bàn giao hàng.</p> : null}
            {["DISPATCHED", "ARRIVED"].includes(delivery.status) ? (
              <DriverForm kind="delivery.progress" idempotencyKey={initialKeys[`fail:${delivery.id}`] ?? `fail-${delivery.id}`} label="BÁO KHÔNG GIAO ĐƯỢC">
                <input name="deliveryId" type="hidden" value={delivery.id} />
                <input name="nextStatus" type="hidden" value="FAILED" />
                <input name="reason" type="hidden" value="Tài xế báo không thể hoàn tất chuyến giao" />
              </DriverForm>
            ) : null}
            {proofEnabled ? (
              <div className="driver-proof-block">
                <h3><Camera />Bằng chứng giao hàng</h3>
                <LocationProofForm deliveryId={delivery.id} idempotencyKey={initialKeys[`proof:${delivery.id}`] ?? `proof-${delivery.id}`} />
                <WorkerEvidenceUploader
                  config={supabaseConfig}
                  entityId={delivery.id}
                  entityType="DELIVERY"
                  onUploaded={addEvidence}
                />
                <DriverForm kind="delivery.proof" idempotencyKey={initialKeys[`photo:${delivery.id}`] ?? `photo-${delivery.id}`} label="GẮN ẢNH / CHỨNG TỪ">
                  <input name="deliveryId" type="hidden" value={delivery.id} />
                  <input name="proofType" type="hidden" value="PHOTO" />
                  <label>
                    Bằng chứng đã gửi
                    <select defaultValue="" name="evidenceId" required>
                      <option disabled value="">Chọn ảnh hoặc chứng từ đã gửi</option>
                      {allEvidence.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                    </select>
                  </label>
                  <label>
                    Người nhận
                    <input name="receiverName" placeholder="Họ tên người nhận hàng" required />
                  </label>
                </DriverForm>
              </div>
            ) : null}
            {["ASSIGNED", "DISPATCHED", "ARRIVED", "DELIVERED"].includes(delivery.status) ? (
              <WorkerIssueForm sourceId={delivery.id} sourceType="DELIVERY" />
            ) : null}
            {["CONFIRMED", "PARTIAL"].includes(delivery.status) ? <p className="driver-complete"><CheckCircle2 />HOÀN THÀNH</p> : null}
          </article>
        );
      })}
      {!deliveries.length ? <div className="empty-work-card"><Truck size={66} /><h2>Chưa có chuyến được giao</h2><p>Khi điều phối phân công, bạn sẽ thấy ngay tại đây.</p></div> : null}
      {showReload ? <button className="primary-button worker-cta" onClick={() => window.location.reload()} type="button"><RefreshCw />TẢI LẠI</button> : null}
    </section>
  );
}
