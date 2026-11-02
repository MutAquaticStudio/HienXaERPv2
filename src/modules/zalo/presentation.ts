/** D47 Zalo OA phase 1: the events, their template parameters and the connection states, in Vietnamese. */
export const ZALO_EVENTS = [
  { code: "ORDER_CONFIRMED", label: "Đơn được xác nhận", tag: "Giao dịch (Tag 1)", sample: "Hiền Xa xác nhận đơn <order_code> ngày <order_date>, tổng <total>, giao tới <site>." },
  { code: "DELIVERY_DONE", label: "Đã giao hàng", tag: "Giao dịch (Tag 1)", sample: "Phiếu giao <delivery_code> đã giao tới <site> lúc <delivered_at>. Người nhận: <receiver>." },
  { code: "PAYMENT_RECEIVED", label: "Đã nhận tiền", tag: "Giao dịch (Tag 1)", sample: "Hiền Xa đã nhận <amount> của <customer> lúc <paid_at>. Dư nợ còn <balance>." },
  { code: "DEBT_REMINDER", label: "Nhắc công nợ (8:30 mỗi ngày)", tag: "Chăm sóc khách hàng (Tag 2)", sample: "Nhắc công nợ: <customer> còn <balance>, đến hạn <due_date>." },
] as const;

export type ZaloEventCode = (typeof ZALO_EVENTS)[number]["code"];
export const ZALO_EVENT_CODES = ZALO_EVENTS.map((event) => event.code) as [ZaloEventCode, ...ZaloEventCode[]];

export type ZaloTemplate = { event_code: ZaloEventCode; template_id: string | null; active: boolean; version: number; params: string[] };
export type ZaloStatus = {
  state: "DISCONNECTED" | "CONNECTED" | "NEEDS_RECONNECT";
  app_id: string | null; oa_id: string | null; send_mode: "development" | "production";
  access_expires_at: string | null; refresh_expires_at: string | null; connected_at: string | null;
  daily_quota: number | null; remaining_quota: number | null; last_error: string | null; app_secret_set: boolean;
  templates: ZaloTemplate[];
  last_24h: { sent: number; waiting: number; dead: number };
};

export const ZALO_STATE_LABEL: Record<ZaloStatus["state"], string> = {
  DISCONNECTED: "Chưa kết nối",
  CONNECTED: "Đã kết nối",
  NEEDS_RECONNECT: "Cần kết nối lại",
};

/** Database refusals of the Zalo commands, in plain Vietnamese (never the technical code). */
export function zaloMessage(value?: string) {
  if (value?.includes("zalo_app_id_invalid")) return "App ID là dãy số trên trang developers.zalo.me của ứng dụng.";
  if (value?.includes("zalo_redirect_invalid")) return "Địa chỉ ứng dụng chưa phải https. Cấu hình NEXT_PUBLIC_APP_URL bằng tên miền https rồi thử lại.";
  if (value?.includes("zalo_oauth_state_invalid")) return "Phiên kết nối đã hết hạn hoặc không khớp. Bấm “Kết nối Zalo OA” lại.";
  if (value?.includes("zalo_oauth_code_missing")) return "Zalo không trả mã cấp quyền. Bấm “Kết nối Zalo OA” lại và chọn Cho phép.";
  if (value?.includes("zalo_app_secret_missing")) return "Chưa lưu khóa bí mật của Zalo App (hx_zalo_app_secret) trong Supabase Vault.";
  if (value?.includes("zalo_token_refused")) return "Zalo từ chối cấp quyền. Kiểm tra App ID, khóa bí mật và địa chỉ gọi lại trong Zalo App rồi kết nối lại.";
  if (value?.includes("zalo_http_unavailable")) return "Cơ sở dữ liệu chưa bật tiện ích gọi HTTP (http). Bật trong Supabase → Database → Extensions.";
  if (value?.includes("zalo_vault_unavailable")) return "Cơ sở dữ liệu chưa có Supabase Vault để giữ token.";
  if (value?.includes("zalo_template_required")) return "Nhập mã mẫu tin (template ID) Zalo đã duyệt trước khi bật.";
  if (value?.includes("zalo_template_invalid")) return "Mã mẫu tin là dãy số Zalo cấp khi duyệt mẫu.";
  if (value?.includes("zalo_template_version_conflict")) return "Mẫu tin vừa được người khác sửa. Tải lại trang rồi sửa lại.";
  if (value?.includes("zalo_phone_invalid")) return "Nhập số di động Việt Nam (ví dụ 0912 345 678).";
  if (value?.includes("zalo_not_connected")) return "Zalo OA chưa kết nối. Kết nối trước rồi gửi thử.";
  if (value?.includes("zalo_mode_invalid")) return "Chế độ gửi không hợp lệ.";
  if (value?.includes("forbidden")) return "Bạn không có quyền thực hiện thao tác này.";
  return "Chưa thực hiện được. Không có thay đổi nào được ghi.";
}
