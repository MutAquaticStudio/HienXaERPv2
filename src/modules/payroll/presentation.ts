// FB12 (D34b): labels and helpers of "Bảng lương".
import { toCsv } from "@/lib/core/csv";

export const PAY_BASES = ["MONTHLY_WORKDAYS", "PER_SHIFT", "PER_HOUR", "FIXED"] as const;
export const COMPONENT_KINDS = ["ALLOWANCE", "BONUS", "DEDUCTION"] as const;
export const COMPONENT_METHODS = ["FIXED_PER_PERIOD", "PER_WORKDAY", "PER_LATE", "PER_LATE_MINUTE", "PER_UNPAID_DAY", "SALES_TIERS"] as const;

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
  SALES_TIERS: "% doanh thu theo bậc",
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
    ["invalid_salary_profile", "Thiết lập lương chưa hợp lệ: kiểm tra mức lương và hệ số làm thêm (100–1000%)."],
    ["invalid_payroll_component", "Khoản thu nhập khác chưa hợp lệ: nhập số tiền, hoặc các bậc doanh thu và % (tối đa 100%)."],
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
