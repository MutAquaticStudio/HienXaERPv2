"use client";

import { useState } from "react";
import { setCustomerZaloNotifyAction } from "@/modules/zalo/notify-actions";

/**
 * D47 "Nhận thông báo qua Zalo": on by default for every customer; staff (customers.manage) switch it on the customer
 * profile, the customer's owner / accountant on the portal. Messages go to the customer's main phone.
 */
export function ZaloNotifyToggle({ customerId, enabled, canChange, phoneUsable, className }: {
  customerId: string; enabled: boolean; canChange: boolean; phoneUsable: boolean; className?: string;
}) {
  const [on, setOn] = useState(enabled);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  async function change(next: boolean) {
    setBusy(true); setMessage(null);
    const result = await setCustomerZaloNotifyAction({ customerId, enabled: next }).catch(() => null);
    setBusy(false);
    if (result?.ok) setOn(next);
    setMessage({ ok: !!result?.ok, text: result?.message ?? "Chưa xác định được kết quả. Tải lại trang để kiểm tra." });
  }
  return <div className={className}>
    <label className="check-inline"><input type="checkbox" checked={on} disabled={!canChange || busy} onChange={(event) => change(event.target.checked)} />
      Nhận thông báo qua Zalo</label>
    <small className="table-subline">{phoneUsable ? "Xác nhận đơn, giao hàng, nhận tiền và nhắc công nợ gửi tới số điện thoại chính."
      : "Chưa có số di động hợp lệ nên chưa gửi được tin Zalo."}</small>
    {message && <p className={`form-message${message.ok ? " success" : ""}`} role={message.ok ? "status" : "alert"}>{message.text}</p>}
  </div>;
}
