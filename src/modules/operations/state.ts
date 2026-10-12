export function historicalScopeLabel(historicalQuality: unknown): string {
 return historicalQuality === "VERIFIED_IMPORT_SCOPE"
  ? "Đã đối chiếu trong phạm vi lịch sử đã nhập"
  : "Lịch sử chưa đối chiếu";
}

export function recordingScopeText(historicalQuality: unknown): string {
 return historicalQuality === "VERIFIED_IMPORT_SCOPE"
  ? "Theo dữ liệu đã ghi nhận, gồm phạm vi lịch sử đã nhập và đối chiếu. Số liệu này chưa xác minh tổng số dư toàn doanh nghiệp."
  : "Theo giao dịch đã ghi nhận; lịch sử chưa đối chiếu. Số liệu này chưa xác minh tổng số dư toàn doanh nghiệp.";
}
