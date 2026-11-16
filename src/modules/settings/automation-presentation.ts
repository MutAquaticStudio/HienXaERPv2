/**
 * F5 + D93 "Quy tắc tự động": every notification the system sends, in one list. A row is either a notification kind
 * that rules can react to (kind "event"), or a push the system sends by itself that the Owner can turn off ("builtin").
 * The permission is the one the notification carries (`private.notify(..., permission, ...)`): only people holding it in
 * the branch receive it, whoever a rule names.
 */
export type CatalogueGroup = "sales" | "purchase" | "delivery" | "worker" | "customer" | "finance" | "updates";

export const CATALOGUE_GROUPS: { value: CatalogueGroup; label: string }[] = [
  { value: "sales", label: "Bán hàng" },
  { value: "purchase", label: "Mua hàng" },
  { value: "delivery", label: "Giao hàng & điều phối" },
  { value: "worker", label: "Thợ" },
  { value: "customer", label: "Khách hàng" },
  { value: "finance", label: "Công nợ & kho" },
  { value: "updates", label: "Tin cập nhật" },
];

type EventItem = {
  kind: "event"; value: string; group: CatalogueGroup; label: string; detail: string; permission: string; who: string;
  amount?: true; problems?: true; personal?: true; sample: { title: string; body: string };
};
type BuiltinItem = {
  kind: "builtin"; value: string; group: CatalogueGroup; label: string; detail: string; who: string;
  audience: "staff" | "customer"; permission: string | null; popup?: true; money?: true; event?: string;
};
export type CatalogueItem = EventItem | BuiltinItem;

