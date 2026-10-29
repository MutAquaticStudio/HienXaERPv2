"use client";

// FB12 (D34a): forms of "Chấm công". Each keeps one operation id per attempt (a retry after a lost answer replays, never
// records twice) and takes a new one after a success; inside a popup a success closes it.
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";

import { useCloseFormDialog } from "@/components/ui/form-dialog";
import {
  cancelShiftAssignmentAction, clockAttendanceAction, closeAttendancePeriodAction, reopenAttendancePeriodAction,
  saveAttendanceAction, saveAttendanceSettingsAction, saveWorkShiftAction, scheduleShiftsAction, type AttendanceFormState,
} from "@/modules/attendance/actions";
import { ATTENDANCE_STATUSES, attendanceStatusLabel } from "@/modules/attendance/presentation";
import styles from "@/components/portal/portal.module.css";

type Action = (state: AttendanceFormState, form: FormData) => Promise<AttendanceFormState>;

/** The form state, its submit and one operation id per attempt, renewed once the command succeeded. */
function useCommand(action: Action) {
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const [state, run, pending] = useActionState(async (previous: AttendanceFormState, form: FormData) => {
    const outcome = await action(previous, form);
    if (outcome?.success) setOperationId(crypto.randomUUID());
    return outcome;
  }, undefined);
  return { state, run, pending, operationId };
}

function CommandForm({ action, submit, danger, children, onSaved, className = "command-panel" }: {
  action: Action; submit: string; danger?: boolean; children: ReactNode; onSaved?: () => void; className?: string;
}) {
  const { state, run, pending, operationId } = useCommand(action);
  const dialogClose = useCloseFormDialog();
  const close = onSaved ?? dialogClose;
  useEffect(() => { if (state?.success && close) close(); }, [state, close]);
  return <form action={run} className={className}>
    <input type="hidden" name="operationId" value={operationId} />
    {children}
    {state?.message && <p className={`form-message${state.success ? " success" : ""}`} role="status">{state.message}</p>}
    <button className={`button ${danger ? "button-danger" : "button-primary"}`} disabled={pending}>{pending ? "Đang lưu…" : submit}</button>
  </form>;
}

/** The worker's big "Vào ca" / "Ra ca" button; the phone's position is sent when the person allows it (never required unless the branch asks). */
export function ClockPanel({ clockedIn, requireLocation }: { clockedIn: boolean; requireLocation: boolean }) {
  const { state, run, pending, operationId } = useCommand(clockAttendanceAction);
  const [locating, setLocating] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const lat = useRef<HTMLInputElement>(null);
  const lng = useRef<HTMLInputElement>(null);
  const kind = clockedIn ? "OUT" : "IN";

  function submitWithPosition() {
    if (!("geolocation" in navigator)) { form.current?.requestSubmit(); return; }
    setLocating(true);
    // Submit once: with the position, or without it on refusal, error, or when the permission prompt is left unanswered.
    let sent = false;
    const send = (position?: GeolocationPosition) => {
      if (sent) return;
      sent = true;
      window.clearTimeout(fallback);
      if (position && lat.current && lng.current) {
        lat.current.value = position.coords.latitude.toFixed(6);
        lng.current.value = position.coords.longitude.toFixed(6);
      }
      setLocating(false);
      form.current?.requestSubmit();
    };
    const fallback = window.setTimeout(() => send(), 10000);
    navigator.geolocation.getCurrentPosition(send, () => send(), { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 });
  }

  return <form action={run} ref={form} className={styles.form}>
    <input type="hidden" name="operationId" value={operationId} />
    <input type="hidden" name="kind" value={kind} />
    <input type="hidden" name="lat" ref={lat} defaultValue="" />
    <input type="hidden" name="lng" ref={lng} defaultValue="" />
    <button type="button" className={`${styles.button} ${styles.clockButton} ${clockedIn ? styles.clockOut : ""}`} disabled={pending || locating} onClick={submitWithPosition}>
      {locating ? "Đang lấy vị trí…" : pending ? "Đang chấm công…" : clockedIn ? "Ra ca" : "Vào ca"}
    </button>
    <p className={styles.hint}>{requireLocation ? "Chi nhánh yêu cầu bật định vị khi chấm công." : "Vị trí được ghi kèm nếu bạn cho phép; không bắt buộc."}</p>
    {state?.message && <p className={styles.status} role="status">{state.message}</p>}
  </form>;
}

