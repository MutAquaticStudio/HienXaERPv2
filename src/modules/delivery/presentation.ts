function lookupLabel(labels: Record<string, string>, value: string | null | undefined, fallback: string) {
  return value && Object.hasOwn(labels, value) ? labels[value] : fallback;
}

type StatusTone = "success" | "warning" | "info" | "danger";

export function deliveryStateLabel(value: string) {
  return lookupLabel({
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
  }, value, "Trạng thái đang cập nhật");
}

export function deliveryStateTone(value: string): StatusTone {
  if (value === "VERIFIED" || value === "FULL") return "success";
  if (value === "CANCELLED" || value === "FAILED") return "danger";
  if (value === "RESULT_SUBMITTED" || value === "PARTIAL") return "warning";
  return "info";
}

export function sourceModeLabel(value: string) {
  return lookupLabel({ WAREHOUSE: "Từ kho", SUPPLIER_DIRECT: "Nhà cung cấp giao thẳng", SUPPLIER_TO_WAREHOUSE: "Nhà cung cấp giao về kho" }, value, "Nguồn hàng đang cập nhật");
}

export function returnCaseKindLabel(value: string) {
  return lookupLabel({ TRANSIT_REMAINDER: "Hàng còn trên xe", CUSTOMER_RETURN: "Khách trả hàng", TRANSIT_LOSS: "Hao hụt khi giao" }, value, "Hồ sơ xử lý hàng");
}
