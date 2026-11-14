// FB12 (D34b): labels and helpers of "Bảng lương".
import { toCsv } from "@/lib/core/csv";
import { formatVnd, vnd } from "@/lib/core/money";
import { formatQuantity } from "@/lib/core/quantity";

export const PAY_BASES = ["MONTHLY_WORKDAYS", "PER_SHIFT", "PER_HOUR", "FIXED"] as const;
export const COMPONENT_KINDS = ["ALLOWANCE", "BONUS", "DEDUCTION"] as const;
export const COMPONENT_METHODS = ["FIXED_PER_PERIOD", "PER_WORKDAY", "PER_LATE", "PER_LATE_MINUTE", "PER_UNPAID_DAY", "SALES_TIERS", "PER_TRIP", "PER_JOB", "WORK_RATE"] as const;

const payBasisLabels: Record<string, string> = {
  MONTHLY_WORKDAYS: "Theo ngày công chuẩn",
  PER_SHIFT: "Theo ca",
  PER_HOUR: "Theo giờ",
  FIXED: "Cố định",
};
const payBasisUnits: Record<string, string> = {
  MONTHLY_WORKDAYS: "/ tháng",
  PER_SHIFT: "/ ca",
  PER_HOUR: "/ giờ",
  FIXED: "/ kỳ",
};
const kindLabels: Record<string, string> = { ALLOWANCE: "Phụ cấp", BONUS: "Thưởng", DEDUCTION: "Giảm trừ" };
const methodLabels: Record<string, string> = {
  FIXED_PER_PERIOD: "Cố định mỗi kỳ",
  PER_WORKDAY: "Theo ngày công",
  PER_LATE: "Mỗi lần đi muộn / về sớm",
  PER_LATE_MINUTE: "Mỗi phút đi muộn / về sớm",
  PER_UNPAID_DAY: "Mỗi ngày nghỉ không phép / vắng",
  SALES_TIERS: "% doanh thu theo bậc (hoa hồng)",
  PER_TRIP: "Mỗi chuyến giao đã xác minh",
  PER_JOB: "Mỗi việc dịch vụ đã xác minh",
  WORK_RATE: "Theo đơn giá công việc (hàng đã giao, dịch vụ)",
};
const stateLabels: Record<string, string> = { DRAFT: "Tạm tính", CLOSED: "Đã chốt", CANCELLED: "Đã hủy" };

export const payBasisLabel = (value: string) => payBasisLabels[value] ?? "Không rõ";
export const payBasisUnit = (value: string) => payBasisUnits[value] ?? "";
export const componentKindLabel = (value: string) => kindLabels[value] ?? "Không rõ";
export const componentMethodLabel = (value: string) => methodLabels[value] ?? "Không rõ";
export const payrollStateLabel = (value: string) => stateLabels[value] ?? "Không rõ";
export const payrollStateTone = (value: string) => (value === "CLOSED" ? "success" : value === "CANCELLED" ? "danger" : "warning") as "success" | "danger" | "warning";

export type SalesTier = { from_vnd: string; rate_bps: number };

/** "1,5" or "1.5" percent → 150 basis points; empty or invalid → null. */
export function percentToBps(raw: string) {
  const text = raw.trim().replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(text)) return null;
  const bps = Math.round(Number(text) * 100);
  return bps <= 10000 ? bps : null;
}

export function bpsToPercent(bps: number) {
  return (bps / 100).toLocaleString("vi-VN", { maximumFractionDigits: 2 });
}

/** "Từ 100.000.000 đ: 1%; …" for a component's tiers. */
export function describeTiers(tiers: SalesTier[] | null | undefined) {
  if (!tiers?.length) return "";
  return [...tiers].sort((a, b) => (BigInt(a.from_vnd) < BigInt(b.from_vnd) ? -1 : 1))
    .map((tier) => `từ ${BigInt(tier.from_vnd).toLocaleString("vi-VN")} đ: ${bpsToPercent(tier.rate_bps)}%`).join(" · ");
}