export const AUTOMATION_EVENTS = [
  { kind: "event", value: "order.portal_submitted", group: "sales", label: "Đơn khách mới", detail: "Khách tự đặt đơn trên cổng khách", permission: "orders.confirm",
    who: "Người có quyền duyệt đơn bán", amount: true, sample: { title: "Đơn mới từ khách: Anh Tuấn", body: "Nhà phố Phú Mỹ · 52.300.000 ₫" } },
  { kind: "event", value: "order.portal_cancelled", group: "sales", label: "Khách hủy đơn", detail: "Khách hủy đơn đã đặt trên cổng", permission: "orders.read",
    who: "Người có quyền xem đơn bán", amount: true, sample: { title: "Khách hủy đơn SO-2026-0415", body: "Anh Tuấn · Đổi ngày giao" } },
  { kind: "event", value: "order.portal_auto_approved", group: "sales", label: "Đơn khách tự duyệt khi kho có hàng", detail: "Đơn khách chờ duyệt được tự duyệt khi kho nhập thêm hàng (D88)",
    permission: "orders.read", who: "Người có quyền xem đơn bán", amount: true, sample: { title: "Đã tự duyệt đơn khách: Anh Tuấn", body: "SO-2026-0415 · 2 mặt hàng · 1.400.000 ₫" } },
  { kind: "event", value: "sales_order.needs_purchase", group: "sales", label: "Đơn bán cần đặt nhà cung cấp", detail: "Không tự tạo được đơn mua cho đơn bán",
    permission: "purchasing.create", who: "Người có quyền mua hàng", amount: true, sample: { title: "SO-2026-0415 cần đặt nhà cung cấp", body: "Xi măng Hà Tiên 50 bao" } },
  { kind: "event", value: "sales_order.short_source", group: "sales", label: "Đơn bán thiếu nguồn hàng", detail: "Kho và nhà cung cấp chưa đủ hàng cho đơn",
    permission: "purchasing.create", who: "Người có quyền mua hàng", amount: true, sample: { title: "SO-2026-0415 thiếu nguồn hàng", body: "Thép D10 thiếu 20 cây" } },
  { kind: "event", value: "service_request.submitted", group: "sales", label: "Yêu cầu dịch vụ mới", detail: "Khách gửi yêu cầu dịch vụ trên cổng",
    permission: "service.manage", who: "Người có quyền quản lý dịch vụ", sample: { title: "Yêu cầu dịch vụ mới từ khách: Anh Tuấn", body: "Cắt sắt · Thủ Đức" } },
  { kind: "event", value: "service_request.cancelled", group: "sales", label: "Khách hủy yêu cầu dịch vụ", detail: "Khách hủy yêu cầu đã gửi",
    permission: "service.read", who: "Người có quyền xem dịch vụ", sample: { title: "Khách hủy yêu cầu dịch vụ YC-0012", body: "Anh Tuấn" } },
  { kind: "event", value: "purchase.draft_ready", group: "purchase", label: "Đơn mua nháp cần duyệt", detail: "Có đơn mua nháp chờ duyệt", permission: "purchasing.confirm",
    who: "Người có quyền duyệt đơn mua", amount: true, sample: { title: "Đơn mua nháp cần duyệt: PO-2026-0102", body: "Nhà cung cấp Hòa Phát · 18.500.000 ₫" } },
  { kind: "event", value: "purchase.unsent_digest", group: "purchase", label: "Đơn mua chưa gửi nhà cung cấp", detail: "07:00 mỗi sáng, gộp một tin",
    permission: "purchasing.read", who: "Người có quyền xem mua hàng", sample: { title: "Đơn mua chưa gửi NCC: 3", body: "Gửi đơn mua cho nhà cung cấp qua Zalo từ trang đơn mua." } },
  { kind: "event", value: "delivery.result_submitted", group: "delivery", label: "Phiếu giao có kết quả", detail: "Tài xế báo kết quả giao", permission: "delivery.verify",
    who: "Người có quyền xác minh giao hàng", problems: true, sample: { title: "DLV-0415 giao thiếu", body: "Thiếu 5 bao · Nhà phố Phú Mỹ" } },
  { kind: "event", value: "work.declined", group: "delivery", label: "Thợ từ chối việc", detail: "Thợ bấm “Từ chối” một việc", permission: "delivery.assign",
    who: "Người có quyền điều phối", sample: { title: "Hùng từ chối DLV-0415", body: "Ngõ hẹp, xe không vào được" } },
  { kind: "event", value: "delivery.claimed", group: "delivery", label: "Thợ nhận phiếu giao", detail: "Thợ tự nhận phiếu giao ở “Nhận việc”", permission: "delivery.assign",
    who: "Người có quyền điều phối", sample: { title: "Hùng đã nhận DLV-0415", body: "51C-123.45 · 08:00 17/11 · Nhà phố Phú Mỹ" } },
  { kind: "event", value: "delivery.waiting_dispatch", group: "delivery", label: "Phiếu giao chờ điều phối", detail: "Phiếu giao mới chưa có xe, người",
    permission: "delivery.assign", who: "Người có quyền điều phối", sample: { title: "DLV-0415 chờ điều phối", body: "Nhà phố Phú Mỹ · 08:00 17/11" } },
  { kind: "event", value: "delivery.dispatch_suggested", group: "delivery", label: "Có gợi ý điều phối", detail: "Hệ thống gợi ý xe và người cho phiếu",
    permission: "delivery.assign", who: "Người có quyền điều phối", sample: { title: "Gợi ý điều phối DLV-0415", body: "Xe 51C-123.45 · Hùng" } },
  { kind: "event", value: "sales_order.needs_delivery", group: "delivery", label: "Đơn bán chờ lập phiếu giao", detail: "Đơn đã duyệt chưa có phiếu giao",
    permission: "delivery.create", who: "Người có quyền lập phiếu giao", amount: true, sample: { title: "SO-2026-0415 chờ lập phiếu giao", body: "Anh Tuấn · Nhà phố Phú Mỹ" } },
  { kind: "event", value: "delivery.field_assigned", group: "delivery", label: "Thợ chính giao phiếu", detail: "Thợ chính giao hoặc đổi người một phiếu giao",
    permission: "delivery.assign", who: "Người có quyền điều phối", sample: { title: "Tuấn đã giao DLV-0415 cho Hùng", body: "08:00 17/11 · Nhà phố Phú Mỹ" } },
  { kind: "event", value: "work.field_assigned", group: "delivery", label: "Thợ chính giao việc dịch vụ", detail: "Thợ chính giao hoặc đổi người một việc dịch vụ",
    permission: "work.manage", who: "Người có quyền quản lý việc", sample: { title: "Tuấn đã giao DV-0012 cho Hùng", body: "Cắt sắt · 08:00 17/11" } },
  { kind: "event", value: "work.assigned", group: "worker", label: "Việc mới", detail: "Văn phòng hoặc thợ chính giao việc", permission: "work.claim",
    who: "Chỉ thợ được giao", personal: true, sample: { title: "Việc mới: giao 20 bao xi măng", body: "Nhà phố Phú Mỹ · 08:00 17/11" } },
  { kind: "event", value: "work.delivery_split", group: "worker", label: "Phiếu giao đã được tách", detail: "Văn phòng tách phiếu thợ đang làm", permission: "work.claim",
    who: "Chỉ thợ đang giữ phiếu", personal: true, sample: { title: "Phiếu DLV-0415 đã được tách", body: "Việc cũ đã hủy. Phiếu mới: DLV-0416, DLV-0417." } },
  { kind: "event", value: "customer.self_registered", group: "customer", label: "Khách tự đăng ký tài khoản", detail: "Khách mới đăng ký trên cổng",
    permission: "customers.manage", who: "Người có quyền quản lý khách", sample: { title: "Khách mới tự đăng ký: Anh Tuấn", body: "0901 234 567 · Thủ Đức" } },
  { kind: "event", value: "customer.portal_link_requested", group: "customer", label: "Đăng ký trùng số điện thoại", detail: "Khách đăng ký trùng số của khách đã có",
    permission: "customers.manage", who: "Người có quyền quản lý khách", sample: { title: "Đăng ký cổng khách trùng số điện thoại: Anh Tuấn", body: "Duyệt gắn tài khoản, tạo khách mới hoặc từ chối." } },
  { kind: "event", value: "finance.overdue_digest", group: "finance", label: "Nợ quá hạn", detail: "07:00 mỗi sáng, gộp một tin", permission: "finance.ar.read",
    who: "Người có quyền xem công nợ", sample: { title: "Nợ quá hạn: 4 khoản", body: "Tổng còn phải thu quá hạn 38.400.000 ₫" } },
  { kind: "event", value: "inventory.low_stock_digest", group: "finance", label: "Tồn dưới ngưỡng", detail: "07:00 mỗi sáng, gộp một tin", permission: "inventory.read",
    who: "Người có quyền xem kho", sample: { title: "Tồn dưới ngưỡng: 6 mặt hàng", body: "Mở danh sách tồn thấp và lập đơn mua khi cần." } },
  { kind: "event", value: "payment.bank_received", group: "finance", label: "Đã nhận tiền chuyển khoản", detail: "Tiền về tài khoản ngân hàng khớp khách",
    permission: "finance.ar.read", who: "Người có quyền xem công nợ", sample: { title: "Đã nhận 5.000.000 ₫ — Anh Tuấn", body: "SO-2026-0415 · còn nợ 0 ₫" } },
  { kind: "event", value: "payment.bank_needs_review", group: "finance", label: "Tiền về chưa khớp khách", detail: "Chuyển khoản chưa tìm được khách",
    permission: "finance.payment.post", who: "Người có quyền ghi thu chi", sample: { title: "Tiền về chưa khớp khách: 2.000.000 ₫", body: "CK Tuan thanh toan" } },
] as const satisfies readonly EventItem[];

