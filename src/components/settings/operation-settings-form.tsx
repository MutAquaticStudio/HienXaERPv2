"use client";

import { useState, useTransition } from "react";
import { MoneyInput } from "@/components/ui/money-input";
import { saveOperationSettingsAction, type OperationSettingsResult } from "@/modules/settings/operation-actions";

export type OperationSettings = { stop_minutes: number; version: number; default_warehouse_id?: string | null; auto_source_enabled?: boolean;
  trip_cost_vnd?: string | number | null; dispatch_mode?: "OFF" | "SUGGEST" | "AUTO"; work_day_start?: string; work_day_end?: string };

const hhmm = (value?: string) => (value ?? "").slice(0, 5);
type DispatchMode = "OFF" | "SUGGEST" | "AUTO";
const DISPATCH: { value: DispatchMode; label: string; detail: string }[] = [
  { value: "AUTO", label: "Tự động", detail: "Phiếu giao mới tự được gán xe và tài xế đang rảnh; Điều phối vẫn sửa được." },
  { value: "SUGGEST", label: "Gợi ý", detail: "Hệ thống chỉ đề xuất xe và tài xế; Điều phối bấm áp dụng." },
  { value: "OFF", label: "Tắt", detail: "Điều phối tự phân xe cho từng phiếu." },
];
/** Whole and half hours, 24-hour clock ("07:30"), so the time never shows as "07:00 AM" on a phone set to English. */
const TIMES = Array.from({ length: 48 }, (_, index) => `${String(Math.floor(index / 2)).padStart(2, "0")}:${index % 2 ? "30" : "00"}`);
const timeOptions = (current: string) => TIMES.includes(current) || !current ? TIMES : [...TIMES, current].sort();

/**
 * "Vận hành giao hàng" of the branch: stop time (D21), auto-sourcing on confirmation (D19: default warehouse, trip cost) and
 * auto-dispatch (D22: mode, working day). D59: the save button wakes only on a change; turning on a setting that acts on its
 * own (purchase orders to suppliers, vehicles assigned) says what it will do before saving.
 */
