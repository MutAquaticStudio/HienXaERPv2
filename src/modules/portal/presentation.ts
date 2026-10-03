import { salesStateLabel as canonicalSalesStateLabel } from "@/modules/sales/presentation";
export { salesStateTone } from "@/modules/sales/presentation";

function label(mapping: Record<string, string>, value: string | null | undefined, domain: string, fallback: string) {
  if (value && mapping[value]) return mapping[value];
  if (value) console.warn("portal_status_unrecognized", { domain });
  return fallback;
}
export function workStateLabel(value?: string | null) {
  return label({ AVAILABLE: "Sẵn sàng nhận việc", CLAIMED: "Đã nhận việc", IN_PROGRESS: "Đang thực hiện", BLOCKED: "Đang vướng", DONE: "Chờ xác minh", VERIFIED: "Đã xác minh", CANCELLED: "Đã hủy" }, value, "work", "Trạng thái đang cập nhật");
}
export function workKindLabel(value?: string | null) {
  return label({ DELIVERY: "Chuyến giao hàng", SERVICE: "Công việc dịch vụ" }, value, "work_kind", "Công việc");
}
export function earningStateLabel(value?: string | null) {
  return label({ DRAFT: "Chờ duyệt", APPROVED: "Đã duyệt", PAID: "Đã thanh toán", RECORDED: "Đã ghi nhận" }, value, "earning", "Khoản đang cập nhật");
}
export function earningKindLabel(value?: string | null) {
  return label({ DIRECT_LABOR: "Thu nhập công việc", OPEX: "Chi phí vận hành", SALES_COMMISSION: "Hoa hồng bán hàng", DELIVERY_PIECEWORK: "Thu nhập giao hàng", SERVICE_PIECEWORK: "Thu nhập dịch vụ", SALARY: "Lương", ADVANCE: "Tạm ứng" }, value, "earning_kind", "Khoản thu nhập");
}
export function salesStateLabel(value?: string | null) {
  if (!value) return "Trạng thái đang cập nhật";
  const translated = canonicalSalesStateLabel(value);
  if (translated !== value) return translated;
  console.warn("portal_status_unrecognized", { domain: "sales" });
  return "Trạng thái đang cập nhật";
}
