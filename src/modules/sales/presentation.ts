export function salesStateLabel(state: string) {
  const labels: Record<string, string> = { DRAFT: "Bản nháp", SENT: "Đã gửi", ACCEPTED: "Đã chấp nhận", EXPIRED: "Hết hạn", SUPERSEDED: "Đã thay thế", CANCELLED: "Đã hủy", CONFIRMED: "Đã xác nhận", CLOSED: "Đã đóng phần thương mại", NOT_STARTED: "Chưa thực hiện", IN_PROGRESS: "Đang thực hiện", COMPLETED: "Đã hoàn thành", FULFILLED: "Đã giao đủ", CLOSED_REMAINDER: "Đã đóng phần còn lại", NOT_DUE: "Chưa phát sinh", UNPAID: "Chưa thanh toán", PARTIAL: "Thanh toán một phần", PAID: "Đã thanh toán" };
  return Object.hasOwn(labels, state) ? labels[state] : "Chưa xác định";
}

export function salesDeliveryStateLabel(state: string) {
  return state === "PARTIAL" ? "Đã giao một phần" : salesStateLabel(state);
}

export function salesStateTone(state: string): "success" | "warning" | "info" | "danger" {
  if (["ACCEPTED", "CONFIRMED", "CLOSED", "COMPLETED", "FULFILLED", "CLOSED_REMAINDER"].includes(state)) return "success";
  if (["CANCELLED", "EXPIRED", "SUPERSEDED"].includes(state)) return "danger";
  if (["SENT", "IN_PROGRESS"].includes(state)) return "info";
  return "warning";
}
