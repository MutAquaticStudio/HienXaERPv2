import { requireInternalAccess } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import styles from "@/components/portal/portal.module.css";
import { ClockPanel } from "@/modules/attendance/forms";
import {
  addDays, attendanceMark, attendanceStatusLabel, formatClock, formatMinutes, formatShiftTime, weekdayLabel, weekStart,
} from "@/modules/attendance/presentation";

type Shift = { id: string; name: string; start_time: string; end_time: string };
type Assignment = { id: string; work_date: string; shift_id: string };
type AttendanceRow = {
  id: string; work_date: string; shift_id: string | null; status: string; clock_in_at: string | null; clock_out_at: string | null;
  worked_minutes: number; late_minutes: number; early_minutes: number; overtime_minutes: number;
};

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());

/** FB12 (D34a): "Chấm công" on the worker portal — Vào ca / Ra ca, today's shift, the week's schedule and the month's days. */
export default async function WorkAttendancePage() {
  const access = await requireInternalAccess("/work/login");
  const supabase = await createServerSupabase();
  const day = today();
  const monday = weekStart(day);
  const monthStart = `${day.slice(0, 7)}-01`;
  const from = monthStart < monday ? monthStart : monday;
  const [shiftsResult, assignmentsResult, recordsResult, settingsResult] = await Promise.all([
    supabase.from("work_shifts").select("id, name, start_time, end_time").eq("branch_id", access.branchId),
    supabase.from("shift_assignments").select("id, work_date, shift_id").eq("employee_id", access.employeeId).eq("branch_id", access.branchId)
      .is("cancelled_at", null).gte("work_date", monday).lte("work_date", addDays(monday, 6)).order("work_date"),
    supabase.from("attendance_records").select("id, work_date, shift_id, status, clock_in_at, clock_out_at, worked_minutes, late_minutes, early_minutes, overtime_minutes")
      .eq("employee_id", access.employeeId).gte("work_date", addDays(from, -1)).order("work_date", { ascending: false }),
    supabase.from("attendance_settings").select("require_location").eq("branch_id", access.branchId).maybeSingle(),
  ]);
  if (shiftsResult.error || assignmentsResult.error || recordsResult.error || settingsResult.error) {
    throw new Error("Không tải được chấm công. Vui lòng thử lại.");
  }
  const shifts = new Map((shiftsResult.data as Shift[]).map((shift) => [shift.id, shift]));
  const assignments = assignmentsResult.data as Assignment[];
  const records = recordsResult.data as AttendanceRow[];
  const open = records.find((record) => record.clock_in_at && !record.clock_out_at);
  const todayShifts = assignments.filter((item) => item.work_date === day);
  const monthRecords = records.filter((record) => record.work_date >= monthStart && record.work_date <= day);
  const workedDays = new Set(monthRecords.filter((record) => record.status === "WORKED" && record.clock_in_at).map((record) => record.work_date)).size;
  const leaveDays = monthRecords.filter((record) => record.status === "LEAVE_PAID").length;
  const lateCount = monthRecords.filter((record) => record.late_minutes > 0).length;
  const overtime = monthRecords.reduce((sum, record) => sum + record.overtime_minutes, 0);
  const shiftLabel = (id: string | null) => {
    const shift = id ? shifts.get(id) : undefined;
    return shift ? `${shift.name} · ${formatShiftTime(shift.start_time)}–${formatShiftTime(shift.end_time)}` : "Không theo ca";
  };

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <p className={styles.heroEyebrow}>Chấm công hôm nay</p>
        <h1>{open ? `Đang trong ca từ ${formatClock(open.clock_in_at)}` : todayShifts.length ? shiftLabel(todayShifts[0].shift_id) : "Hôm nay chưa xếp ca"}</h1>
        <p>{open ? "Bấm “Ra ca” khi kết thúc. Văn phòng duyệt và chốt ngày công cuối kỳ." : "Bấm “Vào ca” khi bắt đầu làm việc. Có thể vào sớm tối đa theo cài đặt của chi nhánh."}</p>
      </header>
      <section className={styles.card}>
        <ClockPanel clockedIn={Boolean(open)} requireLocation={Boolean(settingsResult.data?.require_location)} />
      </section>
      <section className={styles.statGrid} aria-label="Tháng này">
        <article className={styles.stat}><span>Ngày công</span><strong>{workedDays}</strong></article>
        <article className={styles.stat}><span>Nghỉ có phép</span><strong>{leaveDays}</strong></article>
        <article className={styles.stat}><span>Lần đi muộn</span><strong>{lateCount}</strong></article>
        <article className={styles.stat}><span>Làm thêm</span><strong>{formatMinutes(overtime)}</strong></article>
      </section>
      <section className={styles.card}>
        <h2>Lịch tuần này</h2>
        <ul className={styles.attendanceList}>
          {Array.from({ length: 7 }, (_, index) => addDays(monday, index)).map((date) => {
            const planned = assignments.filter((item) => item.work_date === date);
            return <li key={date} className={date === day ? styles.attendanceToday : undefined}>
              <span className={styles.attendanceDay}>{weekdayLabel(date)} {date.slice(8, 10)}/{date.slice(5, 7)}</span>
              <span>{planned.length ? planned.map((item) => shiftLabel(item.shift_id)).join(", ") : "Nghỉ"}</span>
            </li>;
          })}
        </ul>
      </section>
      <section className={styles.card}>
        <h2>Chấm công tháng này</h2>
        {monthRecords.length ? <ul className={styles.attendanceList}>
          {monthRecords.map((record) => {
            const mark = attendanceMark(record);
            const notes = [
              record.late_minutes ? `muộn ${formatMinutes(record.late_minutes)}` : "",
              record.early_minutes ? `về sớm ${formatMinutes(record.early_minutes)}` : "",
              record.overtime_minutes ? `làm thêm ${formatMinutes(record.overtime_minutes)}` : "",
            ].filter(Boolean).join(" · ");
            return <li key={record.id}>
              <span className={styles.attendanceDay}>{weekdayLabel(record.work_date)} {record.work_date.slice(8, 10)}/{record.work_date.slice(5, 7)}</span>
              <span>
                {record.status === "WORKED" ? `${formatClock(record.clock_in_at)} – ${record.clock_out_at ? formatClock(record.clock_out_at) : "chưa ra ca"}` : attendanceStatusLabel(record.status)}
                {notes && <small className={styles.hint}> · {notes}</small>}
              </span>
              <span className={`${styles.badge} ${mark.tone === "warn" || mark.tone === "off" ? styles.badgeWarm : ""}`}>{mark.tone === "ok" ? "Đủ công" : mark.tone === "warn" ? "Muộn / sớm" : mark.tone === "open" ? "Đang làm" : attendanceStatusLabel(record.status)}</span>
            </li>;
          })}
        </ul> : <p className={styles.empty}>Tháng này chưa có ngày công.</p>}
      </section>
    </div>
  );
}
