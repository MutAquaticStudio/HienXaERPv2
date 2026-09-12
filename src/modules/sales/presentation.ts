export function salesStateLabel(state: string) {
  return ({ DRAFT: "Bản nháp", SENT: "Đã gửi", ACCEPTED: "Đã chấp nhận", EXPIRED: "Hết hạn", SUPERSEDED: "Đã thay thế", CANCELLED: "Đã hủy", CONFIRMED: "Đã xác nhận", CLOSED: "Đã hoàn tất", NOT_STARTED: "Chưa thực hiện", NOT_DUE: "Chưa phát sinh" } as Record<string, string>)[state] ?? state;
}

export function salesStateTone(state: string): "success" | "warning" | "info" | "danger" {
  if (["ACCEPTED", "CONFIRMED", "CLOSED"].includes(state)) return "success";
  if (["CANCELLED", "EXPIRED", "SUPERSEDED"].includes(state)) return "danger";
  if (state === "SENT") return "info";
  return "warning";
}
