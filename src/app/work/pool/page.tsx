import { workKindLabel } from "@/modules/portal/presentation";
import Link from "next/link";

import { ClaimDeliveryCard } from "@/components/portal/claim-delivery-card";
import { ClaimJobButton } from "@/components/portal/claim-job-button";
import styles from "@/components/portal/portal.module.css";
import { getWorkerDeliveryPool, getWorkerPortalSnapshot } from "@/modules/portal/actions";

export default async function WorkPoolPage() {
  const [snapshot, deliveries] = await Promise.all([getWorkerPortalSnapshot(), getWorkerDeliveryPool()]);
  const empty = !snapshot.pool.length && !deliveries.length;
  return (
    <div className={styles.page}>
      <header className={styles.sectionHead}>
        <div>
          <h1>Kho việc có thể nhận</h1>
          <p>Chỉ hiện việc ở chi nhánh bạn đang làm. Ai bấm nhận trước thì được việc.</p>
        </div>
      </header>
      {deliveries.length > 0 && <section aria-labelledby="pool-deliveries" className={styles.grid}>
        <h2 id="pool-deliveries" className={styles.claimLabel}>Phiếu giao chờ người nhận ({deliveries.length})</h2>
        {deliveries.map((delivery) => <ClaimDeliveryCard delivery={delivery} key={delivery.id} />)}
      </section>}
      {snapshot.pool.length > 0 && <section aria-labelledby="pool-jobs" className={styles.grid}>
        {deliveries.length > 0 && <h2 id="pool-jobs" className={styles.claimLabel}>Việc dịch vụ ({snapshot.pool.length})</h2>}
        {snapshot.pool.map((job) => (
          <article className={styles.card + " " + styles.cardAccent} key={job.id}>
            <span className={styles.badge + " " + styles.badgeWarm}>{workKindLabel(job.kind)}</span>
            <h2>{job.title ?? job.number}</h2>
            <div className={styles.meta}>
              <span>{job.number}</span>
              <span>{job.site_name ?? job.address ?? "Địa điểm sẽ cập nhật"}</span>
            </div>
            <div className={styles.actions}>
              <Link className={styles.buttonSecondary} href={"/work/jobs/" + job.id}>Xem chi tiết</Link>
              <ClaimJobButton version={job.version} workItemId={job.id} />
            </div>
          </article>
        ))}
      </section>}
      {empty && <p className={styles.empty}>Hiện chưa có công việc phù hợp để nhận.</p>}
    </div>
  );
}
