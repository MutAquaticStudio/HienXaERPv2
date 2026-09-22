import { ClaimJobButton } from "@/components/portal/claim-job-button";
import styles from "@/components/portal/portal.module.css";
import { StartJobButton } from "@/components/portal/start-job-button";
import { WorkResultDraftForm } from "@/components/portal/work-result-draft-form";
import { ForegroundGpsControl } from "@/components/routing/foreground-gps-control";
import { createServerSupabase } from "@/lib/supabase/server";
import { getWorkerPortalJob } from "@/modules/portal/actions";

function showDate(value?: string) {
  return value
    ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
    : "Chưa chốt";
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
  const canSubmitResult = ["IN_PROGRESS", "BLOCKED"].includes(job.state);
  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <p className={styles.heroEyebrow}>{job.kind ?? "Công việc"} · {job.number}</p>
        <h1>{job.title ?? "Chi tiết công việc"}</h1>
        <p>{job.site_name ?? job.address ?? "Địa điểm đang cập nhật"}</p>
      </header>
      <div className={styles.split}>
        <section className={styles.card}>
          <span className={styles.badge}>{job.state}</span>
          <div className={styles.kv}><span>Thời gian</span><strong>{showDate(job.scheduled_start)}</strong></div>
          <div className={styles.kv}><span>Khách hàng</span><strong>{job.customer_name ?? "Chưa cập nhật"}</strong></div>
          <div className={styles.kv}><span>Địa chỉ</span><strong>{job.address ?? "Chưa cập nhật"}</strong></div>
          <div className={styles.kv}><span>Người nhận</span><strong>{job.receiver_name ?? "Chưa cập nhật"}</strong></div>
          <div className={styles.kv}><span>Điện thoại</span><strong>{job.receiver_phone ?? "Chưa cập nhật"}</strong></div>
          <div className={styles.kv}>
            <span>Số lượng</span>
            <strong>{job.quantity ? job.quantity + " " + (job.unit ?? "") : "Theo xác nhận thực tế"}</strong>
          </div>
          {job.access_note ? <p className={styles.status}>{job.access_note}</p> : null}
          {available ? <ClaimJobButton version={job.version} workItemId={job.id} /> : null}
          {claimed ? <StartJobButton version={job.version} workItemId={job.id} /> : null}
        </section>
        {canSubmitResult ? (
          <section className={styles.card}>
            <h2>Hoàn tất tại hiện trường</h2>
            <WorkResultDraftForm initialEvidenceId={job.proofs?.[0]?.id} version={job.version} workItemId={job.id} />
          </section>
        ) : (
          <section className={styles.card}>
            <h2>Trạng thái</h2>
            <p>{available
              ? "Nhận việc trước khi ghi nhận kết quả."
              : claimed
                ? "Bắt đầu công việc trước khi ghi nhận kết quả."
                : "Công việc đã khóa thao tác kết quả ở trạng thái hiện tại."}</p>
          </section>
        )}
      </div>
      {gpsAssignment && <ForegroundGpsControl deliveryId={gpsAssignment.delivery_id} assignmentVersion={gpsAssignment.assignment_version} />}
    </div>
  );
}