export const BUILTIN_PUSHES = [
  { kind: "builtin", value: "work.assigned", event: "work.assigned", group: "worker", label: "Việc mới (có sẵn)", detail: "Báo thợ được giao khi không có quy tắc “Việc mới”",
    who: "Chỉ thợ được giao", audience: "staff", permission: "work.claim" },
  { kind: "builtin", value: "delivery.pool_open", group: "worker", label: "Phiếu giao chờ người nhận", detail: "Có phiếu ở “Nhận việc” mà thợ nhận được",
    who: "Thợ có xe rảnh, chưa từ chối phiếu", audience: "staff", permission: "work.claim" },
  { kind: "builtin", value: "field_dispatch", group: "worker", label: "Thợ chính: việc chờ người, thợ từ chối", detail: "Có việc chưa ai nhận / thợ từ chối",
    who: "Thợ chính được cấp quyền điều phối hiện trường", audience: "staff", permission: "work.field_dispatch" },
  { kind: "builtin", value: "announcement.pay_rate", group: "worker", label: "Đơn giá công mới", detail: "Văn phòng lưu đơn giá công", who: "Thợ có đơn giá đổi",
    audience: "staff", permission: "work.read", popup: true },
  { kind: "builtin", value: "customer.order_confirmed", group: "customer", label: "Đơn đã được duyệt", detail: "Kể cả đơn tự duyệt; kèm giờ giao dự kiến",
    who: "Tài khoản cổng của khách", audience: "customer", permission: null },
  { kind: "builtin", value: "customer.delivery_dispatched", group: "customer", label: "Xe đang đến", detail: "Xe rời kho chở hàng tới công trình",
    who: "Tài khoản cổng của khách", audience: "customer", permission: null },
  { kind: "builtin", value: "customer.delivery_done", group: "customer", label: "Đã giao xong", detail: "Văn phòng xác nhận giao đủ; ghi “Có ảnh xác nhận” nếu có",
    who: "Tài khoản cổng của khách", audience: "customer", permission: null },
  { kind: "builtin", value: "customer.delivery_problem", group: "customer", label: "Giao thiếu / không giao được", detail: "Kèm lý do tài xế ghi",
    who: "Tài khoản cổng của khách", audience: "customer", permission: null },
  { kind: "builtin", value: "customer.order_cancelled", group: "customer", label: "Đơn bị hủy", detail: "Cửa hàng hủy đơn; kèm lý do như trên cổng",
    who: "Tài khoản cổng của khách", audience: "customer", permission: null },
  { kind: "builtin", value: "customer.payment_received", group: "customer", label: "Đã nhận tiền", detail: "Số tiền và số còn nợ", who: "Chủ tài khoản và Kế toán của khách",
    audience: "customer", permission: null, money: true },
  { kind: "builtin", value: "customer.debt_reminder", group: "customer", label: "Nhắc nợ đến hạn", detail: "08:30 mỗi sáng, nợ đến hạn trong 3 ngày; một tin mỗi khách",
    who: "Chủ tài khoản và Kế toán của khách", audience: "customer", permission: null, money: true },
  { kind: "builtin", value: "announcement.customer_price", group: "customer", label: "Giá của khách đổi", detail: "Lưu giá bán làm giá của khách đó đổi",
    who: "Chủ tài khoản và Kế toán của khách", audience: "customer", permission: null, popup: true, money: true },
  { kind: "builtin", value: "announcement.office_price", group: "updates", label: "Giá chung đổi", detail: "Lưu giá chung (giá lẻ)", who: "Nhân viên xem được giá bán",
    audience: "staff", permission: "pricing.read", popup: true },
  { kind: "builtin", value: "announcement.manual", group: "updates", label: "Tin cập nhật anh/chị soạn", detail: "Khi anh/chị bấm Gửi ở “Soạn thông báo cập nhật”",
    who: "Người anh/chị chọn khi soạn", audience: "staff", permission: null, popup: true },
] as const satisfies readonly BuiltinItem[];

