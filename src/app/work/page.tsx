import { jobStateLabel, directionsHref, telHref } from "@/modules/portal/presentation";
import Link from "next/link";
import { ChevronRight, Clock3, Navigation, Phone, PlusCircle } from "lucide-react";

import { JobSteps } from "@/components/portal/job-steps";
import styles from "@/components/portal/portal.module.css";
import { requireInternalAccess } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { ClockPanel } from "@/modules/attendance/forms";
import { formatClock, formatShiftTime } from "@/modules/attendance/presentation";
import { getWorkerPortalSnapshot } from "@/modules/portal/actions";
import type { WorkerJob } from "@/modules/portal/types";

const zone = { timeZone: "Asia/Ho_Chi_Minh" } as const;
const dayKey = (value?: string) => value ? new Intl.DateTimeFormat("en-CA", zone).format(new Date(value)) : "";
const timeOf = (value?: string) => value ? new Intl.DateTimeFormat("vi-VN", { ...zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value)) : "—";
const finished = (job: WorkerJob) => job.state === "VERIFIED" || job.state === "CANCELLED" || ["RESULT_SUBMITTED", "VERIFIED", "CANCELLED"].includes(job.delivery?.state ?? "");

/** Today's shift: open record (clocked in) or the planned shift, for the card with Vào ca / Ra ca. */
async function todayShift(day: string) {
  try {
    const access = await requireInternalAccess("/work/login");
    const supabase = await createServerSupabase();
    const [records, assignments, settings] = await Promise.all([
      supabase.from("attendance_records").select("clock_in_at, clock_out_at").eq("employee_id", access.employeeId).gte("work_date", day).order("work_date", { ascending: false }).limit(3),
      supabase.from("shift_assignments").select("work_shifts(name, start_time, end_time)").eq("employee_id", access.employeeId).eq("branch_id", access.branchId).eq("work_date", day).is("cancelled_at", null).limit(1),
      supabase.from("attendance_settings").select("require_location").eq("branch_id", access.branchId).maybeSingle(),
    ]);
    const open = (records.data ?? []).find((row) => row.clock_in_at && !row.clock_out_at);
    const done = (records.data ?? []).find((row) => row.clock_in_at && row.clock_out_at);
    const shiftRow = assignments.data?.[0]?.work_shifts as unknown as { name: string; start_time: string; end_time: string } | { name: string; start_time: string; end_time: string }[] | null;
    const shift = Array.isArray(shiftRow) ? shiftRow[0] : shiftRow;
    return { open: open?.clock_in_at ?? null, done: done ? { in: done.clock_in_at!, out: done.clock_out_at! } : null,
      shift: shift ? `${shift.name} ${formatShiftTime(shift.start_time)} – ${formatShiftTime(shift.end_time)}` : null,
      requireLocation: Boolean(settings.data?.require_location) };
  } catch {
    return null;
  }
}

function NextJob({ job }: { job: WorkerJob }) {
  return <li><Link href={"/work/jobs/" + job.id}>
    <strong>{timeOf(job.scheduled_start)}</strong>
    <span><span>{job.customer_name ?? job.title ?? job.number}</span><small>{job.address ?? job.site_name ?? "Địa điểm đang cập nhật"} · {jobStateLabel(job)}</small></span>
    <ChevronRight aria-hidden size={18} color="var(--muted)" />
  </Link></li>;
}

