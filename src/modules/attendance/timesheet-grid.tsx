"use client";

// FB12 (D34a): "Bảng chấm công" like KiotViet — one row per person, one column per day of the month, a mark per cell
// (✓ đủ công, ✓ cam muộn / về sớm, P nghỉ có phép, KP nghỉ không phép, V vắng, ca đã xếp chưa chấm). A click opens one popup
// to chấm hộ or sửa công; days of a closed period stay read-only.
import { useState } from "react";

import { Dialog } from "@/components/ui/dialog";
import { AttendanceCellForm, type AttendanceDraft, type PersonOption, type ShiftOption } from "@/modules/attendance/forms";
import {
  attendanceMark, attendanceStatusLabel, formatClock, formatMinutes, formatShiftTime, weekdayLabel,
} from "@/modules/attendance/presentation";

export type TimesheetRecord = {
  id: string; employee_id: string; work_date: string; shift_id: string | null; status: string;
  clock_in_at: string | null; clock_out_at: string | null; worked_minutes: number; late_minutes: number;
  early_minutes: number; overtime_minutes: number; note: string | null; source: string;
};
export type TimesheetPlan = { employee_id: string; work_date: string; shift_id: string };

export function TimesheetGrid({ days, people, records, plans, shifts, lockedDays, today, canManage }: {
  days: string[]; people: PersonOption[]; records: TimesheetRecord[]; plans: TimesheetPlan[]; shifts: ShiftOption[];
  lockedDays: string[]; today: string; canManage: boolean;
}) {
  const [editing, setEditing] = useState<{ draft: AttendanceDraft; name: string; detail?: TimesheetRecord } | null>(null);
  const locked = new Set(lockedDays);
  const byCell = new Map<string, TimesheetRecord[]>();
  for (const record of records) {
    const key = `${record.employee_id}|${record.work_date}`;
    byCell.set(key, [...(byCell.get(key) ?? []), record]);
  }
  const planned = new Map<string, TimesheetPlan[]>();
  for (const plan of plans) {
    const key = `${plan.employee_id}|${plan.work_date}`;
    planned.set(key, [...(planned.get(key) ?? []), plan]);
  }
  const shiftById = new Map(shifts.map((shift) => [shift.id, shift]));

  function open(person: PersonOption, day: string) {
    const record = byCell.get(`${person.id}|${day}`)?.[0];
    const plan = planned.get(`${person.id}|${day}`)?.[0];
    const shiftId = record ? record.shift_id : plan?.shift_id ?? null;
    const shift = shiftId ? shiftById.get(shiftId) : undefined;
    setEditing({
      name: person.display_name,
      detail: record,
      draft: {
        employeeId: person.id, day, shiftId, status: record?.status ?? "WORKED",
        clockIn: record?.clock_in_at ? formatClock(record.clock_in_at) : shift ? formatShiftTime(shift.start_time) : "",
        clockOut: record?.clock_out_at ? formatClock(record.clock_out_at) : shift && !record ? formatShiftTime(shift.end_time) : "",
        note: record?.note ?? "",
      },
    });
  }

  return <>
    <div className="table-wrap attendance-grid-wrap">
      <table className="attendance-grid">
        <thead><tr>
          <th scope="col" className="attendance-name">Nhân viên</th>
          {days.map((day) => <th scope="col" key={day} className={day === today ? "attendance-today" : undefined}>
            <span>{weekdayLabel(day)}</span>{day.slice(8, 10)}
          </th>)}
          <th scope="col">Công</th><th scope="col">Phép</th><th scope="col">Muộn</th><th scope="col">Làm thêm</th>
        </tr></thead>
        <tbody>{people.map((person) => {
          const own = records.filter((record) => record.employee_id === person.id);
          const worked = new Set(own.filter((record) => record.status === "WORKED" && record.clock_in_at).map((record) => record.work_date)).size;
          return <tr key={person.id}>
            <th scope="row" className="attendance-name">{person.display_name}</th>
            {days.map((day) => {
              const cell = byCell.get(`${person.id}|${day}`) ?? [];
              const plan = planned.get(`${person.id}|${day}`) ?? [];
              const mark = cell[0] ? attendanceMark(cell[0]) : null;
              const title = cell.length
                ? cell.map((record) => record.status === "WORKED" ? `${formatClock(record.clock_in_at)}–${record.clock_out_at ? formatClock(record.clock_out_at) : "…"}` : attendanceStatusLabel(record.status)).join(", ")
                : plan.length ? `Đã xếp: ${plan.map((item) => shiftById.get(item.shift_id)?.name ?? "ca").join(", ")}` : "Chưa có lịch";
              const content = mark ? mark.mark : plan.length ? "·" : "";
              const className = `attendance-cell${mark ? ` tone-${mark.tone}` : plan.length ? " tone-planned" : ""}${locked.has(day) ? " is-locked" : ""}`;
              return <td key={day} className={className}>
                {canManage && !locked.has(day)
                  ? <button type="button" title={title} aria-label={`${person.display_name} ngày ${day.slice(8, 10)}/${day.slice(5, 7)}: ${title}`} onClick={() => open(person, day)}>{content}</button>
                  : <span title={locked.has(day) ? `${title} (đã chốt)` : title}>{content}</span>}
              </td>;
            })}
            <td className="mono">{worked}</td>
            <td className="mono">{own.filter((record) => record.status === "LEAVE_PAID").length}</td>
            <td className="mono">{own.filter((record) => record.late_minutes > 0).length}</td>
            <td className="mono">{own.some((record) => record.overtime_minutes) ? formatMinutes(own.reduce((sum, record) => sum + record.overtime_minutes, 0)) : "—"}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    <p className="attendance-legend muted">
      <span className="tone-ok">✓</span> Đủ công · <span className="tone-warn">✓</span> Muộn / về sớm · <span className="tone-open">Đang làm</span> ·
      {" "}<span className="tone-leave">P</span> Nghỉ có phép · <span className="tone-off">KP</span> Nghỉ không phép · <span className="tone-off">V</span> Vắng ·
      {" "}<span className="tone-planned">·</span> Đã xếp ca, chưa chấm{canManage ? " · Bấm vào ô để chấm hộ hoặc sửa công." : ""}
    </p>
    {editing && <Dialog title={`Chấm công ${editing.name}`} eyebrow={`Ngày ${editing.draft.day.slice(8, 10)}/${editing.draft.day.slice(5, 7)}/${editing.draft.day.slice(0, 4)}`}
      description={editing.detail ? <>
        {editing.detail.source === "WORKER" ? "Nhân viên tự chấm" : "Văn phòng chấm"}
        {editing.detail.late_minutes ? ` · muộn ${formatMinutes(editing.detail.late_minutes)}` : ""}
        {editing.detail.early_minutes ? ` · về sớm ${formatMinutes(editing.detail.early_minutes)}` : ""}
        {editing.detail.overtime_minutes ? ` · làm thêm ${formatMinutes(editing.detail.overtime_minutes)}` : ""}
        {editing.detail.worked_minutes ? ` · làm ${formatMinutes(editing.detail.worked_minutes)}` : ""}
      </> : "Chưa có chấm công ngày này."}
      onClose={() => setEditing(null)}>
      <AttendanceCellForm key={`${editing.draft.employeeId}-${editing.draft.day}`} draft={editing.draft} shifts={shifts} onSaved={() => setEditing(null)} />
    </Dialog>}
  </>;
}
