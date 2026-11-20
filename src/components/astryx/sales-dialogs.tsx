"use client";

import { useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@astryxdesign/core/Button";
import { AxDialogButton, AxDialogClose } from "./sales-dialog";

type Action = (data: FormData) => void | Promise<void>;

/** Nút gửi form trong hộp thoại: hiện "đang..." khi form đang xử lý và khóa để không gửi hai lần. */
export function AxSubmit({ label, pendingLabel, disabled, danger }: { label: string; pendingLabel: string; disabled?: boolean; danger?: boolean }) {
  const { pending } = useFormStatus();
  return <Button type="submit" variant={danger ? "destructive" : "primary"} label={pending ? pendingLabel : label} isDisabled={disabled || pending} />;
}

/** Hộp thoại "Hủy đơn": cùng action và trường như CancelDocumentForm (entityId, operationId, reason, xác nhận giữ lịch sử). */
export function AxCancelDocumentDialog({ entityId, operationId, state, label, action, note, kind = "danger", small, wide, subtitle }: {
  entityId: string; operationId: string; state: string; label: string; action: Action; note?: string | null; kind?: "danger" | "secondary"; small?: boolean; wide?: boolean; subtitle?: string;
}) {
  const reasonId = useId();
  const draft = state === "DRAFT";
  return <AxDialogButton label={label} title={`${label}?`} subtitle={subtitle} kind={kind} small={small} wide={wide} width={500}>
    <form action={action} className="sx-dlg-body">
      <input type="hidden" name="entityId" value={entityId} /><input type="hidden" name="operationId" value={operationId} />
      <p>{draft ? "Hủy bản nháp để bỏ khỏi danh sách đang làm. Chứng từ và nhật ký vẫn được lưu trong lịch sử Đã hủy." : "Chỉ được hủy khi hệ thống xác nhận chưa phát sinh nghiệp vụ. Không xóa giao hàng, tồn kho hay công nợ đã ghi."}</p>
      {note && <p className="sx-note" role="note">{note}</p>}
      <label className="sx-field" htmlFor={reasonId}>Ghi chú (không bắt buộc)<input id={reasonId} name="reason" maxLength={500} /></label>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}><input type="checkbox" required /> Tôi xác nhận hủy chứng từ này và giữ lịch sử</label>
      <div className="sx-dlg-foot"><AxDialogClose label="Không hủy" /><AxSubmit danger label={draft ? "Xóa nháp (hủy có lịch sử)" : label} pendingLabel="Đang hủy..." /></div>
    </form>
  </AxDialogButton>;
}

/** Hộp thoại "Xóa đơn bán" (D72/D90): cần lý do và gõ lại mã đơn; máy chủ và cơ sở dữ liệu kiểm lại các điều kiện. */
export function AxDeleteOrderDialog({ entityId, operationId, orderNumber, action, blockedNote }: { entityId: string; operationId: string; orderNumber: string; action: Action; blockedNote?: string | null }) {
  const reasonId = useId();
  const numberId = useId();
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const ready = reason.trim().length >= 3 && typed.trim().toUpperCase() === orderNumber.toUpperCase();
  return <AxDialogButton label="Xóa đơn bán" title="Xóa đơn bán?" subtitle={orderNumber} kind="danger" wide width={520}>
    <form action={action} className="sx-dlg-body">
      <input type="hidden" name="entityId" value={entityId} /><input type="hidden" name="operationId" value={operationId} />
      <p>Xóa hẳn đơn này khỏi hệ thống, cùng hạn mức, phần giữ hàng và các phiếu giao chưa chạy của đơn (kể cả phiếu đã hủy). Không khôi phục được. Chỉ xóa được khi chưa có phiếu giao nào đã lên hàng, đã giao hay đã xác nhận, chưa có tiền, đơn mua hay ngoại lệ tín dụng; hệ thống kiểm lại lúc xóa. Nhật ký vẫn ghi ai xóa, đơn nào và lý do. Muốn bỏ đơn mà giữ lịch sử thì dùng “Hủy đơn”.</p>
      {blockedNote && <p className="sx-note" role="note">{blockedNote}</p>}
      <label className="sx-field" htmlFor={reasonId}>Lý do xóa<input id={reasonId} name="reason" required minLength={3} maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      <label className="sx-field" htmlFor={numberId}>Gõ mã đơn {orderNumber} để xác nhận<input id={numberId} name="confirmNumber" autoComplete="off" required value={typed} onChange={(event) => setTyped(event.target.value)} /></label>
      <div className="sx-dlg-foot"><AxDialogClose label="Không xóa" /><AxSubmit danger label="Xóa đơn bán" pendingLabel="Đang xóa..." disabled={!ready} /></div>
    </form>
  </AxDialogButton>;
}
