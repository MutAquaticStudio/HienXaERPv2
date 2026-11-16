import { UNRUN_DELIVERY_STATES, type DeleteOrderDelivery } from "./delete-order";

export type CancelOrderView = { canCancel: boolean; note: string | null };

/**
 * D94: what the order page shows for "Hủy đơn". A draft / confirmed order whose deliveries never ran can be cancelled; its
 * deliveries not cancelled yet are cancelled with it (the note names them). A delivery that ran hides the button and says why.
 * The database is the final judge (it also checks loading, stock movements and started jobs, which the page does not load).
 */
export function cancelOrderView(commercialState: string, deliveries: readonly DeleteOrderDelivery[]): CancelOrderView {
  if (!["DRAFT", "CONFIRMED"].includes(commercialState)) return { canCancel: false, note: null };
  const ran = deliveries.filter((delivery) => !UNRUN_DELIVERY_STATES.has(delivery.state));
  if (ran.length > 0) {
    return {
      canCancel: false,
      note: `Không hủy được đơn: phiếu giao ${ran.map((delivery) => delivery.number).join(", ")} đã chạy (đang giao, đã giao hoặc đã xác nhận). Hãy dùng trả hàng hoặc “Đóng phần còn lại”.`,
    };
  }
  const open = deliveries.filter((delivery) => delivery.state !== "CANCELLED");
  if (open.length === 0) return { canCancel: true, note: null };
  return {
    canCancel: true,
    note: `Hủy đơn sẽ hủy luôn ${open.length} phiếu giao chưa chạy (${open.map((delivery) => delivery.number).join(", ")}): nhả hàng đang giữ, bỏ việc khỏi “Nhận việc” và Điều phối. Đơn và phiếu giao vẫn lưu ở trạng thái Đã hủy.`,
  };
}
