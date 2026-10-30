import { formatPortalMoney as money } from "@/modules/portal/money";
import { formatBusinessDate } from "@/lib/core/business-time";
import { earningStateLabel, earningKindLabel } from "@/modules/portal/presentation";
import styles from "@/components/portal/portal.module.css";
import { getWorkerPortalSnapshot } from "@/modules/portal/actions";
import { requireInternalAccess } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { componentKindLabel } from "@/modules/payroll/presentation";
import { addDays, weekStart } from "@/modules/attendance/presentation";
import { attendanceWeek, monthEarnings } from "@/modules/portal/earnings";

type Payslip = {
  id: string; work_days: string; standard_work_days: string; base_amount_vnd: string; overtime_amount_vnd: string; allowance_vnd: string;
  bonus_vnd: string; deduction_vnd: string; manual_bonus_vnd: string; manual_deduction_vnd: string; manual_note: string | null; net_pay_vnd: string;
  details: Array<{ code: string; name: string; kind: string; amount_vnd: string }>;
  earning_event_id: string | null;
  payroll_periods: { name: string; period_start: string; period_end: string } | null;
};
type DayRecord = { work_date: string; status: string; clock_in_at: string | null; clock_out_at: string | null; late_minutes: number; early_minutes: number; overtime_minutes: number };

