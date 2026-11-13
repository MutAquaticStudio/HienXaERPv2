/** D72: what the order page already knows that will make the database refuse "Xóa đơn bán". The button stays on every order; the database is the final judge. */
export function deleteBlockedNote(commercialState: string, deliveryCount: number): string | null {
  if (deliveryCount > 0) return "Đơn này đã có phiếu giao (kể cả phiếu đã hủy). Hệ thống giữ lịch sử phiếu giao, doanh thu, công nợ và kho đã ghi nên sẽ từ chối xóa. Bấm xóa vẫn được để xem lý do đầy đủ.";
  if (commercialState === "CLOSED") return "Đơn đã đóng, đã ghi doanh thu và công nợ nên sẽ bị từ chối xóa.";
  return null;
}
