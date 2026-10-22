import { jobStateLabel } from "@/modules/portal/presentation";
import Link from "next/link";

import styles from "@/components/portal/portal.module.css";
import { getWorkerPortalSnapshot } from "@/modules/portal/actions";
import type { WorkerJob } from "@/modules/portal/types";

const dayKey = (value?: string) => value ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value)) : "";
const timeOf = (value?: string) => value ? new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value)) : "Chưa hẹn giờ";

function JobRow({ job }: { job: WorkerJob }) {
  return <li><Link className={styles.card + " " + styles.cardAccent} href={"/work/jobs/" + job.id}>
    <span className={styles.badge}>{timeOf(job.scheduled_start)} · {jobStateLabel(job)}</span>
    <h3>{job.title ?? job.number}</h3>
    <div className={styles.meta}><span>{job.address ?? job.site_name ?? "Địa điểm đang cập nhật"}</span>{job.receiver_phone && <span>{job.receiver_name ?? "Người nhận"} · {job.receiver_phone}</span>}</div>
  </Link></li>;
}

export default async function WorkHomePage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const snapshot = await getWorkerPortalSnapshot();
  const query = await searchParams;
  // A3: today's jobs by time, then what comes next; one person may hold several deliveries a day (D21).
  const jobs = snapshot.jobs ?? [snapshot.current, snapshot.next].filter((job): job is WorkerJob => !!job);
  const today = dayKey(new Date().toISOString());
  const todays = jobs.filter((job) => !job.scheduled_start || dayKey(job.scheduled_start) <= today);
  const later = jobs.filter((job) => job.scheduled_start && dayKey(job.scheduled_start) > today);
  return (
    <div className={styles.page}>
      {query.notice === "work-unavailable" && <p className={styles.status} role="status">Công việc đã chuyển người phụ trách hoặc bạn không còn quyền mở. Hãy dùng danh sách công việc hiện tại hoặc liên hệ điều phối.</p>}
      {query.notice === "work-declined" && <p className={styles.status} role="status">Đã từ chối việc. Điều phối sẽ giao cho người khác.</p>}
      {query.notice === "delivery-reported" && <p className={styles.status} role="status">Đã báo giao hàng kèm ảnh.{todays.length ? " Việc kế tiếp ở bên dưới." : ""}</p>}
      <header className={styles.hero}>
        <p className={styles.heroEyebrow}>Ca làm việc của {snapshot.employee.display_name}</p>
        <h1>{todays.length ? `Hôm nay: ${todays.length} việc` : "Hôm nay chưa có việc"}</h1>
        <p>Mở việc, lấy hàng lên xe thì bấm &quot;Đã lấy hàng lên xe&quot;; giao xong bấm &quot;Đã giao&quot;. Cả hai đều chụp ảnh.</p>
      </header>
      <section className={styles.sectionHead}><div><h2>Việc hôm nay</h2></div></section>
      {todays.length ? <ul className={styles.jobList}>{todays.map((job) => <JobRow key={job.id} job={job} />)}</ul>
        : <article className={styles.card}><p>Chưa có công việc được phân công hôm nay.</p></article>}
      {later.length > 0 && <>
        <section className={styles.sectionHead}><div><h2>Sắp tới</h2></div></section>
        <ul className={styles.jobList}>{later.map((job) => <JobRow key={job.id} job={job} />)}</ul>
      </>}
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
