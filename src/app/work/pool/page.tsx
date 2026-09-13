import Link from "next/link";

import { ClaimJobButton } from "@/components/portal/claim-job-button";
import styles from "@/components/portal/portal.module.css";
import { getWorkerPortalSnapshot } from "@/modules/portal/actions";

export default async function WorkPoolPage() {
  const snapshot = await getWorkerPortalSnapshot();
  return (
    <div className={styles.page}>
      <header className={styles.sectionHead}>
        <div>
          <h1>Kho việc có thể nhận</h1>
          <p>Chỉ hiển thị việc ở chi nhánh bạn đang có quyền active.</p>
        </div>
      </header>
      <div className={styles.grid}>
        {snapshot.pool.length ? snapshot.pool.map((job) => (
          <article className={styles.card + " " + styles.cardAccent} key={job.id}>
            <span className={styles.badge + " " + styles.badgeWarm}>{job.kind ?? "CÔNG VIỆC"}</span>
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
        )) : <p className={styles.empty}>Hiện chưa có công việc phù hợp để nhận.</p>}
      </div>
    </div>
  );
}
