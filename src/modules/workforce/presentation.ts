function lookupLabel(labels: Record<string, string>, value: string | null | undefined, fallback: string) {
  return value && Object.hasOwn(labels, value) ? labels[value] : fallback;
}

export function earningTypeLabel(value?: string | null) {
  return lookupLabel({ FIXED_MONTHLY: "Lương tháng", PER_JOB: "Theo công việc", PER_TRIP: "Theo chuyến", PER_HOUR: "Theo giờ", PER_SHIFT: "Theo ca", PER_DAY: "Theo ngày", PER_TON: "Theo tấn", PER_M3: "Theo mét khối", PER_BAG: "Theo bao", PER_UNIT: "Theo đơn vị", BONUS: "Thưởng", ADJUSTMENT: "Điều chỉnh", SALES_COMMISSION: "Hoa hồng bán hàng" }, value, "Khoản thu nhập");
}

export function earningClassificationLabel(value?: string | null) {
  return lookupLabel({ DIRECT_LABOR: "Chi phí nhân công trực tiếp", OPEX: "Chi phí vận hành", SALES_COMMISSION: "Hoa hồng bán hàng" }, value, "Khoản thu nhập");
}

export function recognitionKindLabel(value?: string | null) {
  return lookupLabel({ WORK_ITEM_VERIFICATION: "Xác minh kết quả công việc", AR_PAYMENT_ALLOCATION: "Phân bổ tiền thu vào công nợ" }, value, "Ghi nhận từ nghiệp vụ");
}

/** D75: a customer's service request as the store sees it (the customer's own wording is in modules/portal/service-request). */
export function serviceRequestStateLabel(value?: string | null) {
  return lookupLabel({ SUBMITTED: "Chờ xác nhận lịch", SCHEDULED: "Đã xếp lịch", CANCELLED: "Khách đã hủy", REJECTED: "Đã từ chối" }, value, "Trạng thái đang cập nhật");
}

export function serviceStateLabel(value?: string | null) {
  return lookupLabel({ SCHEDULED: "Đã lên lịch", PLANNED: "Đã lên lịch", IN_PROGRESS: "Đang thực hiện", RESULT_SUBMITTED: "Chờ xác minh", COMPLETED: "Đã hoàn tất", VERIFIED: "Đã xác minh", CANCELLED: "Đã hủy" }, value, "Trạng thái đang cập nhật");
}
