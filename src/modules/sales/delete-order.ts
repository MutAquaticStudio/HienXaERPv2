/** The delivery states of a delivery that has not run yet (D90): it is deleted together with the order. */
const UNRUN_DELIVERY_STATES = new Set(["PLANNED", "ASSIGNED", "CANCELLED"]);

export type DeleteOrderDelivery = { number: string; state: string };

/**
 * D72 + D90: what the order page already knows about "Xóa đơn bán". A delivery that ran (on the road, delivered, verified) makes the
 * database refuse; deliveries that never ran are deleted with the order, and the note says which. The button stays on every order;
 * the database is the final judge (it also checks loading, stock movements and started jobs, which the page does not load).
 */
export function deleteBlockedNote(commercialState: string, deliveries: readonly DeleteOrderDelivery[]): string | null {
  const ran = deliveries.filter((delivery) => !UNRUN_DELIVERY_STATES.has(delivery.state));
  if (ran.length > 0) {
    return `Phiếu giao ${ran.map((delivery) => delivery.number).join(", ")} đã chạy (đang giao, đã giao hoặc đã xác nhận) nên hệ thống sẽ từ chối xóa đơn. Hãy dùng trả hàng hoặc “Đóng phần còn lại” thay cho xóa. Bấm xóa vẫn được để xem lý do đầy đủ.`;
  }
  if (commercialState === "CLOSED") return "Đơn đã đóng, đã ghi doanh thu và công nợ nên sẽ bị từ chối xóa.";
  if (deliveries.length > 0) {
    return `Xóa đơn sẽ xóa luôn ${deliveries.length} phiếu giao chưa chạy (${deliveries.map((delivery) => delivery.number).join(", ")}), cùng phần giữ hàng, phân công và việc của thợ trên các phiếu đó.`;
  }
  return null;
}
