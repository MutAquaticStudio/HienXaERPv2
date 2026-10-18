"use client";

import { useState, useTransition } from "react";
import { MoneyInput } from "@/components/ui/money-input";
import { saveOperationSettingsAction, type OperationSettingsResult } from "@/modules/settings/operation-actions";

export type OperationSettings = { stop_minutes: number; version: number; default_warehouse_id?: string | null; auto_source_enabled?: boolean;
  trip_cost_vnd?: string | number | null; dispatch_mode?: "OFF" | "SUGGEST" | "AUTO"; work_day_start?: string; work_day_end?: string };

const hhmm = (value?: string) => (value ?? "").slice(0, 5);

/**
 * "Vận hành giao hàng" of the branch: stop time (D21), auto-sourcing on confirmation (D19: default warehouse, trip cost) and
 * auto-dispatch (D22: mode, working day).
 */
export function OperationSettingsForm({ settings, warehouses = [] }: { settings: OperationSettings | null; warehouses?: { id: string; name: string }[] }) {
  const [minutes, setMinutes] = useState(String(settings?.stop_minutes ?? 60));
  const [warehouseId, setWarehouseId] = useState(settings?.default_warehouse_id ?? "");
  const [autoSource, setAutoSource] = useState(settings?.auto_source_enabled ?? true);
  const [tripCost, setTripCost] = useState(settings?.trip_cost_vnd == null ? "" : String(settings.trip_cost_vnd));
  const [dispatchMode, setDispatchMode] = useState(settings?.dispatch_mode ?? "AUTO");
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
  // Any edit after a known outcome is a new command; an unclear outcome keeps its operation so pressing again only checks.
  const edited = () => { if (result?.status !== "UNKNOWN") { setOperationId(crypto.randomUUID()); setResult(null); } };

  function save() {
    if (pending || !valid) return;
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
      if (outcome.status === "SUCCESS") setVersion(outcome.version ?? version);
    });
  }

  return <form className="form-stack" onSubmit={(event) => { event.preventDefault(); save(); }}>
    <label className="field"><span>Thời gian mỗi điểm giao (phút)</span>
      <input name="stopMinutes" inputMode="numeric" value={minutes} disabled={pending} aria-invalid={!minutesValid}
        onChange={(event) => { setMinutes(event.target.value.replace(/\D/g, "")); edited(); }} /></label>
    <p className="muted">Một phiếu giao giữ người giao và xe trong khoảng này. Một người nhận được nhiều phiếu trong ngày; chọn &quot;Giao ngay&quot; khi họ đang bận thì phiếu mới tự xếp sau việc trước.</p>
    {!minutesValid && <p className="field-error" role="alert">Nhập từ 5 đến 720 phút.</p>}

    <fieldset className="form-stack"><legend>Tự phân nguồn khi xác nhận đơn</legend>
      <label className="check-inline"><input type="checkbox" checked={autoSource} disabled={pending} onChange={(event) => { setAutoSource(event.target.checked); edited(); }} />
        Xác nhận đơn là hệ thống tự lấy kho, phần thiếu tạo đơn mua NCC giao thẳng chờ duyệt</label>
      <label className="field"><span>Kho ưu tiên</span>
        <select value={warehouseId} disabled={pending} onChange={(event) => { setWarehouseId(event.target.value); edited(); }}>
          <option value="">Kho phục vụ được nhiều dòng nhất</option>
          {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label>
      <label className="field"><span>Chi phí một chuyến (VND)</span>
        <MoneyInput value={tripCost} onValue={(digits) => { setTripCost(digits); edited(); }} disabled={pending} maxDigits={12} placeholder="Để trống = luôn dùng tồn kho trước" /></label>
      <p className="muted">Khi kho chỉ có một phần: nếu thêm một chuyến tốn hơn khoản tiết kiệm từ tồn kho, hệ thống mua cả dòng từ NCC.</p>
    </fieldset>

    <fieldset className="form-stack"><legend>Tự điều phối phiếu giao từ kho</legend>
      <label className="field"><span>Chế độ</span>
        <select value={dispatchMode} disabled={pending} onChange={(event) => { setDispatchMode(event.target.value as "OFF" | "SUGGEST" | "AUTO"); edited(); }}>
          <option value="AUTO">Tự động — tự chọn xe và tài xế rảnh, sửa được</option>
          <option value="SUGGEST">Gợi ý — chỉ đề xuất, Điều phối bấm áp dụng</option>
          <option value="OFF">Tắt — Điều phối tự phân xe</option></select></label>
      <div className="form-grid">
        <label className="field"><span>Giờ bắt đầu ngày làm</span><input type="time" value={dayStart} disabled={pending} onChange={(event) => { setDayStart(event.target.value); edited(); }} /></label>
        <label className="field"><span>Giờ kết thúc ngày làm</span><input type="time" value={dayEnd} disabled={pending} aria-invalid={!dayValid} onChange={(event) => { setDayEnd(event.target.value); edited(); }} /></label>
      </div>
      {!dayValid && <p className="field-error" role="alert">Giờ kết thúc phải sau giờ bắt đầu.</p>}
    </fieldset>

    {result && <p className={`form-message${result.status === "SUCCESS" ? " success" : ""}`} role="status">{result.message}</p>}
    <div className="form-actions"><button type="submit" className="button button-primary" disabled={pending || !valid}>{pending ? "Đang lưu..." : result?.status === "UNKNOWN" ? "Lưu lại đúng thao tác" : "Lưu cài đặt giao hàng"}</button></div>
  </form>;
}