export type ShiftOption = { id: string; code: string; name: string; start_time: string; end_time: string; break_minutes: number; active: boolean };
export type PersonOption = { id: string; display_name: string };

export function WorkShiftForm({ shift }: { shift?: ShiftOption }) {
  return <CommandForm action={saveWorkShiftAction} submit={shift ? "Lưu ca" : "Thêm ca"}>
    {shift && <input type="hidden" name="shiftId" value={shift.id} />}
    <div className="form-grid">
      <div className="field"><label htmlFor={`code-${shift?.id ?? "new"}`}>Mã ca</label><input id={`code-${shift?.id ?? "new"}`} name="code" defaultValue={shift?.code} placeholder="SANG" maxLength={24} required /></div>
      <div className="field"><label htmlFor={`name-${shift?.id ?? "new"}`}>Tên ca</label><input id={`name-${shift?.id ?? "new"}`} name="name" defaultValue={shift?.name} placeholder="Ca sáng" maxLength={80} required /></div>
      <div className="field"><label htmlFor={`start-${shift?.id ?? "new"}`}>Giờ bắt đầu</label><input id={`start-${shift?.id ?? "new"}`} type="time" name="startTime" defaultValue={shift?.start_time.slice(0, 5) ?? "07:00"} required /></div>
      <div className="field"><label htmlFor={`end-${shift?.id ?? "new"}`}>Giờ kết thúc</label><input id={`end-${shift?.id ?? "new"}`} type="time" name="endTime" defaultValue={shift?.end_time.slice(0, 5) ?? "17:00"} required /></div>
      <div className="field"><label htmlFor={`break-${shift?.id ?? "new"}`}>Nghỉ giữa ca (phút)</label><input id={`break-${shift?.id ?? "new"}`} type="number" name="breakMinutes" min={0} max={600} defaultValue={shift?.break_minutes ?? 60} required /></div>
      {shift && <label className="check-inline"><input type="checkbox" name="active" defaultChecked={shift.active} /> Đang dùng</label>}
    </div>
    <p className="muted">Giờ kết thúc sớm hơn giờ bắt đầu là ca qua đêm (kết thúc ngày hôm sau).</p>
  </CommandForm>;
}

const weekdayOptions = [[1, "T2"], [2, "T3"], [3, "T4"], [4, "T5"], [5, "T6"], [6, "T7"], [7, "CN"]] as const;

export function ScheduleShiftsForm({ shifts, people, from, to }: { shifts: ShiftOption[]; people: PersonOption[]; from: string; to: string }) {
  return <CommandForm action={scheduleShiftsAction} submit="Xếp lịch">
    <div className="form-grid">
      <div className="field"><label htmlFor="schedule-shift">Ca làm việc</label><select id="schedule-shift" name="shiftId" required>
        {shifts.filter((shift) => shift.active).map((shift) => <option key={shift.id} value={shift.id}>{shift.name} ({shift.start_time.slice(0, 5)}–{shift.end_time.slice(0, 5)})</option>)}
      </select></div>
      <div className="field"><label htmlFor="schedule-from">Từ ngày</label><input id="schedule-from" type="date" name="fromDate" defaultValue={from} required /></div>
      <div className="field"><label htmlFor="schedule-to">Đến ngày</label><input id="schedule-to" type="date" name="toDate" defaultValue={to} required /></div>
    </div>
    <fieldset className="check-row attendance-choices"><legend>Lặp lại vào</legend>
      {weekdayOptions.map(([value, label]) => <label key={value}><input type="checkbox" name="weekday" value={value} defaultChecked={value <= 6} /> {label}</label>)}
    </fieldset>
    <fieldset className="check-row attendance-choices attendance-people"><legend>Nhân viên</legend>
      {people.map((person) => <label key={person.id}><input type="checkbox" name="employeeId" value={person.id} /> {person.display_name}</label>)}
    </fieldset>
  </CommandForm>;
}

export function CancelAssignmentForm({ assignmentId }: { assignmentId: string }) {
  return <CommandForm action={cancelShiftAssignmentAction} submit="Bỏ ca này" danger>
    <input type="hidden" name="assignmentId" value={assignmentId} />
  </CommandForm>;
}

export type AttendanceDraft = {
  employeeId: string; day: string; shiftId: string | null; status: string; clockIn: string; clockOut: string; note: string;
};

