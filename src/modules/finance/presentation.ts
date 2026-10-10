function lookupLabel(labels: Record<string, string>, value: string | null | undefined, fallback: string) {
  return value && Object.hasOwn(labels, value) ? labels[value] : fallback;
}

export function financeStateLabel(value?: string | null) {
  return lookupLabel({
    OPEN: "Còn hạn", CLOSED: "Đã hoàn tất", OVERDUE: "Quá hạn", SETTLED: "Đã tất toán",
    POSTED: "Đã ghi sổ", REVERSED: "Đã đảo giao dịch", UNMATCHED: "Chưa đối soát",
    MATCHED: "Đã đối soát", PARTIAL: "Đối soát một phần", PARTIALLY_MATCHED: "Đối soát một phần",
    MISMATCHED: "Có chênh lệch", DISCREPANCY: "Có chênh lệch", DRAFT: "Chờ duyệt",
    APPROVED: "Đã duyệt", CANCELLED: "Đã hủy", SUBMITTED: "Chờ kiểm tra",
    UNDER_REVIEW: "Đang kiểm tra", ACCEPTED: "Đã chấp nhận", VERIFIED: "Đã xác minh", REJECTED: "Đã từ chối",
  }, value, "Trạng thái đang cập nhật");
}

export function financeSourceLabel(value?: string | null) {
  const labels: Record<string, string> = {
    OPENING_BALANCE: "Số dư đầu kỳ", OPENING_IMPORT: "Nhập số dư đầu kỳ",
    DELIVERY_VERIFICATION: "Giao hàng đã xác minh", SERVICE_VERIFICATION: "Dịch vụ đã xác minh",
    SERVICE_JOB_VERIFICATION: "Dịch vụ đã xác minh", PURCHASE_RECEIPT: "Nhận hàng vào kho",
    PURCHASE_FULFILLMENT: "Đơn mua đã hoàn tất", SUPPLIER_FULFILLMENT: "Nhà cung cấp giao thẳng đã xác minh",
    EXPENSE: "Chi phí đã duyệt", EARNING_EVENT: "Thu nhập nhân sự đã duyệt",
    WORK_ITEM_VERIFICATION: "Công việc đã xác minh", AR_PAYMENT_ALLOCATION: "Phân bổ tiền thu",
    MANUAL_BASIS: "Căn cứ tính thủ công", SALES_ORDER: "Đơn bán", PAYMENT: "Phiếu thu/chi",
  };
  if (value && Object.hasOwn(labels, value)) return labels[value];
  // Human source labels and document references are data, not enum values.
  if (value && (/[À-ỹ]/.test(value) || /^[A-Z0-9]+[-/][A-Z0-9/-]+$/.test(value))) return value;
  return "Chứng từ nghiệp vụ";
}

export function activityKindLabel(value?: string | null) {
  return lookupLabel({ OPERATIONS: "Vận hành", SALES: "Bán hàng", DELIVERY: "Giao hàng", SERVICE: "Dịch vụ", ADMIN: "Hành chính" }, value, "Hoạt động khác");
}

export function reportQualityLabel(value?: string | null) {
  return lookupLabel({ READY: "Sẵn sàng", NO_DATA: "Chưa có dữ liệu", NOT_APPLICABLE: "Không áp dụng", UNAVAILABLE: "Chưa có dữ liệu", NOT_READY: "Chưa đủ dữ liệu", INCOMPLETE: "Chưa đủ dữ liệu", ERROR: "Không thể tải dữ liệu", FORBIDDEN: "Không có quyền xem", BLOCKED: "Chưa đủ điều kiện", PARTIAL: "Dữ liệu chưa đầy đủ" }, value, "Đang kiểm tra dữ liệu");
}

export function reportExportStateLabel(value?: string | null) {
  return lookupLabel({ QUEUED: "Đang chờ", PENDING: "Đang chờ", RUNNING: "Đang xử lý", PROCESSING: "Đang xử lý", RETRY_WAIT: "Chờ thử lại", COMPLETED: "Đã hoàn tất", FAILED: "Xuất tệp thất bại", CANCELLED: "Đã hủy" }, value, "Đang cập nhật");
}
