import { directionsHref, jobStateLabel, soldQuantityLabel, telHref, workKindLabel } from "@/modules/portal/presentation";
import { JobSteps } from "@/components/portal/job-steps";
import Link from "next/link";
import { ChevronLeft, Navigation, Phone } from "lucide-react";
import { ClaimJobButton } from "@/components/portal/claim-job-button";
import styles from "@/components/portal/portal.module.css";
import { StartJobButton } from "@/components/portal/start-job-button";
import { WorkResultDraftForm } from "@/components/portal/work-result-draft-form";
import { DeliveryDoneForm } from "@/components/portal/delivery-done-form";
import { DeliveryLoadForm } from "@/components/portal/delivery-load-form";
import { DeclineJobButton } from "@/components/portal/decline-job-button";
import { getWorkerPortalJob } from "@/modules/portal/actions";
import type { WorkerJob } from "@/modules/portal/types";
import { formatQuantity } from "@/lib/core/quantity";
import { formatBusinessDateTime } from "@/lib/core/business-time";

function showDate(value?: string) {
  return value
    ? formatBusinessDateTime(value)
    : "Chưa chốt";
}

/** What the status card says when there is nothing to press on this job. */
function deliveryStatusText(job: WorkerJob, notMine: boolean, available: boolean, claimed: boolean) {
  if (available) return "Nhận việc trước khi ghi nhận kết quả.";
  if (!job.delivery) return claimed ? "Bắt đầu công việc trước khi ghi nhận kết quả." : "Công việc đã khóa thao tác kết quả ở trạng thái hiện tại.";
  if (notMine) return `Việc này đang giao cho ${job.assignee_name ?? "người khác"}. Chỉ người được giao mới lấy hàng và báo giao được.`;
  if (job.state === "CANCELLED" || job.delivery.state === "CANCELLED") return "Việc đã hủy hoặc đã chuyển cho người khác.";
  if (job.state === "VERIFIED" || job.delivery.state === "VERIFIED") {
    const done = job.delivery.delivered_at ? ` lúc ${formatBusinessDateTime(job.delivery.delivered_at)}` : "";
    return job.delivery.result_kind === "FAILED" ? `Đã báo không giao được${done}; hàng đã về kho.`
      : job.delivery.result_kind === "PARTIAL" ? `Đã giao một phần${done}; phần còn lại đã về kho.` : `Đã giao xong${done}.`;
  }
  if (job.delivery.state === "RESULT_SUBMITTED") return "Đã báo giao. Văn phòng đang kiểm tra lại.";
  return "Phiếu giao đang được cập nhật. Tải lại công việc.";
}

export default async function WorkJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await getWorkerPortalJob(id);
  const available = job.state === "AVAILABLE";
  const claimed = job.state === "CLAIMED";
  const delivery = job.delivery;
  const canSubmitResult = delivery ? delivery.can_submit_result : ["IN_PROGRESS", "BLOCKED"].includes(job.state);
  // FB7: a delivery is loaded ("Đã lấy hàng lên xe") then reported ("Đã giao") by the assigned worker; no "Bắt đầu" step.
  const notMine = !!delivery && job.is_assignee === false && !available;
  const lines = job.delivery?.lines ?? [];
  // Concept "Thợ · Chi tiết việc giao": back + customer + state chip, the steps, where to go, what is on the truck, then the action.
  return (
    <div className={styles.page}>
      <header className={styles.pageHead}>
        <Link className={styles.backButton} href="/work" aria-label="Quay lại"><ChevronLeft aria-hidden size={20} /></Link>
        <div><p>{workKindLabel(job.kind)} · {job.number}</p><h1>{job.customer_name ?? job.title ?? "Chi tiết công việc"}</h1></div>
        <span className={styles.stateChip}>{jobStateLabel(job)}</span>
      </header>
      <section className={styles.card} aria-label="Các bước"><JobSteps job={job} variant="circles" /></section>
      <section className={`${styles.card} ${styles.placeCard}`} aria-label="Địa điểm">
        <div><strong>{job.address ?? job.site_name ?? "Địa điểm đang cập nhật"}</strong>
          <small>{[job.site_name && job.address ? job.site_name : null, job.scheduled_start ? `Hẹn ${showDate(job.scheduled_start)}` : null, job.access_note].filter(Boolean).join(" · ") || "Chưa có ghi chú lối vào"}</small></div>
        {(job.receiver_phone || job.address) && <div className={styles.contactRow}>
          {job.receiver_phone && <a className={styles.contactCall} href={telHref(job.receiver_phone)}><Phone aria-hidden size={17} />Gọi {job.receiver_name ?? "người nhận"}</a>}
          {job.address && <a className={styles.contactWay} href={directionsHref(job.address)} target="_blank" rel="noreferrer"><Navigation aria-hidden size={17} />Chỉ đường</a>}
        </div>}
      </section>
      <div className={styles.split}>
        <section className={styles.card} aria-labelledby="goods-title">
          <div className={styles.cardHead}><h2 id="goods-title">{job.delivery ? "Hàng trên xe" : "Công việc"}</h2>{lines.length > 0 && <span className={styles.hint}>{lines.length} dòng</span>}</div>
          {lines.length ? <ul className={styles.goodsList}>{lines.map((line) => <li key={line.id}>
            <span>{line.material_name}{line.loaded_base_quantity == null && <small>Chưa lấy lên xe</small>}</span>
            <strong>{soldQuantityLabel(line.loaded_base_quantity ?? line.planned_base_quantity, line, formatQuantity)}</strong>
          </li>)}</ul> : <p className={styles.hint}>{job.quantity ? `${job.quantity} ${job.unit ?? ""}` : "Theo xác nhận thực tế"}{job.description ? ` · ${job.description}` : ""}</p>}
          {(job.receiver_name || job.receiver_phone) && <div className={styles.kv}><span>Người nhận</span><strong>{[job.receiver_name, job.receiver_phone].filter(Boolean).join(" · ")}</strong></div>}
          {available ? <ClaimJobButton version={job.version} workItemId={job.id} /> : null}
          {claimed && !job.delivery ? <StartJobButton version={job.version} workItemId={job.id} /> : null}
        </section>
        {delivery && delivery.can_load ? (
          <section className={styles.card}>
            <h2>Lấy hàng lên xe</h2>
            <DeliveryLoadForm workItemId={job.id} version={job.version} delivery={delivery} />
            {claimed && <DeclineJobButton workItemId={job.id} version={job.version} />}
          </section>
        ) : delivery && delivery.can_submit_result ? (
          <section className={styles.card}>
            <h2>Báo đã giao</h2>
            <DeliveryDoneForm workItemId={job.id} version={job.version} delivery={delivery} receiverName={job.receiver_name}
              savedPhotoIds={(job.proofs ?? []).filter((proof) => proof.mime_type?.startsWith("image/")).map((proof) => proof.id)} />
          </section>
        ) : !delivery && canSubmitResult ? (
          <section className={styles.card}>
            <h2>Hoàn tất tại hiện trường</h2>
            <WorkResultDraftForm initialEvidenceId={job.proofs?.[0]?.id} initialReceiverName={job.receiver_name}
              delivery={job.delivery} version={job.version} workItemId={job.id} unit={job.unit} plannedQuantity={job.quantity} />
          </section>
        ) : (
          <section className={styles.card}>
            <h2>Trạng thái</h2>
            <p>{deliveryStatusText(job, notMine, available, claimed)}</p>
            <a className={styles.buttonSecondary} href={`/work/jobs/${job.id}`}>Tải lại công việc</a>
          </section>
        )}
      </div>
    </div>
  );
}
