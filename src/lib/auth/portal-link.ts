/** D78: what a self-registration whose phone number the store already has is told, until the office decides. */
export const PORTAL_LINK_PENDING_MESSAGE = "Số điện thoại này đã có trong danh sách khách của cửa hàng. Cửa hàng sẽ kiểm tra và gắn tài khoản cho bạn, thường trong ngày; khi xong bạn đăng nhập lại là dùng được. Cần gấp thì gọi cửa hàng.";
export const PORTAL_LINK_REJECTED_MESSAGE = "Cửa hàng chưa nhận đăng ký này. Gọi cửa hàng để được hướng dẫn.";

export type PortalLinkDecision = "LINK" | "NEW_CUSTOMER" | "REJECT";

/** What the office sees after deciding, and the refusals of decide_portal_link_request in Vietnamese. */
export function portalLinkDoneMessage(decision: PortalLinkDecision): string {
  return decision === "LINK" ? "Đã gắn tài khoản vào khách này. Khách đăng nhập lại là dùng được."
    : decision === "NEW_CUSTOMER" ? "Đã tạo khách mới cho tài khoản này." : "Đã từ chối đăng ký này.";
}
export function portalLinkError(message: string): string {
  if (message.includes("portal_link_request_decided")) return "Yêu cầu này đã được xử lý. Tải lại trang để xem.";
  if (message.includes("portal_already_registered")) return "Tài khoản này đã được gắn với một khách. Tải lại trang để xem.";
  if (message.includes("customer_inactive")) return "Khách này đang ngừng hoạt động, không gắn được tài khoản.";
  if (message.includes("portal_user_missing")) return "Tài khoản đăng ký không còn. Chọn Từ chối để đóng yêu cầu.";
  if (/forbidden|42501/.test(message)) return "Bạn chưa có quyền quản lý khách hàng.";
  return "Chưa lưu được. Kiểm tra kết nối rồi thử lại.";
}