export type AutomationEvent = (typeof AUTOMATION_EVENTS)[number]["value"];
export type BuiltinKey = (typeof BUILTIN_PUSHES)[number]["value"];
export const BUILTIN_KEYS = BUILTIN_PUSHES.map((item) => item.value) as [BuiltinKey, ...BuiltinKey[]];

export const AUTOMATION_CHANNELS = [
  { value: "PUSH", label: "Điện thoại", detail: "Thông báo trên điện thoại / máy tính đã bật nhận" },
  { value: "WEBHOOK", label: "Webhook (hệ thống khác)", detail: "Gửi dữ liệu tới n8n, Google Apps Script…" },
] as const;
export type AutomationChannel = (typeof AUTOMATION_CHANNELS)[number]["value"];

export type RecipientMode = "PERMISSION" | "ROLES" | "PEOPLE";
export const RECIPIENT_MODES: { value: RecipientMode; label: string; detail: string }[] = [
  { value: "PERMISSION", label: "Người phụ trách theo quyền", detail: "Như hiện nay: mọi người có quyền xem việc này" },
  { value: "ROLES", label: "Chọn vai trò", detail: "Ví dụ chỉ Quản lý chi nhánh" },
  { value: "PEOPLE", label: "Chọn người", detail: "Đích danh từng người" },
];

