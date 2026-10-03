export function salesStateLabel(state: string) {
  return ({ DRAFT: "Bản nháp", SENT: "Đã gửi", ACCEPTED: "Đã chấp nhận", EXPIRED: "Hết hạn", SUPERSEDED: "Đã thay thế", CANCELLED: "Đã hủy", CONFIRMED: "Đã xác nhận", CLOSED: "Đã hoàn tất", NOT_STARTED: "Chưa thực hiện", IN_PROGRESS: "Đang thực hiện", COMPLETED: "Đã hoàn thành", NOT_DUE: "Chưa phát sinh", UNPAID: "Chưa thanh toán", PARTIAL: "Một phần", PAID: "Đã thanh toán" } as Record<string, string>)[state] ?? state;
}

export function salesStateTone(state: string): "success" | "warning" | "info" | "danger" {
  if (["ACCEPTED", "CONFIRMED", "CLOSED", "COMPLETED"].includes(state)) return "success";
  if (["CANCELLED", "EXPIRED", "SUPERSEDED"].includes(state)) return "danger";
  if (["SENT", "IN_PROGRESS"].includes(state)) return "info";
  return "warning";
}
