import Link from "next/link";

import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { activeTab, DetailTabs, type DetailTab } from "@/components/ui/detail-tabs";
import { FormDialog } from "@/components/ui/form-dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatBusinessDate, formatBusinessDateTime } from "@/lib/core/business-time";
import {
  AttendanceSettingsForm, CancelAssignmentForm, CloseAttendancePeriodForm, ReopenAttendancePeriodForm, ScheduleShiftsForm,
  WorkShiftForm, type PersonOption, type ShiftOption,
} from "@/modules/attendance/forms";
import { TimesheetGrid, type TimesheetPlan, type TimesheetRecord } from "@/modules/attendance/timesheet-grid";
import { addDays, formatShiftTime, monthDays, shiftMonth, weekdayLabel, weekStart } from "@/modules/attendance/presentation";

type Period = { id: string; period_start: string; period_end: string; closed_at: string; reopened_at: string | null; reopen_reason: string | null };
type Assignment = TimesheetPlan & { id: string };
type Query = { tab?: string; month?: string; week?: string };

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());

/** FB12 (D34a): "Chấm công" — bảng chấm công theo tháng, lịch làm việc theo tuần, ca làm việc, cài đặt và chốt kỳ. */
export default async function AttendancePage({ searchParams }: { searchParams: Promise<Query> }) {
  const access = await requireInternalPermission("attendance.read");
  const query = await searchParams;
  const canManage = access.permissions.has("attendance.manage");
  const day = today();
  const month = /^\d{4}-\d{2}$/.test(query.month ?? "") ? query.month! : day.slice(0, 7);
  const week = weekStart(/^\d{4}-\d{2}-\d{2}$/.test(query.week ?? "") ? query.week! : day);
  const tabs: DetailTab[] = [
    { id: "timesheet", label: "Bảng chấm công" },
    { id: "schedule", label: "Lịch làm việc" },
    { id: "shifts", label: "Ca làm việc" },
    { id: "periods", label: canManage ? "Chốt công & cài đặt" : "Kỳ đã chốt" },
  ];
  const tab = activeTab(tabs, query.tab);
  const days = monthDays(month);
  const range = tab === "schedule" ? { from: week, to: addDays(week, 6) } : { from: days[0], to: days[days.length - 1] };

  const supabase = await createServerSupabase();
  const [peopleResult, shiftsResult, recordsResult, plansResult, periodsResult, settingsResult, todayResult] = await Promise.all([
    supabase.from("workforce_read").select("id, display_name").eq("branch_id", access.branchId).eq("active", true).order("display_name"),
    supabase.from("work_shifts").select("id, code, name, start_time, end_time, break_minutes, active").eq("branch_id", access.branchId).order("start_time"),
    supabase.from("attendance_records").select("id, employee_id, work_date, shift_id, status, clock_in_at, clock_out_at, worked_minutes, late_minutes, early_minutes, overtime_minutes, note, source")
      .eq("branch_id", access.branchId).gte("work_date", range.from).lte("work_date", range.to),
    supabase.from("shift_assignments").select("id, employee_id, work_date, shift_id").eq("branch_id", access.branchId).is("cancelled_at", null)
      .gte("work_date", range.from).lte("work_date", range.to),
    supabase.from("attendance_periods").select("id, period_start, period_end, closed_at, reopened_at, reopen_reason").eq("branch_id", access.branchId)
      .order("period_start", { ascending: false }).limit(24),
    supabase.from("attendance_settings").select("late_grace_minutes, early_clock_in_minutes, standard_work_days, require_location").eq("branch_id", access.branchId).maybeSingle(),
    supabase.from("attendance_records").select("employee_id, status, clock_in_at, clock_out_at, late_minutes").eq("branch_id", access.branchId).eq("work_date", day),
  ]);
  if ([peopleResult, shiftsResult, recordsResult, plansResult, periodsResult, settingsResult, todayResult].some((result) => result.error)) {
    throw new Error("Không tải được chấm công. Vui lòng thử lại hoặc liên hệ quản trị viên.");
  }
  const people = [...new Map((peopleResult.data as PersonOption[]).map((person) => [person.id, person] as const)).values()];
  const shifts = shiftsResult.data as ShiftOption[];
  const records = recordsResult.data as TimesheetRecord[];
  const plans = plansResult.data as Assignment[];
  const periods = periodsResult.data as Period[];
  const settings = settingsResult.data ?? { late_grace_minutes: 10, early_clock_in_minutes: 60, standard_work_days: 26, require_location: false };
  const todayRows = todayResult.data ?? [];
  const lockedDays = days.filter((date) => periods.some((period) => !period.reopened_at && date >= period.period_start && date <= period.period_end));
  const todayPlanned = new Set(plans.filter((plan) => plan.work_date === day).map((plan) => plan.employee_id));
  const notYetIn = [...todayPlanned].filter((id) => !todayRows.some((row) => row.employee_id === id)).length;
  const href = (next: Partial<Query>) => {
    const params = new URLSearchParams();
    const merged = { tab, month, week, ...next };
    for (const [key, value] of Object.entries(merged)) if (value) params.set(key, value);
    return `/admin/attendance?${params}`;
  };
  const shiftName = (id: string) => shifts.find((shift) => shift.id === id)?.name ?? "Ca";

  return <>
    <header className="page-heading">
      <div><p className="eyebrow">Nhân công</p><h1>Chấm công</h1>
        <p className="lede">Nhân viên tự bấm Vào ca / Ra ca trên cổng nhân sự; văn phòng xem bảng chấm công, chấm hộ, sửa công và chốt kỳ để tính lương.</p></div>
      {canManage && <div className="action-cluster">
        {shifts.some((shift) => shift.active) && <FormDialog label="Xếp lịch" title="Xếp lịch làm việc" size="lg" buttonClassName="button button-secondary"
          description="Chọn ca, khoảng ngày, các ngày trong tuần và nhân viên. Ngày đã có lịch ca này được giữ nguyên.">
          <ScheduleShiftsForm shifts={shifts} people={people} from={week} to={addDays(week, 6)} /></FormDialog>}
        <FormDialog label="Thêm ca" title="Thêm ca làm việc" buttonClassName="button button-primary"><WorkShiftForm /></FormDialog>
      </div>}
    </header>
    <section className="metric-grid" aria-label="Hôm nay">
      <article className="card metric-card"><span className="metric-label">Đang trong ca</span><strong className="metric-value">{todayRows.filter((row) => row.clock_in_at && !row.clock_out_at).length}</strong></article>
      <article className="card metric-card"><span className="metric-label">Đi muộn hôm nay</span><strong className={`metric-value${todayRows.some((row) => row.late_minutes > 0) ? " text-danger" : ""}`}>{todayRows.filter((row) => row.late_minutes > 0).length}</strong></article>
      <article className="card metric-card"><span className="metric-label">Có lịch, chưa vào ca</span><strong className="metric-value">{tab === "schedule" || month === day.slice(0, 7) ? notYetIn : "—"}</strong></article>
      <article className="card metric-card"><span className="metric-label">Nghỉ hôm nay</span><strong className="metric-value">{todayRows.filter((row) => row.status !== "WORKED").length}</strong></article>
    </section>
    <DetailTabs tabs={tabs} active={tab} href={(id) => href({ tab: id })} label="Chấm công" />

    {tab === "timesheet" && <section className="card">
      <div className="section-head">
        <h2>Bảng chấm công tháng {month.slice(5, 7)}/{month.slice(0, 4)}</h2>
        <nav className="action-cluster" aria-label="Chọn tháng">
          <Link className="button button-secondary button-compact" href={href({ month: shiftMonth(month, -1) })}>‹ Tháng trước</Link>
          {month !== day.slice(0, 7) && <Link className="button button-secondary button-compact" href={href({ month: day.slice(0, 7) })}>Tháng này</Link>}
          <Link className="button button-secondary button-compact" href={href({ month: shiftMonth(month, 1) })}>Tháng sau ›</Link>
        </nav>
      </div>
      {people.length ? <TimesheetGrid days={days} people={people} records={records} plans={plans} shifts={shifts} lockedDays={lockedDays} today={day} canManage={canManage} />
        : <p className="empty-inline">Chi nhánh chưa có nhân viên đang làm việc.</p>}
    </section>}

    {tab === "schedule" && <section className="card">
      <div className="section-head">
        <h2>Tuần {formatBusinessDate(week)} – {formatBusinessDate(addDays(week, 6))}</h2>
        <nav className="action-cluster" aria-label="Chọn tuần">
          <Link className="button button-secondary button-compact" href={href({ week: addDays(week, -7) })}>‹ Tuần trước</Link>
          {week !== weekStart(day) && <Link className="button button-secondary button-compact" href={href({ week: weekStart(day) })}>Tuần này</Link>}
          <Link className="button button-secondary button-compact" href={href({ week: addDays(week, 7) })}>Tuần sau ›</Link>
        </nav>
      </div>
      {!shifts.length && <p className="empty-inline">Chưa có ca làm việc. Bấm “Thêm ca” để tạo ca (ví dụ Ca sáng 07:00–11:30).</p>}
      {shifts.length > 0 && <div className="table-wrap"><table className="attendance-schedule">
        <thead><tr><th scope="col">Nhân viên</th>{Array.from({ length: 7 }, (_, index) => addDays(week, index)).map((date) =>
          <th scope="col" key={date} className={date === day ? "attendance-today" : undefined}>{weekdayLabel(date)} {date.slice(8, 10)}/{date.slice(5, 7)}</th>)}</tr></thead>
        <tbody>{people.map((person) => <tr key={person.id}>
          <th scope="row">{person.display_name}</th>
          {Array.from({ length: 7 }, (_, index) => addDays(week, index)).map((date) => {
            const own = plans.filter((plan) => plan.employee_id === person.id && plan.work_date === date);
            return <td key={date}>{own.map((plan) => canManage
              ? <FormDialog key={plan.id} label={shiftName(plan.shift_id)} title={`Bỏ ${shiftName(plan.shift_id)} của ${person.display_name}`} buttonClassName="shift-chip"
                description={`Ngày ${formatBusinessDate(date)}. Ngày công đã chấm (nếu có) vẫn giữ.`}><CancelAssignmentForm assignmentId={plan.id} /></FormDialog>
              : <span className="shift-chip" key={plan.id}>{shiftName(plan.shift_id)}</span>)}</td>;
          })}
        </tr>)}</tbody>
      </table></div>}
    </section>}

    {tab === "shifts" && <section className="card">
      <div className="section-head"><h2>Ca làm việc</h2><span className="scope-chip">Cho phép đi muộn {settings.late_grace_minutes} phút · vào sớm {settings.early_clock_in_minutes} phút</span></div>
      <div className="table-wrap"><table>
        <thead><tr><th>Mã</th><th>Tên ca</th><th>Giờ làm</th><th>Nghỉ giữa ca</th><th>Trạng thái</th><th></th></tr></thead>
        <tbody>{shifts.map((shift) => <tr key={shift.id}>
          <td className="mono">{shift.code}</td><td>{shift.name}</td>
          <td className="mono">{formatShiftTime(shift.start_time)} – {formatShiftTime(shift.end_time)}{shift.end_time <= shift.start_time && <small className="table-subline">Qua đêm</small>}</td>
          <td>{shift.break_minutes} phút</td>
          <td><StatusBadge tone={shift.active ? "success" : "warning"}>{shift.active ? "Đang dùng" : "Ngừng dùng"}</StatusBadge></td>
          <td className="table-actions">{canManage && <FormDialog label="Sửa" title={`Sửa ${shift.name}`} buttonClassName="button button-secondary button-compact"><WorkShiftForm shift={shift} /></FormDialog>}</td>
        </tr>)}</tbody>
      </table>{!shifts.length && <p className="empty-inline">Chưa có ca làm việc.</p>}</div>
    </section>}

    {tab === "periods" && <div className="two-column">
      <section className="card">
        <div className="section-head"><h2>Kỳ chấm công đã chốt</h2>
          {canManage && <FormDialog label="Chốt chấm công" title="Chốt chấm công" buttonClassName="button button-primary button-compact"
            description="Văn phòng duyệt bảng chấm công rồi chốt kỳ; bảng lương dùng ngày công đã chốt.">
            <CloseAttendancePeriodForm from={days[0]} to={days[days.length - 1]} /></FormDialog>}</div>
        <div className="table-wrap"><table>
          <thead><tr><th>Kỳ</th><th>Chốt lúc</th><th>Trạng thái</th><th></th></tr></thead>
          <tbody>{periods.map((period) => <tr key={period.id}>
            <td>{formatBusinessDate(period.period_start)} – {formatBusinessDate(period.period_end)}</td>
            <td>{formatBusinessDateTime(period.closed_at)}</td>
            <td><StatusBadge tone={period.reopened_at ? "warning" : "success"}>{period.reopened_at ? "Đã mở lại" : "Đã chốt"}</StatusBadge>
              {period.reopen_reason && <small className="table-subline">{period.reopen_reason}</small>}</td>
            <td className="table-actions">{canManage && !period.reopened_at && <FormDialog label="Mở lại" title="Mở lại kỳ chấm công" buttonClassName="button button-secondary button-compact"
              description="Mở lại để sửa ngày công; lý do được ghi vào lịch sử."><ReopenAttendancePeriodForm periodId={period.id} /></FormDialog>}</td>
          </tr>)}</tbody>
        </table>{!periods.length && <p className="empty-inline">Chưa chốt kỳ nào.</p>}</div>
      </section>
      {canManage && <section className="card card-pad">
        <h2>Cài đặt chấm công</h2>
        <AttendanceSettingsForm settings={settings} />
      </section>}
    </div>}
  </>;
}
