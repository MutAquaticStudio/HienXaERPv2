/** F5 "Quy tắc tự động": what a rule can react to (the in-app notification kinds) and where it can send. */
export const AUTOMATION_EVENTS = [
  { value: "order.portal_submitted", label: "Đơn mới khách tự đặt", amount: true },
  { value: "order.portal_cancelled", label: "Khách hủy đơn", amount: true },
  { value: "customer.self_registered", label: "Khách tự đăng ký tài khoản" },
  { value: "purchase.draft_ready", label: "Đơn mua nháp cần duyệt", amount: true },
  { value: "sales_order.needs_purchase", label: "Đơn bán cần đặt NCC (không tự tạo được đơn mua)", amount: true },
  { value: "sales_order.short_source", label: "Đơn bán thiếu nguồn hàng", amount: true },
  { value: "sales_order.needs_delivery", label: "Đơn bán chờ lập phiếu giao", amount: true },
  { value: "delivery.waiting_dispatch", label: "Phiếu giao chờ điều phối" },
  { value: "delivery.dispatch_suggested", label: "Có gợi ý điều phối" },
  { value: "delivery.result_submitted", label: "Phiếu giao có kết quả", problems: true },
  { value: "work.assigned", label: "Việc mới giao cho thợ" },
  { value: "work.declined", label: "Thợ từ chối việc" },
  { value: "finance.overdue_digest", label: "Nợ quá hạn (07:00 mỗi sáng)" },
  { value: "inventory.low_stock_digest", label: "Tồn dưới ngưỡng (07:00 mỗi sáng)" },
  { value: "purchase.unsent_digest", label: "Đơn mua chưa gửi NCC (07:00 mỗi sáng)" },
] as const;
export type AutomationEvent = (typeof AUTOMATION_EVENTS)[number]["value"];

export const AUTOMATION_CHANNELS = [
  { value: "PUSH", label: "Thông báo về điện thoại của người phụ trách", target: null },
  { value: "TELEGRAM", label: "Telegram (nhóm hoặc người)", target: "Mã nhóm/chat Telegram, ví dụ -1001234567890" },
  { value: "EMAIL", label: "Email", target: "Địa chỉ email nhận" },
  { value: "WEBHOOK", label: "Webhook (n8n, Google Apps Script…)", target: "Địa chỉ https nhận dữ liệu" },
] as const;
export type AutomationChannel = (typeof AUTOMATION_CHANNELS)[number]["value"];

export const automationEventLabel = (value: string) => AUTOMATION_EVENTS.find((event) => event.value === value)?.label ?? "Sự kiện khác";
export const automationChannelLabel = (value: string) => AUTOMATION_CHANNELS.find((channel) => channel.value === value)?.label ?? "Kênh khác";

export const outboundStateLabel: Record<string, string> = { PENDING: "Chờ gửi", SENDING: "Đang gửi", SENT: "Đã gửi", FAILED: "Gửi lại sau", DEAD: "Ngừng gửi" };

export type AutomationRule = { id: string; name: string; event: string; min_amount_vnd: string | null; problems_only: boolean; channel: AutomationChannel;
  target: string | null; active: boolean; version: number; updated_at: string };
export type OutboundJob = { id: string; channel: string; title: string | null; state: string; attempt: number; last_error: string | null; created_at: string;
  sent_at: string | null; rule_name: string | null };
export type AutomationOverview = { rules: AutomationRule[]; jobs: OutboundJob[]; push_devices: number;
  setup: { pg_net: boolean; pg_cron: boolean; telegram: boolean; webhook_secret: boolean; app_delivery: boolean } };
