import { salesStateLabel as canonicalSalesStateLabel } from "@/modules/sales/presentation";
import { deliveryStateLabel } from "@/modules/delivery/presentation";
import { financeStateLabel } from "@/modules/finance/presentation";
export { salesStateTone } from "@/modules/sales/presentation";

function label(mapping: Record<string, string>, value: string | null | undefined, domain: string, fallback: string) {
  if (value && Object.hasOwn(mapping, value)) return mapping[value];
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
  return label({ DIRECT_LABOR: "Thu nhập công việc", OPEX: "Chi phí vận hành", SALES_COMMISSION: "Hoa hồng bán hàng", DELIVERY_PIECEWORK: "Thu nhập giao hàng", SERVICE_PIECEWORK: "Thu nhập dịch vụ", SALARY: "Lương", ADVANCE: "Tạm ứng", FIXED_MONTHLY: "Lương tháng", PER_JOB: "Theo công việc", PER_TRIP: "Theo chuyến", PER_HOUR: "Theo giờ", PER_SHIFT: "Theo ca", PER_DAY: "Theo ngày", PER_TON: "Theo tấn", PER_M3: "Theo mét khối", PER_BAG: "Theo bao", PER_UNIT: "Theo đơn vị", BONUS: "Thưởng", ADJUSTMENT: "Điều chỉnh" }, value, "earning_kind", "Khoản thu nhập");
}
export function salesStateLabel(value?: string | null) {
  if (!value) return "Trạng thái đang cập nhật";
  const translated = canonicalSalesStateLabel(value);
  if (translated !== value) return translated;
  console.warn("portal_status_unrecognized", { domain: "sales" });
  return "Trạng thái đang cập nhật";
}

export function customerDocumentKindLabel(value: string) {
  return label({ QUOTATION: "Báo giá", DELIVERY: "Phiếu giao hàng", PAYMENT: "Phiếu thu/chi" }, value, "document_kind", "Tài liệu nghiệp vụ");
}

export function customerDocumentStateLabel(kind: string, state?: string | null) {
  if (!state) return "Đang xử lý";
  if (kind === "QUOTATION") return salesStateLabel(state);
  if (kind === "DELIVERY") return deliveryStateLabel(state);
  if (kind === "PAYMENT") return financeStateLabel(state);
  return "Trạng thái đang cập nhật";
}