export function OperationSettingsForm({ settings, warehouses = [] }: { settings: OperationSettings | null; warehouses?: { id: string; name: string }[] }) {
  const [minutes, setMinutes] = useState(String(settings?.stop_minutes ?? 60));
  const [warehouseId, setWarehouseId] = useState(settings?.default_warehouse_id ?? "");
  const [autoSource, setAutoSource] = useState(settings?.auto_source_enabled ?? true);
  const [tripCost, setTripCost] = useState(settings?.trip_cost_vnd == null ? "" : String(settings.trip_cost_vnd));
  const [dispatchMode, setDispatchMode] = useState<DispatchMode>(settings?.dispatch_mode ?? "AUTO");
  const [dayStart, setDayStart] = useState(hhmm(settings?.work_day_start) || "07:00");
  const [dayEnd, setDayEnd] = useState(hhmm(settings?.work_day_end) || "18:00");
  const [version, setVersion] = useState<number | null>(settings?.version ?? null);
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const [result, setResult] = useState<OperationSettingsResult | null>(null);
  const [pending, startTransition] = useTransition();
  const value = Number(minutes);
  const minutesValid = /^\d{1,3}$/.test(minutes) && value >= 5 && value <= 720;
  const dayValid = /^\d{2}:\d{2}$/.test(dayStart) && /^\d{2}:\d{2}$/.test(dayEnd) && dayEnd > dayStart;
  const valid = minutesValid && dayValid;
  const saved = { minutes: String(settings?.stop_minutes ?? 60), warehouseId: settings?.default_warehouse_id ?? "", autoSource: settings?.auto_source_enabled ?? true,
    tripCost: settings?.trip_cost_vnd == null ? "" : String(settings.trip_cost_vnd), dispatchMode: settings?.dispatch_mode ?? "AUTO",
    dayStart: hhmm(settings?.work_day_start) || "07:00", dayEnd: hhmm(settings?.work_day_end) || "18:00" };
  const [baseline, setBaseline] = useState(saved);
  const changed = minutes !== baseline.minutes || warehouseId !== baseline.warehouseId || autoSource !== baseline.autoSource || tripCost !== baseline.tripCost
    || dispatchMode !== baseline.dispatchMode || dayStart !== baseline.dayStart || dayEnd !== baseline.dayEnd;
  // Never saved yet: the defaults are in use; Lưu writes them down, but nothing is "unsaved".
  const dirty = !version || changed;
  const turnsOnSourcing = autoSource && !baseline.autoSource;
  const turnsOnDispatch = dispatchMode === "AUTO" && baseline.dispatchMode !== "AUTO";
  // Any edit after a known outcome is a new command; an unclear outcome keeps its operation so pressing again only checks.
  const edited = () => { if (result?.status !== "UNKNOWN") { setOperationId(crypto.randomUUID()); setResult(null); } };

  function save() {
    if (pending || !valid || (!dirty && result?.status !== "UNKNOWN")) return;
    startTransition(async () => {
      let outcome: OperationSettingsResult;
      try {
        outcome = await saveOperationSettingsAction({ operationId, expectedVersion: version, stopMinutes: value, defaultWarehouseId: warehouseId || null,
          autoSource, tripCostVnd: tripCost || null, dispatchMode, workDayStart: dayStart, workDayEnd: dayEnd });
      } catch {
        outcome = { status: "UNKNOWN", message: "Chưa xác định được kết quả. Bấm lại đúng thao tác này để kiểm tra." };
      }
      setResult(outcome);
      if (outcome.status === "UNKNOWN") return;
      setOperationId(crypto.randomUUID());
      if (outcome.status === "SUCCESS") { setVersion(outcome.version ?? version); setBaseline({ minutes, warehouseId, autoSource, tripCost, dispatchMode, dayStart, dayEnd }); }
    });
  }

  return <form className="form-stack" onSubmit={(event) => { event.preventDefault(); save(); }}>
    <label className="field"><span>Thời gian mỗi điểm giao (phút)</span>
      <input name="stopMinutes" inputMode="numeric" value={minutes} disabled={pending} aria-invalid={!minutesValid} aria-describedby={minutesValid ? undefined : "stop-minutes-error"}
        onChange={(event) => { setMinutes(event.target.value.replace(/\D/g, "")); edited(); }} /></label>
    <p className="muted">Một phiếu giao giữ người giao và xe trong khoảng này. Một người nhận được nhiều phiếu trong ngày; chọn &quot;Giao ngay&quot; khi họ đang bận thì phiếu mới tự xếp sau việc trước.</p>
    {!minutesValid && <p className="field-error" id="stop-minutes-error" role="alert">Nhập từ 5 đến 720 phút.</p>}

    <fieldset className="form-stack settings-fieldset"><legend>Tự phân nguồn khi xác nhận đơn</legend>
      <label className="check-inline"><input type="checkbox" checked={autoSource} disabled={pending} onChange={(event) => { setAutoSource(event.target.checked); edited(); }} />
        Xác nhận đơn là hệ thống tự lấy kho, phần thiếu tạo đơn mua NCC giao thẳng chờ duyệt</label>
      {turnsOnSourcing && <p className="settings-warning" role="status">Khi bật: mỗi lần xác nhận đơn bán, hệ thống có thể tự tạo đơn mua nhà cung cấp (ở trạng thái chờ duyệt) cho phần kho không đủ.</p>}
      <label className="field"><span>Kho ưu tiên</span>
        <select value={warehouseId} disabled={pending} onChange={(event) => { setWarehouseId(event.target.value); edited(); }}>
          <option value="">Kho phục vụ được nhiều dòng nhất</option>
          {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label>
      <label className="field"><span>Chi phí một chuyến (VND)</span>
        <MoneyInput value={tripCost} onValue={(digits) => { setTripCost(digits); edited(); }} disabled={pending} maxDigits={12} aria-describedby="trip-cost-hint" /></label>
      <p className="muted" id="trip-cost-hint">Để trống thì luôn dùng tồn kho trước. Khi kho chỉ có một phần: nếu thêm một chuyến tốn hơn khoản tiết kiệm từ tồn kho, hệ thống mua cả dòng từ NCC.</p>
    </fieldset>

    <fieldset className="form-stack settings-fieldset"><legend>Tự điều phối phiếu giao từ kho</legend>
      <label className="field"><span>Chế độ</span>
        <select value={dispatchMode} disabled={pending} aria-describedby="dispatch-mode-hint" onChange={(event) => { setDispatchMode(event.target.value as DispatchMode); edited(); }}>
          {DISPATCH.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <p className="muted" id="dispatch-mode-hint">{DISPATCH.find((option) => option.value === dispatchMode)?.detail}</p>
      {turnsOnDispatch && <p className="settings-warning" role="status">Khi bật: phiếu giao mới được gán xe và tài xế ngay, không chờ Điều phối.</p>}
      <div className="form-grid">
        <label className="field"><span>Giờ bắt đầu ngày làm</span><select value={dayStart} disabled={pending} onChange={(event) => { setDayStart(event.target.value); edited(); }}>
          {timeOptions(dayStart).map((time) => <option key={time} value={time}>{time}</option>)}</select></label>
        <label className="field"><span>Giờ kết thúc ngày làm</span><select value={dayEnd} disabled={pending} aria-invalid={!dayValid} aria-describedby={dayValid ? undefined : "day-end-error"} onChange={(event) => { setDayEnd(event.target.value); edited(); }}>
          {timeOptions(dayEnd).map((time) => <option key={time} value={time}>{time}</option>)}</select></label>
      </div>
      {!dayValid && <p className="field-error" id="day-end-error" role="alert">Giờ kết thúc phải sau giờ bắt đầu.</p>}
    </fieldset>

    {result && <p className={`form-message${result.status === "SUCCESS" ? " success" : ""}`} role={result.status === "SUCCESS" ? "status" : "alert"}>{result.message}</p>}
    <div className="form-actions">{changed && result?.status !== "UNKNOWN" && <span className="settings-dirty" role="status">Có thay đổi chưa lưu</span>}
      {!version && !changed && <span className="muted">Đang dùng giá trị mặc định.</span>}
      <button type="submit" className="button button-primary" disabled={pending || !valid || (!dirty && result?.status !== "UNKNOWN")}>{pending ? "Đang lưu..." : result?.status === "UNKNOWN" ? "Lưu lại đúng thao tác" : "Lưu cài đặt giao hàng"}</button></div>
  </form>;
}