/** FB18: "Hôm nay" — the shift card, the job in hand with its steps and one-tap call / directions, then what comes next. */
export default async function WorkHomePage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const snapshot = await getWorkerPortalSnapshot();
  const query = await searchParams;
  const now = new Date();
  const today = dayKey(now.toISOString());
  const shift = await todayShift(today);
  // A3: today's jobs by time, then what comes next; one person may hold several deliveries a day (D21).
  const jobs = (snapshot.jobs ?? [snapshot.current, snapshot.next].filter((job): job is WorkerJob => !!job)).filter((job) => !finished(job));
  const todays = jobs.filter((job) => !job.scheduled_start || dayKey(job.scheduled_start) <= today);
  const later = jobs.filter((job) => job.scheduled_start && dayKey(job.scheduled_start) > today);
  const [current, ...rest] = todays;
  const initials = snapshot.employee.display_name.trim().split(/\s+/).slice(-2).map((part) => part[0]?.toLocaleUpperCase("vi-VN")).join("");
  const dateLabel = new Intl.DateTimeFormat("vi-VN", { ...zone, weekday: "long", day: "2-digit", month: "2-digit" }).format(now);

  return (
    <div className={styles.page}>
      {query.notice === "work-unavailable" && <p className={styles.status} role="status">Công việc đã chuyển người phụ trách hoặc bạn không còn quyền mở. Hãy dùng danh sách công việc hiện tại hoặc liên hệ điều phối.</p>}
      {query.notice === "work-declined" && <p className={styles.status} role="status">Đã từ chối việc. Điều phối sẽ giao cho người khác.</p>}
      {query.notice === "delivery-reported" && <p className={styles.status} role="status">Đã báo giao hàng kèm ảnh.{todays.length ? " Việc kế tiếp ở bên dưới." : ""}</p>}

      <header className={styles.greeting}>
        <span className={styles.avatar} aria-hidden="true">{initials}</span>
        <div><p>{dateLabel.charAt(0).toLocaleUpperCase("vi-VN") + dateLabel.slice(1)}</p><h1>Chào {snapshot.employee.display_name}</h1></div>
      </header>

      {shift && <section className={`${styles.card} ${styles.shiftCard}`} aria-label="Ca làm hôm nay">
        <span className={styles.shiftIcon}><Clock3 aria-hidden size={18} /></span>
        <div>
          <strong>{shift.open ? `Đã vào ca lúc ${formatClock(shift.open)}` : shift.done ? `Đã ra ca lúc ${formatClock(shift.done.out)}` : "Chưa vào ca"}</strong>
          <small>{shift.shift ?? "Không theo ca"}</small>
        </div>
        {!shift.done && <ClockPanel clockedIn={Boolean(shift.open)} requireLocation={shift.requireLocation} compact />}
      </section>}

      {current ? <section className={styles.currentJob} aria-label="Việc đang làm">
        <div className={styles.currentTop}><span>{jobStateLabel(current).toLocaleUpperCase("vi-VN")} · {current.number}</span>{current.scheduled_start && <span>Hẹn {timeOf(current.scheduled_start)}</span>}</div>
        <div><h2>{current.customer_name ?? current.title ?? current.number}</h2><p>{current.address ?? current.site_name ?? "Địa điểm đang cập nhật"}</p></div>
        <JobSteps job={current} tone="onBlue" />
        <div className={styles.quickActions}>
          {current.receiver_phone ? <a className={styles.quickAction} href={telHref(current.receiver_phone)}><Phone aria-hidden size={17} />Gọi</a>
            : <span className={styles.quickAction} aria-disabled="true"><Phone aria-hidden size={17} />Gọi</span>}
          {current.address ? <a className={styles.quickAction} href={directionsHref(current.address)} target="_blank" rel="noreferrer"><Navigation aria-hidden size={17} />Chỉ đường</a>
            : <span className={styles.quickAction} aria-disabled="true"><Navigation aria-hidden size={17} />Chỉ đường</span>}
          <Link className={`${styles.quickAction} ${styles.quickActionMain}`} href={"/work/jobs/" + current.id}>Mở việc</Link>
        </div>
      </section> : <section className={styles.card}><h2>Hôm nay chưa có việc</h2><p className={styles.hint}>Việc mới được phân sẽ hiện ở đây. Có thể nhận thêm ở mục Nhận việc.</p></section>}

      {rest.length > 0 && <section className={styles.card} aria-labelledby="next-today">
        <div className={styles.cardHead}><h2 id="next-today">Tiếp theo hôm nay</h2><span className={styles.hint}>{rest.length} việc</span></div>
        <ul className={styles.timeline}>{rest.map((job) => <NextJob key={job.id} job={job} />)}</ul>
      </section>}
      {later.length > 0 && <section className={styles.card} aria-labelledby="later">
        <div className={styles.cardHead}><h2 id="later">Sắp tới</h2><span className={styles.hint}>{later.length} việc</span></div>
        <ul className={styles.timeline}>{later.map((job) => <NextJob key={job.id} job={job} />)}</ul>
      </section>}

      {snapshot.pool.length > 0 && <Link className={styles.poolHint} href="/work/pool"><PlusCircle aria-hidden size={18} /><span>Có {snapshot.pool.length} việc mới có thể nhận</span>Xem</Link>}
    </div>
  );
}
