export function purchaseStateLabel(state: string) {
  const labels: Record<string, string> = { DRAFT: "Bản nháp", CONFIRMED: "Đã xác nhận", CLOSED: "Đã ghi đủ nguồn nhận", CANCELLED: "Đã hủy", WAREHOUSE: "Về kho Hiền Xa", CUSTOMER_SITE: "Giao thẳng công trình", SUPPLIER_DIRECT: "Nhà cung cấp giao thẳng", SUPPLIER_TO_WAREHOUSE: "Nhà cung cấp giao về kho" };
  return Object.hasOwn(labels, state) ? labels[state] : "Chưa xác định";
}

export function purchaseStateTone(state: string): "success" | "warning" | "info" | "danger" {
  if (["CONFIRMED", "CLOSED"].includes(state)) return "success";
  if (state === "CANCELLED") return "danger";
  if (state === "DRAFT") return "warning";
  return "info";
}