/** Concept cổng thợ "Thu nhập & chấm công": this month's estimate split by kind, the week's attendance, closed payslips. */
export default async function WorkEarningsPage() {
  const access = await requireInternalAccess("/work/login");
  const snapshot = await getWorkerPortalSnapshot();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  const month = monthEarnings(snapshot.earnings, today.slice(0, 7));
  const monday = weekStart(today);
  // FB12 (D34b): the person's closed payslips (the database shows nothing else).
  const supabase = await createServerSupabase();
  const [slipsResult, recordsResult, plannedResult] = await Promise.all([
    supabase.from("payroll_lines")
      .select("id, work_days::text, standard_work_days::text, base_amount_vnd::text, overtime_amount_vnd::text, allowance_vnd::text, bonus_vnd::text, deduction_vnd::text, manual_bonus_vnd::text, manual_deduction_vnd::text, manual_note, net_pay_vnd::text, details, earning_event_id, payroll_periods(name, period_start, period_end)")
      .eq("employee_id", access.employeeId).eq("included", true).limit(12),
    supabase.from("attendance_records").select("work_date, status, clock_in_at, clock_out_at, late_minutes, early_minutes, overtime_minutes")
      .eq("employee_id", access.employeeId).gte("work_date", monday).lte("work_date", addDays(monday, 6)),
    supabase.from("shift_assignments").select("work_date").eq("employee_id", access.employeeId).is("cancelled_at", null)
      .gte("work_date", monday).lte("work_date", addDays(monday, 6)),
  ]);
  const payslips = ((slipsResult.data ?? []) as unknown as Payslip[]).sort((a, b) => (b.payroll_periods?.period_start ?? "").localeCompare(a.payroll_periods?.period_start ?? ""));
  // A payslip is paid when the salary payable behind it has nothing left to pay.
  const slipEvents = payslips.map((slip) => slip.earning_event_id).filter((id): id is string => Boolean(id));
  const outstanding = new Map<string, string>();
  if (slipEvents.length) {
    const { data } = await supabase.from("earning_event_read").select("id, outstanding_amount_vnd::text").in("id", slipEvents);
    for (const row of (data ?? []) as Array<{ id: string; outstanding_amount_vnd: string }>) outstanding.set(row.id, row.outstanding_amount_vnd);
  }
  const week = attendanceWeek(monday, today, (recordsResult.data ?? []) as DayRecord[], ((plannedResult.data ?? []) as Array<{ work_date: string }>).map((row) => row.work_date));
  const lateNotes = week.days.filter((day) => day.note);
  const [year, mon] = today.split("-");
  return (
    <div className={styles.page}>
      <header className={styles.earningHead}>
        <p>Tháng {Number(mon)}/{year} · tạm tính</p>
        <h1>Thu nhập của tôi</h1>
      </header>
      <section className={styles.earningCard} aria-label="Dự kiến nhận tháng này">
        <div><p>Dự kiến nhận</p><strong>{money(month.total)}</strong></div>
        <div className={styles.earningTiles}>
          <span><small>Lương ngày công</small><b>{money(month.time)}</b></span>
          <span><small>Tiền chuyến · {month.tripCount}</small><b>{money(month.trips)}</b></span>
          <span><small>Thưởng / khác</small><b>{money(month.other)}</b></span>
        </div>
      </section>
      <section className={styles.card} aria-labelledby="week-title">
        <div className={styles.sectionHead}><h2 id="week-title">Chấm công tuần này</h2><span className={styles.hint}>{week.worked} / {week.scheduled} ngày</span></div>
        <ol className={styles.weekStrip}>{week.days.map((day) => <li key={day.date} data-tone={day.tone} aria-current={day.date === today ? "date" : undefined}>
          {day.weekday}<span title={day.note}>{day.day}</span>
        </li>)}</ol>
        {lateNotes.map((day) => <p key={day.date} className={styles.weekNote}><b>{day.weekday}:</b> {day.note}</p>)}
      </section>
      {payslips.length > 0 && <section className={styles.card}>
        <h2>Phiếu lương đã chốt</h2>
        <ul className={styles.slipList}>{payslips.map((slip) => {
          const left = slip.earning_event_id ? outstanding.get(slip.earning_event_id) : undefined;
          const paid = left === "0";
          return <li key={slip.id}>
          <details className={styles.payslip}>
            <summary><span><span className={styles.attendanceDay}>{slip.payroll_periods?.name ?? "Kỳ lương"}</span>
              <small data-paid={paid ? "true" : undefined}>{paid ? "Đã chi trả" : left ? `Chờ chi trả ${money(left)}` : "Đã chốt"}</small></span> <strong>{money(slip.net_pay_vnd)}</strong></summary>
            <p className={styles.hint}>{slip.payroll_periods ? `${formatBusinessDate(slip.payroll_periods.period_start)} – ${formatBusinessDate(slip.payroll_periods.period_end)}` : ""} · ngày công {slip.work_days}/{slip.standard_work_days}</p>
            <dl>
              <dt>Lương chính</dt><dd>{money(slip.base_amount_vnd)}</dd>
              <dt>Làm thêm giờ</dt><dd>{money(slip.overtime_amount_vnd)}</dd>
              {slip.details.map((item) => <div key={item.code}><dt>{componentKindLabel(item.kind)}: {item.name}</dt><dd>{item.kind === "DEDUCTION" ? "−" : ""}{money(item.amount_vnd)}</dd></div>)}
              {slip.manual_bonus_vnd !== "0" && <div><dt>Cộng thêm</dt><dd>{money(slip.manual_bonus_vnd)}</dd></div>}
              {slip.manual_deduction_vnd !== "0" && <div><dt>Trừ{slip.manual_note ? ` (${slip.manual_note})` : ""}</dt><dd>−{money(slip.manual_deduction_vnd)}</dd></div>}
              <dt>Thực lĩnh</dt><dd><strong>{money(slip.net_pay_vnd)}</strong></dd>
            </dl>
          </details>
        </li>;
        })}</ul>
      </section>}
      <section className={styles.card} aria-labelledby="earning-list">
        <h2 id="earning-list">Các khoản tháng này</h2>
        {month.items.length ? <ul className={styles.timeline}>{month.items.map((item) => <li key={item.id} className={styles.earningRow}>
          <span><strong>{earningKindLabel(item.type)}</strong><small>{item.occurred_at ? formatBusinessDate(item.occurred_at) : ""} · {earningStateLabel(item.state)}</small></span>
          <strong>{money(item.amount_vnd)}</strong>
        </li>)}</ul> : <p className={styles.empty}>Tháng này chưa có khoản thu nhập được ghi nhận.</p>}
      </section>
    </div>
  );
}
