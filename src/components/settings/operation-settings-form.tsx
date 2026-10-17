"use client";

import { useState, useTransition } from "react";
import { saveOperationSettingsAction, type OperationSettingsResult } from "@/modules/settings/operation-actions";

/** "Vận hành giao hàng" (D21): one delivery stop holds its driver and vehicle this long when no end time is given. */
export function OperationSettingsForm({ settings }: { settings: { stop_minutes: number; version: number } | null }) {
  const [minutes, setMinutes] = useState(String(settings?.stop_minutes ?? 60));
  const [version, setVersion] = useState<number | null>(settings?.version ?? null);
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const [result, setResult] = useState<OperationSettingsResult | null>(null);
  const [pending, startTransition] = useTransition();
  const value = Number(minutes);
  const valid = /^\d{1,3}$/.test(minutes) && value >= 5 && value <= 720;

  function save() {
    if (pending || !valid) return;
    startTransition(async () => {
      let outcome: OperationSettingsResult;
      try {
        outcome = await saveOperationSettingsAction({ operationId, expectedVersion: version, stopMinutes: value });
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
      <input name="stopMinutes" inputMode="numeric" value={minutes} disabled={pending} aria-invalid={!valid}
        onChange={(event) => { setMinutes(event.target.value.replace(/\D/g, "")); if (result?.status !== "UNKNOWN") { setOperationId(crypto.randomUUID()); setResult(null); } }} /></label>
    <p className="muted">Một phiếu giao giữ người giao và xe trong khoảng này. Một người nhận được nhiều phiếu trong ngày; chọn &quot;Giao ngay&quot; khi họ đang bận thì phiếu mới tự xếp sau việc trước.</p>
    {!valid && <p className="field-error" role="alert">Nhập từ 5 đến 720 phút.</p>}
    {result && <p className={`form-message${result.status === "SUCCESS" ? " success" : ""}`} role="status">{result.message}</p>}
    <div className="form-actions"><button type="submit" className="button button-primary" disabled={pending || !valid}>{pending ? "Đang lưu..." : result?.status === "UNKNOWN" ? "Lưu lại đúng thao tác" : "Lưu cài đặt giao hàng"}</button></div>
  </form>;
}
