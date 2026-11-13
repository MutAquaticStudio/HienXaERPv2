"use client";

// D72 (Owner 13/11/2026): "Xóa đơn bán" on the order detail. Hard delete of an order that has produced nothing; the person gives a reason and
// types the order number, so a stray tap cannot delete. The server and the database check the same conditions again.
import { useId, useState } from "react";
import { useFormStatus } from "react-dom";

function Submit({ ready }: { ready: boolean }) {
  const { pending } = useFormStatus();
  return <button className="button button-danger action-full" type="submit" disabled={!ready || pending}>{pending ? "Đang xóa..." : "Xóa đơn bán"}</button>;
}

export function DeleteSalesOrderForm({ entityId, operationId, orderNumber, action, blockedNote }: { entityId: string; operationId: string; orderNumber: string; action: (data: FormData) => void | Promise<void>; blockedNote?: string | null }) {
  const reasonId = useId();
  const numberId = useId();
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const ready = reason.trim().length >= 3 && typed.trim().toUpperCase() === orderNumber.toUpperCase();
  return <details className="quick-create">
    <summary>Xóa đơn bán</summary>
    <form className="inline-command" action={action}>
      <input type="hidden" name="entityId" value={entityId} />
      <input type="hidden" name="operationId" value={operationId} />
      <p>Xóa hẳn đơn này khỏi hệ thống, cùng hạn mức và phần giữ hàng của đơn. Không khôi phục được. Chỉ xóa được khi đơn chưa có phiếu giao, tiền, đơn mua hay ngoại lệ tín dụng; hệ thống kiểm lại lúc xóa. Nhật ký vẫn ghi ai xóa, đơn nào và lý do. Muốn bỏ đơn mà giữ lịch sử thì dùng “Hủy đơn”.</p>
      {blockedNote && <p className="form-message warning" role="note">{blockedNote}</p>}
      <div className="field"><label htmlFor={reasonId}>Lý do xóa</label><input id={reasonId} name="reason" required minLength={3} maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} /></div>
      <div className="field"><label htmlFor={numberId}>Gõ mã đơn <strong className="mono">{orderNumber}</strong> để xác nhận</label><input id={numberId} name="confirmNumber" autoComplete="off" required value={typed} onChange={(event) => setTyped(event.target.value)} /></div>
      <Submit ready={ready} />
    </form>
  </details>;
}