/** D93 (4): quiet-hours exceptions the Owner can tick. */
export const QUIET_EXEMPTIONS = [
  { value: "worker_jobs", label: "Việc của thợ trong ngày (việc mới, phiếu giao chờ người nhận)" },
  { value: "delivery_problems", label: "Giao thiếu / không giao được" },
  { value: "order.portal_submitted", label: "Đơn khách mới" },
] as const;
export type QuietExemption = (typeof QUIET_EXEMPTIONS)[number]["value"];

export const automationEventItem = (value: string) => AUTOMATION_EVENTS.find((event) => event.value === value);
export const automationEventLabel = (value: string) => automationEventItem(value)?.label ?? "Sự kiện khác";
export const automationChannelLabel = (value: string) => AUTOMATION_CHANNELS.find((channel) => channel.value === value)?.label ?? "Kênh khác";

export const outboundStateLabel: Record<string, string> = { PENDING: "Chờ gửi", SENDING: "Đang gửi", SENT: "Đã gửi", FAILED: "Gửi lại sau", DEAD: "Ngừng gửi",
  HELD: "Chờ hết giờ yên lặng", MERGED: "Đã gộp vào một tin" };

export type AutomationRule = { id: string; name: string; event: string; min_amount_vnd: string | null; problems_only: boolean; channels: AutomationChannel[];
  target: string | null; active: boolean; version: number; updated_at: string; recipient_mode: RecipientMode; role_ids: string[]; employee_ids: string[] };
export type OutboundJob = { id: string; channel: string; title: string | null; state: string; attempt: number; last_error: string | null; created_at: string;
  sent_at: string | null; rule_name: string | null };
export type Person = { id: string; name: string; role_id: string; role_name: string; devices: number; permissions: string[] };
export type QuietHours = { enabled: boolean; start_minute: number; end_minute: number; exempt_keys: QuietExemption[]; version: number };
export type AutomationOverview = {
  rules: AutomationRule[]; jobs: OutboundJob[]; push_devices: number; my_devices: number;
  setup: { pg_net: boolean; pg_cron: boolean; webhook_secret: boolean; app_delivery: boolean };
  builtins: Record<string, boolean>; quiet_hours: QuietHours | null; people: Person[]; roles: { id: string; name: string }[];
  customers: { people: number; devices: number } | null;
};

export const DEFAULT_QUIET_HOURS: QuietHours = { enabled: false, start_minute: 21 * 60, end_minute: 6 * 60 + 30, exempt_keys: ["worker_jobs", "delivery_problems"], version: 0 };

