type StatusTone = "success" | "warning" | "info" | "danger";

export function deliveryStateLabel(value: string) {
  return ({
    PLANNED: "Chờ phân giao",
    ASSIGNED: "Đã phân giao",
    DISPATCHED: "Đang giao",
    ARRIVED: "Đã tới nơi",
    RESULT_SUBMITTED: "Chờ xác minh",
    VERIFIED: "Đã xác minh",
    CANCELLED: "Đã hủy",
    FULL: "Đủ",
    PARTIAL: "Giao thiếu",
    FAILED: "Không giao được",
  } as Record<string, string>)[value] ?? value;
}

export function deliveryStateTone(value: string): StatusTone {
  if (value === "VERIFIED" || value === "FULL") return "success";
  if (value === "CANCELLED" || value === "FAILED") return "danger";
  if (value === "RESULT_SUBMITTED" || value === "PARTIAL") return "warning";
  return "info";
}

export function sourceModeLabel(value: string) {
  return ({ WAREHOUSE: "Từ kho", SUPPLIER_DIRECT: "NCC giao thẳng", SUPPLIER_TO_WAREHOUSE: "NCC về kho" } as Record<string, string>)[value] ?? value;
}
