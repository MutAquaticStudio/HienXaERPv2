import { jobStateLabel, soldQuantityLabel, workKindLabel } from "@/modules/portal/presentation";
import { ClaimJobButton } from "@/components/portal/claim-job-button";
import styles from "@/components/portal/portal.module.css";
import { StartJobButton } from "@/components/portal/start-job-button";
import { WorkResultDraftForm } from "@/components/portal/work-result-draft-form";
import { DeliveryDoneForm } from "@/components/portal/delivery-done-form";
import { DeliveryLoadForm } from "@/components/portal/delivery-load-form";
import { DeclineJobButton } from "@/components/portal/decline-job-button";
import { ForegroundGpsControl } from "@/components/routing/foreground-gps-control";
import { createServerSupabase } from "@/lib/supabase/server";
import { getWorkerPortalJob } from "@/modules/portal/actions";
import type { WorkerJob } from "@/modules/portal/types";
import { formatQuantity } from "@/lib/core/quantity";
import { formatBusinessDateTime } from "@/lib/core/business-time";
import { GPS_DEVICE_AVAILABLE, GPS_DEVICE_UNAVAILABLE_MESSAGE } from "@/modules/routing/device-availability";

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
  const supabase = await createServerSupabase();
  const { data: gpsAssignments, error: gpsError } = await supabase.rpc("my_active_gps_assignment", { target_work_item_id: id });
  if (gpsError) throw gpsError;
  const gpsAssignment = gpsAssignments?.[0];
  const available = job.state === "AVAILABLE";
  const claimed = job.state === "CLAIMED";
  const delivery = job.delivery;
  const canSubmitResult = delivery ? delivery.can_submit_result : ["IN_PROGRESS", "BLOCKED"].includes(job.state);
  // FB7: a delivery is loaded ("Đã lấy hàng lên xe") then reported ("Đã giao") by the assigned worker; no "Bắt đầu" step.
  const notMine = !!delivery && job.is_assignee === false && !available;
  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <p className={styles.heroEyebrow}>{workKindLabel(job.kind)} · {job.number}</p>
        <h1>{job.title ?? "Chi tiết công việc"}</h1>
        <p>{job.site_name ?? job.address ?? "Địa điểm đang cập nhật"}</p>
      </header>
      <div className={styles.split}>
        <section className={styles.card}>
          <span className={styles.badge}>{jobStateLabel(job)}</span>
          <div className={styles.kv}><span>Thời gian</span><strong>{showDate(job.scheduled_start)}</strong></div>
          <div className={styles.kv}><span>Khách hàng</span><strong>{job.customer_name ?? "Chưa cập nhật"}</strong></div>
          <div className={styles.kv}><span>Địa chỉ</span><strong>{job.address ?? "Chưa cập nhật"}</strong></div>
          <div className={styles.kv}><span>Người nhận</span><strong>{job.receiver_name ?? "Chưa cập nhật"}</strong></div>
          <div className={styles.kv}><span>Điện thoại</span><strong>{job.receiver_phone ?? "Chưa cập nhật"}</strong></div>
          <div className={styles.kv}>
            <span>Số lượng</span>
            <strong>{job.delivery ? `${job.delivery.lines.length} dòng vật tư` : job.quantity ? job.quantity + " " + (job.unit ?? "") : "Theo xác nhận thực tế"}</strong>
          </div>
          {job.delivery?.lines.map((line) => <div className={styles.kv} key={line.id}>
            <span>{line.material_name}</span><strong className={styles.quantityScope}><span>Giao: {soldQuantityLabel(line.planned_base_quantity, line, formatQuantity)}</span><span>Đã lên xe: {line.loaded_base_quantity == null ? "Chưa lấy" : soldQuantityLabel(line.loaded_base_quantity, line, formatQuantity)}</span></strong>
          </div>)}
          {job.access_note ? <p className={styles.status}>{job.access_note}</p> : null}
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
            <h2>Giao hàng</h2>
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
      {gpsAssignment && (GPS_DEVICE_AVAILABLE
        ? <ForegroundGpsControl deliveryId={gpsAssignment.delivery_id} assignmentVersion={gpsAssignment.assignment_version} />
        : <p className={styles.status}>{GPS_DEVICE_UNAVAILABLE_MESSAGE}</p>)}
    </div>
  );
}
