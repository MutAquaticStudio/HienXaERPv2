import { Navigation, Phone } from "lucide-react";
import { ClaimJobButton } from "@/components/portal/claim-job-button";
import { DeclineJobButton } from "@/components/portal/decline-job-button";
import { DeliveryDoneForm } from "@/components/portal/delivery-done-form";
import { DeliveryLoadForm } from "@/components/portal/delivery-load-form";
import { StartJobButton } from "@/components/portal/start-job-button";
import { WorkResultDraftForm } from "@/components/portal/work-result-draft-form";
import { WxChip, WxHead, WxSteps } from "@/components/astryx/work-kit";
import { formatBusinessDateTime } from "@/lib/core/business-time";
import { formatQuantity } from "@/lib/core/quantity";
import { fieldTime } from "@/modules/portal/field-dispatch";
import { directionsHref, jobStateLabel, soldQuantityLabel, telHref, workKindLabel } from "@/modules/portal/presentation";
import type { WorkerJob } from "@/modules/portal/types";

const showDate = (value?: string) => value ? formatBusinessDateTime(value) : "Chưa chốt";

/**
 * Chi tiết việc kiểu Astryx (concept "Thợ · Chi tiết việc giao"): quay lại + loại · mã + tên khách + chip, 4 bước vòng tròn số,
 * địa điểm với Gọi / Chỉ đường, Hàng trên xe, rồi thao tác. Các biểu mẫu (nhận việc, lấy hàng, báo đã giao, từ chối) là của Classic,
 * giữ nguyên action, operationId và expectedVersion; chỉ được bọc trong thẻ Astryx.
 */
export function AstryxWorkJobView({ job, dispatcher, statusText, notMine, canSubmitResult }: {
  job: WorkerJob; dispatcher: { name: string; assigned_at: string } | null; statusText: string; notMine: boolean; canSubmitResult: boolean;
}) {
  const available = job.state === "AVAILABLE";
  const claimed = job.state === "CLAIMED";
  const delivery = job.delivery;
  const lines = delivery?.lines ?? [];
  const finished = job.state === "VERIFIED" || job.state === "CANCELLED";
  return <div className="wx-page cols">
    <div className="wx-span" style={{ display: "grid", gap: 14 }}>
      <WxHead back="/work" sub={`${workKindLabel(job.kind)} · ${job.number}`} title={job.customer_name ?? job.title ?? "Chi tiết công việc"}
        chip={<WxChip tone={job.state === "CANCELLED" ? "e" : finished ? "s" : "i"}>{jobStateLabel(job)}</WxChip>} />
      <section className="wx-card" aria-label="Các bước"><WxSteps job={job} /></section>
    </div>

    <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
      <section className="wx-card wx-place" aria-label="Địa điểm">
        <strong>{job.address ?? job.site_name ?? "Địa điểm đang cập nhật"}</strong>
        <small>{[job.site_name && job.address ? job.site_name : null, job.scheduled_start ? `Hẹn ${showDate(job.scheduled_start)}` : null, job.access_note].filter(Boolean).join(" · ") || "Chưa có ghi chú lối vào"}</small>
        {(job.receiver_phone || job.address) && <div className="wx-contact">
          {job.receiver_phone && <a className="wx-btn p" href={telHref(job.receiver_phone)}><Phone aria-hidden size={18} />Gọi {job.receiver_name ?? "người nhận"}</a>}
          {job.address && <a className="wx-btn o" href={directionsHref(job.address)} target="_blank" rel="noreferrer"><Navigation aria-hidden size={18} />Chỉ đường</a>}
        </div>}
      </section>
      <section className="wx-card" aria-labelledby="goods-title">
        <div className="wx-card-head"><h2 id="goods-title">{delivery ? "Hàng trên xe" : "Công việc"}</h2>{lines.length > 0 && <span className="wx-hint">{lines.length} dòng</span>}</div>
        {lines.length ? <ul className="wx-goods">{lines.map((line) => <li key={line.id}>
          <span>{line.material_name}{line.loaded_base_quantity == null && <small>Chưa lấy lên xe</small>}</span>
          <strong>{soldQuantityLabel(line.loaded_base_quantity ?? line.planned_base_quantity, line, formatQuantity)}</strong>
        </li>)}</ul> : <p className="wx-hint">{job.quantity ? `${job.quantity} ${job.unit ?? ""}` : "Theo xác nhận thực tế"}{job.description ? ` · ${job.description}` : ""}</p>}
        {(job.receiver_name || job.receiver_phone) && <div className="wx-kv"><span>Người nhận</span><strong>{[job.receiver_name, job.receiver_phone].filter(Boolean).join(" · ")}</strong></div>}
        {/* D85: thợ chính đã giao việc này từ "Điều phối". */}
        {dispatcher && <div className="wx-kv"><span>Người giao việc</span><strong>{dispatcher.name} (thợ chính) · {fieldTime(dispatcher.assigned_at, new Date().toISOString())}</strong></div>}
        {(available || (claimed && !delivery)) && <div className="wx-foot">
          {available && <ClaimJobButton version={job.version} workItemId={job.id} />}
          {claimed && !delivery && <StartJobButton version={job.version} workItemId={job.id} />}
        </div>}
      </section>
    </div>

    <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
      {delivery && delivery.can_load ? (
        <section className="wx-card">
          <h2>Lấy hàng lên xe</h2>
          <DeliveryLoadForm workItemId={job.id} version={job.version} delivery={delivery} />
          {claimed && <div className="wx-foot"><DeclineJobButton workItemId={job.id} version={job.version} /></div>}
        </section>
      ) : delivery && delivery.can_submit_result ? (
        <section className="wx-card">
          <h2>Báo đã giao</h2>
          <DeliveryDoneForm workItemId={job.id} version={job.version} delivery={delivery} receiverName={job.receiver_name}
            savedPhotoIds={(job.proofs ?? []).filter((proof) => proof.mime_type?.startsWith("image/")).map((proof) => proof.id)} />
        </section>
      ) : !delivery && canSubmitResult ? (
        <section className="wx-card">
          <h2>Hoàn tất tại hiện trường</h2>
          <WorkResultDraftForm initialEvidenceId={job.proofs?.[0]?.id} initialReceiverName={job.receiver_name}
            delivery={job.delivery} version={job.version} workItemId={job.id} unit={job.unit} plannedQuantity={job.quantity} />
        </section>
      ) : (
        <section className="wx-card">
          <h2>Trạng thái</h2>
          <p>{statusText}</p>
          {notMine && <p className="wx-hint">Chỉ người được giao mới thao tác được việc này.</p>}
          <div className="wx-foot"><a className="wx-btn o" href={`/work/jobs/${job.id}`}>Tải lại công việc</a></div>
        </section>
      )}
    </div>
  </div>;
}
