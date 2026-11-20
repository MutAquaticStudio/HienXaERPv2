import { WxChip, WxEmpty, WxHead } from "@/components/astryx/work-kit";
import { ClockPanel } from "@/modules/attendance/forms";
import { attendanceMark, attendanceStatusLabel, formatClock, formatMinutes, formatWorkDay, weekDayCell, weekdayLabel } from "@/modules/attendance/presentation";

export type AxAttendanceRecord = {
  id: string; work_date: string; status: string; clock_in_at: string | null; clock_out_at: string | null;
  late_minutes: number; early_minutes: number; overtime_minutes: number; auto_closed_at: string | null;
};
export type AxWeekDay = { date: string; planned: string[]; clocked: { status: string; clock_in_at: string | null; clock_out_at: string | null }[] };

/** "Chấm công" kiểu Astryx: ca hôm nay + Vào ca / Ra ca (biểu mẫu Classic), tổng kết tháng, lịch tuần, lịch sử theo ngày có trạng thái bằng chữ. */
export function AstryxWorkAttendanceView({ heading, hint, clockedIn, requireLocation, forgotten, stats, week, today, monthRecords }: {
  heading: string; hint: string; clockedIn: boolean; requireLocation: boolean; today: string;
  forgotten: { work_date: string; clock_out_at: string | null } | null;
  stats: { workedDays: number; leaveDays: number; lateCount: number; overtime: number };
  week: AxWeekDay[]; monthRecords: AxAttendanceRecord[];
}) {
  return <div className="wx-page cols">
    <div className="wx-span"><WxHead sub="Chấm công hôm nay" title={heading} /></div>
    <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
      <section className="wx-card"><p className="wx-hint" style={{ marginBottom: 12 }}>{hint}</p><ClockPanel clockedIn={clockedIn} requireLocation={requireLocation} /></section>
      {forgotten && <section className="wx-card" role="status"><p><strong>Ca ngày {formatWorkDay(forgotten.work_date)} chưa được bấm “Ra ca”.</strong> Hệ thống đã khép ca lúc {formatClock(forgotten.clock_out_at)}, văn phòng sẽ kiểm tra lại giờ làm. Lần sau nhớ bấm “Ra ca” khi kết thúc.</p></section>}
      <section className="wx-stats" aria-label="Tháng này">
        <article className="wx-stat"><span>Ngày công</span><strong>{stats.workedDays}</strong></article>
        <article className="wx-stat"><span>Nghỉ có phép</span><strong>{stats.leaveDays}</strong></article>
        <article className="wx-stat"><span>Lần đi muộn</span><strong>{stats.lateCount}</strong></article>
        <article className="wx-stat"><span>Làm thêm</span><strong>{formatMinutes(stats.overtime)}</strong></article>
      </section>
      <section className="wx-card">
        <div className="wx-card-head"><h2>Lịch tuần này</h2></div>
        <ul className="wx-list">{week.map((day) => <li key={day.date} aria-current={day.date === today ? "date" : undefined}>
          <span className="m"><b>{weekdayLabel(day.date)} {day.date.slice(8, 10)}/{day.date.slice(5, 7)}</b>{day.date === today && <small>Hôm nay</small>}</span>
          <span style={{ textAlign: "right" }}>{weekDayCell(day.planned, day.clocked)}</span>
        </li>)}</ul>
      </section>
    </div>
    <section className="wx-card" style={{ alignSelf: "start" }}>
      <div className="wx-card-head"><h2>Chấm công tháng này</h2></div>
      {monthRecords.length ? <ul className="wx-list">{monthRecords.map((record) => {
        const mark = attendanceMark(record);
        const notes = [
          record.late_minutes ? `muộn ${formatMinutes(record.late_minutes)}` : "",
          record.early_minutes ? `về sớm ${formatMinutes(record.early_minutes)}` : "",
          record.overtime_minutes ? `làm thêm ${formatMinutes(record.overtime_minutes)}` : "",
          record.auto_closed_at ? "quên ra ca, đã khép tự động" : "",
        ].filter(Boolean).join(" · ");
        const warm = mark.tone === "warn" || mark.tone === "off" || Boolean(record.auto_closed_at);
        return <li key={record.id}>
          <span className="m"><b>{weekdayLabel(record.work_date)} {record.work_date.slice(8, 10)}/{record.work_date.slice(5, 7)}</b>
            <small>{record.status === "WORKED" ? `${formatClock(record.clock_in_at)} – ${record.clock_out_at ? formatClock(record.clock_out_at) : "chưa ra ca"}` : attendanceStatusLabel(record.status)}{notes ? ` · ${notes}` : ""}</small></span>
          <WxChip tone={warm ? "w" : mark.tone === "ok" ? "s" : "i"}>{record.auto_closed_at ? "Quên ra ca" : mark.tone === "ok" ? "Đủ công" : mark.tone === "warn" ? "Muộn / sớm" : mark.tone === "open" ? "Đang làm" : attendanceStatusLabel(record.status)}</WxChip>
        </li>;
      })}</ul> : <WxEmpty title="Tháng này chưa có ngày công" />}
    </section>
  </div>;
}