/** "21:00" from minutes after midnight, and back ("" when not a time). */
export const minuteToTime = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
export function timeToMinute(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export type Reach = { chosen: number; allowed: number; enabled: number; devices: number; blocked: Person[]; off: Person[] };

/** Who a rule reaches: the chosen people, of them who may see the notification, and how many devices they switched on. */
export function ruleReach(people: Person[], permission: string | null, mode: RecipientMode, roleIds: string[], employeeIds: string[]): Reach {
  const chosen = people.filter((person) => mode === "PERMISSION" ? permission === null || person.permissions.includes(permission)
    : mode === "ROLES" ? roleIds.includes(person.role_id) : employeeIds.includes(person.id));
  const allowed = chosen.filter((person) => permission === null || person.permissions.includes(permission));
  return {
    chosen: chosen.length, allowed: allowed.length, enabled: allowed.filter((person) => person.devices > 0).length,
    devices: allowed.reduce((sum, person) => sum + person.devices, 0),
    blocked: chosen.filter((person) => !allowed.includes(person)), off: allowed.filter((person) => person.devices === 0),
  };
}

export const reachText = (reach: Pick<Reach, "allowed" | "devices">) => `${reach.allowed} người · ${reach.devices} máy đang bật`;

export function recipientSummary(rule: Pick<AutomationRule, "recipient_mode" | "role_ids" | "employee_ids">, overview: Pick<AutomationOverview, "roles" | "people">, fallback: string) {
  if (rule.recipient_mode === "ROLES") {
    const names = overview.roles.filter((role) => rule.role_ids.includes(role.id)).map((role) => role.name);
    return names.length ? `Vai trò: ${names.join(", ")}` : "Vai trò đã chọn";
  }
  if (rule.recipient_mode === "PEOPLE") {
    const names = overview.people.filter((person) => rule.employee_ids.includes(person.id)).map((person) => person.name);
    return names.length ? names.join(", ") : "Người đã chọn";
  }
  return fallback;
}

export function conditionText(rule: Pick<AutomationRule, "min_amount_vnd" | "problems_only">, formatAmount: (value: string) => string) {
  if (rule.min_amount_vnd) return `Từ ${formatAmount(rule.min_amount_vnd)}`;
  if (rule.problems_only) return "Chỉ khi giao có vấn đề";
  return "Mọi lần";
}

export type CatalogueRow =
  | { type: "rule"; key: string; group: CatalogueGroup; rule: AutomationRule; item: EventItem | undefined }
  | { type: "builtin"; key: string; group: CatalogueGroup; item: BuiltinItem; enabled: boolean; overridden: AutomationRule | null }
  | { type: "app"; key: string; group: CatalogueGroup; item: EventItem };

export type CatalogueFilter = "all" | "phone" | "app" | "mine";

/** The grouped list: each rule; each built-in push; each notification kind without a rule ("Chỉ trong app"). */
export function catalogueRows(overview: Pick<AutomationOverview, "rules" | "builtins">): CatalogueRow[] {
  const rows: CatalogueRow[] = [];
  for (const item of AUTOMATION_EVENTS) {
    const rules = overview.rules.filter((rule) => rule.event === item.value);
    for (const rule of rules) rows.push({ type: "rule", key: `rule:${rule.id}`, group: item.group, rule, item });
    if (!rules.length) rows.push({ type: "app", key: `app:${item.value}`, group: item.group, item });
  }
  for (const rule of overview.rules) {
    if (!automationEventItem(rule.event)) rows.push({ type: "rule", key: `rule:${rule.id}`, group: "sales", rule, item: undefined });
  }
  for (const item of BUILTIN_PUSHES) {
    const event = "event" in item ? item.event : undefined;
    const overridden = event ? overview.rules.find((rule) => rule.event === event && rule.active && rule.channels.includes("PUSH")) ?? null : null;
    rows.push({ type: "builtin", key: `builtin:${item.value}`, group: item.group, item, enabled: overview.builtins[item.value] ?? true, overridden });
  }
  const order = (row: CatalogueRow) => CATALOGUE_GROUPS.findIndex((group) => group.value === row.group);
  return rows.map((row, index) => ({ row, index })).sort((a, b) => order(a.row) - order(b.row) || a.index - b.index).map(({ row }) => row);
}

export const rowSendsToPhone = (row: CatalogueRow) => row.type === "builtin" ? row.enabled
  : row.type === "rule" ? row.rule.active && row.rule.channels.includes("PUSH") : false;

export function filterRows(rows: CatalogueRow[], filter: CatalogueFilter) {
  if (filter === "phone") return rows.filter(rowSendsToPhone);
  if (filter === "app") return rows.filter((row) => row.type === "app");
  if (filter === "mine") return rows.filter((row) => row.type === "rule");
  return rows;
}

/** A queue state in words; unknown or inherited names ("constructor") read as "Đang cập nhật". */
export const outboundStateText = (state: string) => Object.hasOwn(outboundStateLabel, state) ? outboundStateLabel[state] : "Đang cập nhật";
