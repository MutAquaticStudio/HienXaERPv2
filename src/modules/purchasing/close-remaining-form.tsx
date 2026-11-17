import { randomUUID } from "node:crypto";
import { closePurchaseOrderRemainingAction } from "./actions";

type Props = { purchaseOrderId: string; state: string; arrivals: number; openLines: number; canClose: boolean };

/** D95 "Đóng phần còn lại" of a purchase order: confirmed, received in part, something still missing. */
export function ClosePurchaseRemainingForm({ purchaseOrderId, state, arrivals, openLines, canClose }: Props) {
  if (!canClose || state !== "CONFIRMED" || arrivals === 0 || openLines === 0) return null;
  return <details className="card card-pad quick-create">
    <summary>Đóng phần còn lại</summary>
    <p className="muted">Dùng khi NCC giao thiếu và không giao tiếp. Hàng đã nhận, công nợ phải trả giữ nguyên; đơn mua chuyển Đã đóng, phần chưa nhận được bỏ khỏi nguồn hàng của đơn bán để chọn nguồn khác.</p>
    <form className="command-panel" action={closePurchaseOrderRemainingAction}>
      <input type="hidden" name="entityId" value={purchaseOrderId} />
      <input type="hidden" name="operationId" value={randomUUID()} />
      <label className="field">Lý do<textarea name="reason" required minLength={3} maxLength={500} placeholder="Ví dụ: NCC báo hết hàng" /></label>
      <button className="button button-secondary" type="submit">Đóng phần còn lại</button>
    </form>
  </details>;
}