/** D76: one line of a "Theo đơn giá công việc" payslip line — goods delivered or a service done, with the rate it was paid by (or none yet). */
export type WorkRateItem = {
  kind: "GOODS" | "SERVICE"; label: string; uom: string; quantity: string; rate_vnd?: string | null; rate_bps?: number | null; amount_vnd?: string | null;
};

/** "Xi măng · 4 bao × 2.500 đ = 10.000 đ", "Chạc · 2 chuyến = 20% của số tiền tính khách = 450.000 đ", or "Thép · 40 kg" for work with no rate. */
export function describeWorkRateItem(item: WorkRateItem) {
  const quantity = `${item.label} · ${formatQuantity(item.quantity)} ${item.uom}`;
  if (item.amount_vnd == null) return quantity;
  const amount = formatVnd(vnd(item.amount_vnd));
  if (item.rate_bps) return `${quantity} × ${bpsToPercent(item.rate_bps)}% số tiền tính khách = ${amount}`;
  return `${quantity} × ${formatVnd(vnd(item.rate_vnd ?? "0"))} = ${amount}`;
}

/** "(3 mặt hàng)" next to a "Theo đơn giá công việc" line of a payslip. */
export const workRateCount = (items: readonly unknown[] | null | undefined) => items?.length ? ` (${items.length} loại hàng / dịch vụ)` : "";

/** CSV of a payroll for spreadsheets. */
export const payrollCsv = toCsv;

/** Vietnamese message of a payroll command error; never a technical code. */
export function payrollError(message: string | null | undefined) {
  const text = message ?? "";
  const known: Array<[string, string]> = [
    ["payroll_attendance_not_closed", "Chưa chốt chấm công đủ các ngày của kỳ lương. Chốt chấm công trước rồi chốt lương."],
    ["payroll_period_overlaps", "Khoảng ngày này trùng một bảng lương khác (chưa hủy)."],
    ["payroll_not_draft", "Bảng lương đã chốt hoặc đã hủy, không sửa được nữa."],
    ["payroll_version_conflict", "Bảng lương vừa được người khác cập nhật. Tải lại trang rồi thử lại."],
    ["invalid_salary_profile", "Thiết lập lương chưa hợp lệ: kiểm tra mức lương (0 nếu chỉ trả theo chuyến / việc) và hệ số làm thêm (100–1000%)."],
    ["invalid_payroll_component", "Khoản thu nhập khác chưa hợp lệ: nhập số tiền, hoặc các bậc doanh thu và % (tối đa 100%). Đơn giá theo xe chỉ dùng cho tiền chuyến. “Theo đơn giá công việc” áp dụng cho mọi nhân viên, là phụ cấp hoặc thưởng, không nhập số tiền."],
    ["payroll_components_trip_vehicle_unique", "Xe này đã có đơn giá chuyến. Sửa đơn giá đó thay vì thêm mới."],
    ["payroll_components_work_rate_unique", "Đã có một khoản “Theo đơn giá công việc” đang áp dụng. Sửa khoản đó thay vì thêm khoản thứ hai (sẽ trả trùng)."],
    ["invalid_work_rate", "Đơn giá chưa hợp lệ: số tiền phải lớn hơn 0; đơn vị phải là đơn vị vật tư được bán; dịch vụ nhập số tiền mỗi đơn vị hoặc % số tiền tính khách (1–100), không nhập cả hai."],
    ["payroll_component_not_found", "Không tìm thấy khoản thu nhập khác."],
    ["invalid_holiday", "Nhập ngày và tên ngày lễ."],
    ["invalid_payroll", "Thông tin bảng lương chưa hợp lệ (kỳ tối đa 62 ngày)."],
    ["employee_not_in_branch", "Nhân viên không làm việc ở chi nhánh này."],
    ["operation_payload_conflict", "Thao tác bị trùng. Tải lại trang rồi thử lại."],
    ["duplicate key", "Mã đã có. Chọn mã khác."],
    ["forbidden", "Bạn không có quyền thực hiện thao tác này."],
  ];
  return known.find(([code]) => text.includes(code))?.[1] ?? "Chưa lưu được. Kiểm tra kết nối rồi thử lại.";
}
