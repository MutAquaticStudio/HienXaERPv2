"use client";
import { useId } from "react";
import { useFormStatus } from "react-dom";
function Submit({ draft, label }: { draft: boolean; label: string }) {
 const { pending } = useFormStatus();
 return <button className="button button-danger action-full" type="submit" disabled={pending}>{pending ? "Đang hủy..." : draft ? "Xóa nháp (hủy có lịch sử)" : label}</button>;
}
export function CancelDocumentForm({ entityId, operationId, state, label, action }: { entityId: string; operationId: string; state: string; label: string; action: (data: FormData) => void | Promise<void> }) {
 const id=useId(),draft=state==="DRAFT";
 return <form className="inline-command" action={action}>
  <input type="hidden" name="entityId" value={entityId}/><input type="hidden" name="operationId" value={operationId}/>
  <p>{draft ? "Hủy bản nháp để bỏ khỏi danh sách đang làm. Chứng từ và nhật ký vẫn được lưu trong lịch sử Đã hủy." : "Chỉ được hủy khi hệ thống xác nhận chưa phát sinh nghiệp vụ. Không xóa giao hàng, tồn kho hay công nợ đã ghi."}</p>
  <div className="field"><label htmlFor={id}>Ghi chú (không bắt buộc)</label><input id={id} name="reason" maxLength={500}/></div>
  <label><input type="checkbox" required/> Tôi xác nhận hủy chứng từ này và giữ lịch sử</label>
  <Submit draft={draft} label={label}/>
 </form>;
}
