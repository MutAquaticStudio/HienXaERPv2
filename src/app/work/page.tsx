import { workStateLabel } from "@/modules/portal/presentation";
import Link from "next/link";

import styles from "@/components/portal/portal.module.css";
import { getWorkerPortalSnapshot } from "@/modules/portal/actions";
import type { WorkerJob } from "@/modules/portal/types";

function JobCard({ job, label }: { job: WorkerJob | null; label: string }) {
  if (!job) {
    return <article className={styles.card}><span className={styles.badge}>{label}</span><p>Chưa có công việc được phân công.</p></article>;
  }
  return (
    <article className={styles.card + " " + styles.cardAccent}>
      <span className={styles.badge}>{label} · {workStateLabel(job.state)}</span>
      <h2>{job.title ?? job.number}</h2>
      <div className={styles.meta}>
        <span>{job.number}</span>
        <span>{job.site_name ?? job.address ?? "Địa điểm đang cập nhật"}</span>
      </div>
      <Link className={styles.button} href={"/work/jobs/" + job.id}>Mở công việc</Link>
    </article>
  );
}

export default async function WorkHomePage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const snapshot = await getWorkerPortalSnapshot();
  const query = await searchParams;
  return (
    <div className={styles.page}>
      {query.notice === "work-unavailable" && <p className={styles.status} role="status">Công việc đã chuyển người phụ trách hoặc bạn không còn quyền mở. Hãy dùng danh sách công việc hiện tại hoặc liên hệ điều phối.</p>}
      <header className={styles.hero}>
        <p className={styles.heroEyebrow}>Ca làm việc của {snapshot.employee.display_name}</p>
        <h1>{snapshot.current ? "Tiếp tục việc đang làm" : "Sẵn sàng cho việc tiếp theo"}</h1>
        <p>Ưu tiên hiện tại, hành động tiếp theo và thông tin hiện trường nằm trong một luồng ngắn.</p>
      </header>
      <div className={styles.gridTwo}>
        <JobCard job={snapshot.current} label="HIỆN TẠI" />
        <JobCard job={snapshot.next} label="TIẾP THEO" />
      </div>
      <section className={styles.sectionHead}>
        <div><h2>Hành động nhanh</h2><p>Không cần mở màn hình ERP dày đặc.</p></div>
      </section>
      <div className={styles.gridTwo}>
        <Link className={styles.buttonSecondary} href="/work/pool">Xem kho việc có thể nhận</Link>
        <Link className={styles.buttonSecondary} href="/work/earnings">Xem thu nhập của tôi</Link>
      </div>
    </div>
  );
}
