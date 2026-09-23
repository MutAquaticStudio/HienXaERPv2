export function purchaseStateLabel(state: string) {
  return ({ DRAFT: "Bản nháp", CONFIRMED: "Đã xác nhận", CLOSED: "Đã hoàn tất", CANCELLED: "Đã hủy", WAREHOUSE: "Về kho Hiền Xa", CUSTOMER_SITE: "Giao thẳng công trình", SUPPLIER_DIRECT: "NCC giao thẳng", SUPPLIER_TO_WAREHOUSE: "NCC giao về kho" } as Record<string, string>)[state] ?? state;
}

export function purchaseStateTone(state: string): "success" | "warning" | "info" | "danger" {
  if (["CONFIRMED", "CLOSED"].includes(state)) return "success";
  if (state === "CANCELLED") return "danger";
  if (state === "DRAFT") return "warning";
  return "info";
}
