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
  <p>{draft ? "Xóa khỏi danh sách đang làm việc bằng lệnh hủy. Không xóa dòng hay audit; vẫn xem được trong lịch sử Đã hủy." : "Chỉ hủy khi backend xác nhận chưa có lịch sử thực hiện. Không xóa giao hàng, tồn kho hay công nợ đã ghi."}</p>
  <div className="field"><label htmlFor={id}>Lý do hủy</label><input id={id} name="reason" minLength={3} maxLength={500} required/></div>
  <label><input type="checkbox" required/> Tôi xác nhận hủy chứng từ này và giữ lịch sử</label>
  <Submit draft={draft} label={label}/>
 </form>;
}