/** "Chấm công" popup of one cell: worked with the hours, or a leave / absence. */
export function AttendanceCellForm({ draft, shifts, onSaved }: { draft: AttendanceDraft; shifts: ShiftOption[]; onSaved?: () => void }) {
  const [status, setStatus] = useState(draft.status);
  const key = `${draft.employeeId}-${draft.day}-${draft.shiftId ?? "none"}`;
  return <CommandForm action={saveAttendanceAction} submit="Lưu chấm công" onSaved={onSaved}>
    <input type="hidden" name="employeeId" value={draft.employeeId} />
    <input type="hidden" name="day" value={draft.day} />
    <div className="form-grid">
      <div className="field"><label htmlFor={`shift-${key}`}>Ca</label><select id={`shift-${key}`} name="shiftId" defaultValue={draft.shiftId ?? ""}>
        <option value="">Không theo ca</option>
        {shifts.map((shift) => <option key={shift.id} value={shift.id}>{shift.name} ({shift.start_time.slice(0, 5)}–{shift.end_time.slice(0, 5)})</option>)}
      </select></div>
      <div className="field"><label htmlFor={`status-${key}`}>Trạng thái</label><select id={`status-${key}`} name="status" value={status} onChange={(event) => setStatus(event.target.value)}>
        {ATTENDANCE_STATUSES.map((item) => <option key={item} value={item}>{attendanceStatusLabel(item)}</option>)}
      </select></div>
      {status === "WORKED" && <>
        <div className="field"><label htmlFor={`in-${key}`}>Giờ vào</label><input id={`in-${key}`} type="time" name="clockIn" defaultValue={draft.clockIn} required /></div>
        <div className="field"><label htmlFor={`out-${key}`}>Giờ ra</label><input id={`out-${key}`} type="time" name="clockOut" defaultValue={draft.clockOut} /></div>
      </>}
      <div className="field field-full"><label htmlFor={`note-${key}`}>Ghi chú</label><input id={`note-${key}`} name="note" defaultValue={draft.note} maxLength={300} /></div>
    </div>
  </CommandForm>;
}

export function AttendanceSettingsForm({ settings }: { settings: { late_grace_minutes: number; early_clock_in_minutes: number; standard_work_days: string | number; require_location: boolean } }) {
  return <CommandForm action={saveAttendanceSettingsAction} submit="Lưu cài đặt">
    <div className="form-grid">
      <div className="field"><label htmlFor="late-grace">Cho phép đi muộn (phút)</label><input id="late-grace" type="number" name="lateGrace" min={0} max={120} defaultValue={settings.late_grace_minutes} required /></div>
      <div className="field"><label htmlFor="early-in">Được vào ca sớm (phút)</label><input id="early-in" type="number" name="earlyClockIn" min={0} max={240} defaultValue={settings.early_clock_in_minutes} required /></div>
      <div className="field"><label htmlFor="standard-days">Ngày công chuẩn / tháng</label><input id="standard-days" type="number" name="standardDays" min={1} max={31} step="0.5" defaultValue={String(settings.standard_work_days)} required /></div>
      <label className="check-inline"><input type="checkbox" name="requireLocation" defaultChecked={settings.require_location} /> Bắt buộc bật định vị khi chấm công</label>
    </div>
  </CommandForm>;
}

export function CloseAttendancePeriodForm({ from, to }: { from: string; to: string }) {
  return <CommandForm action={closeAttendancePeriodAction} submit="Chốt chấm công">
    <div className="form-grid">
      <div className="field"><label htmlFor="close-from">Từ ngày</label><input id="close-from" type="date" name="fromDate" defaultValue={from} required /></div>
      <div className="field"><label htmlFor="close-to">Đến ngày</label><input id="close-to" type="date" name="toDate" defaultValue={to} required /></div>
    </div>
    <p className="muted">Sau khi chốt, ngày công trong kỳ được dùng để tính lương và không sửa được cho tới khi mở lại (có ghi lý do).</p>
  </CommandForm>;
}

export function ReopenAttendancePeriodForm({ periodId }: { periodId: string }) {
  return <CommandForm action={reopenAttendancePeriodAction} submit="Mở lại kỳ" danger>
    <input type="hidden" name="periodId" value={periodId} />
    <div className="field"><label htmlFor={`reason-${periodId}`}>Lý do mở lại</label><input id={`reason-${periodId}`} name="reason" minLength={3} maxLength={300} required /></div>
  </CommandForm>;
}
