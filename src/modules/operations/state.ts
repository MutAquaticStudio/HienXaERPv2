export const operationalLabels = {
 PENDING_OPENING: "Lịch sử chưa đối chiếu",
 READY_FOR_ACTIVATION: "Có hồ sơ lịch sử cần xem xét",
 ACTIVE: "Đang vận hành",
} as const;
export type OperationalState = keyof typeof operationalLabels;
export function operationalLabel(state: unknown): string {
 return typeof state === "string" && Object.hasOwn(operationalLabels, state)
  ? operationalLabels[state as OperationalState] : "Chưa xác minh trạng thái vận hành";
}
export function operationalNextStep(state: unknown): string {
 switch (state) {
  case "PENDING_OPENING": return "Giao dịch mới không cần số dư đầu kỳ hoặc kích hoạt thủ công. Các thao tác vẫn tuân theo quyền, nguồn và giới hạn nghiệp vụ; lịch sử chưa đối chiếu.";
  case "READY_FOR_ACTIVATION": return "Giao dịch mới không cần kích hoạt thủ công. Hồ sơ lịch sử được xử lý riêng theo phạm vi đã nhập và quyền phê duyệt.";
  case "ACTIVE": return "Các giao dịch tiếp tục tuân theo quyền, nguồn và giới hạn nghiệp vụ. Giữ nguyên mốc vận hành đã ghi nhận.";
  default: return "Chưa thể xác minh trạng thái. Kiểm tra lại kết nối hoặc liên hệ người quản trị trước khi ghi sổ.";
 }
}
export function recordingScopeText(historicalQuality: unknown): string {
 return historicalQuality === "VERIFIED_IMPORT_SCOPE"
  ? "Theo dữ liệu đã ghi nhận, gồm phạm vi lịch sử đã nhập và đối chiếu. Số liệu này chưa xác minh tổng số dư toàn doanh nghiệp."
  : "Theo giao dịch đã ghi nhận; lịch sử chưa đối chiếu. Số liệu này chưa xác minh tổng số dư toàn doanh nghiệp.";
}
export function activationIntent(branchId: string, version: number): string {
 return `ACTIVATE:${branchId}:${version}`;
}
