"use client";

import { useState, useTransition } from "react";
import { setPortalBranchAction } from "@/modules/settings/portal-branch-actions";

/**
 * D58: which branch receives customers who register on the customer portal. Until one is chosen (with several branches)
 * the register page tells customers to call the shop.
 */
export function PortalBranchForm({ current, branches, lastChange = null }: { current: string | null; branches: { id: string; name: string }[]; lastChange?: string | null }) {
  const [branchId, setBranchId] = useState(current ?? "");
  const [result, setResult] = useState<{ status: string; message: string } | null>(null);
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const [pending, start] = useTransition();
  const dirty = branchId !== (current ?? "");
  function save() {
    start(async () => {
      const answer = await setPortalBranchAction({ branchId, operationId });
      setResult(answer);
      // An unknown outcome is retried with the same operation; anything settled starts a new one.
      if (answer.status !== "UNKNOWN") setOperationId(crypto.randomUUID());
    });
  }
  return <div className="portal-branch-form">
    {!current && <p className="quality-callout" role="status">Chưa chọn chi nhánh: khách chưa tự đăng ký được trên cổng khách.</p>}
    <label className="field">Chi nhánh nhận khách tự đăng ký
      <select value={branchId} onChange={(event) => { setBranchId(event.target.value); setResult(null); }}>
        {!current && <option value="">Chọn chi nhánh</option>}
        {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
      </select></label>
    <p className="settings-note">Khách mới tự đăng ký được tạo hồ sơ ở chi nhánh này, giá chung, chưa có hạn mức; cửa hàng nhận thông báo để kiểm tra.{lastChange ? ` Đổi lần cuối: ${lastChange}.` : ""}</p>
    <button className="button button-secondary" type="button" disabled={!branchId || !dirty || pending} onClick={save}>{pending ? "Đang lưu…" : "Lưu chi nhánh nhận khách"}</button>
    {result && <p className={result.status === "SUCCESS" ? "form-message success" : "form-message"} role={result.status === "SUCCESS" ? "status" : "alert"}>{result.message}</p>}
  </div>;
}
