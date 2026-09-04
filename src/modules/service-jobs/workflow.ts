import type {
  ServiceJobStatus,
  ServiceLogType,
  ServiceRateType,
} from "@/modules/service-jobs/types";

export const SERVICE_STATUS_LABELS: Record<ServiceJobStatus, string> = {
  SCHEDULED: "Đã lên lịch",
  ASSIGNED: "Đã phân công",
  IN_PROGRESS: "Đang thực hiện",
  PAUSED: "Đang nghỉ",
  COMPLETED: "Chờ duyệt tính tiền",
  APPROVED: "Chờ khách xác nhận",
  CUSTOMER_CONFIRMED: "Khách đã xác nhận",
  BILLED: "Đã ghi nhận phải thu",
  CANCELLED: "Đã hủy",
};

export const SERVICE_RATE_LABELS: Record<ServiceRateType, string> = {
  HOUR: "Theo giờ",
  SHIFT: "Theo ca",
  TRIP: "Theo chuyến",
  DAY: "Theo ngày",
  FIXED_JOB: "Trọn công việc",
};

export const SERVICE_LOG_LABELS: Record<ServiceLogType, string> = {
  START: "Bắt đầu",
  BREAK_START: "Bắt đầu nghỉ",
  BREAK_END: "Tiếp tục làm",
  FUEL: "Ghi nhiên liệu",
  EVIDENCE: "Gắn bằng chứng",
  INCIDENT: "Báo sự cố",
  END: "Kết thúc",
};

export function calculateActualMinutes(
  startedAt: string,
  endedAt: string,
  breakMinutes: number,
) {
  const elapsed = Math.floor(
    (Date.parse(endedAt) - Date.parse(startedAt)) / 60_000,
  );
  if (!Number.isFinite(elapsed) || elapsed <= breakMinutes) {
    throw new Error("POSITIVE_SERVICE_DURATION_REQUIRED");
  }
  return elapsed - breakMinutes;
}

export function calculateBillingAmount(quantity: string, unitRate: string) {
  const amount = Number(quantity) * Number(unitRate);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("POSITIVE_SERVICE_BILLING_AMOUNT_REQUIRED");
  }
  return amount.toFixed(2);
}

export function validateBillingQuantity(
  rateType: ServiceRateType,
  billableHours: string,
  billableQuantity: string,
) {
  const hours = Number(billableHours);
  const quantity = Number(billableQuantity);
  if (hours <= 0 || quantity <= 0) return false;
  if (rateType === "HOUR") return Math.abs(hours - quantity) <= 0.0001;
  if (rateType === "FIXED_JOB") return Math.abs(quantity - 1) <= 0.0001;
  return true;
}

export function allowedWorkerLogs(status: ServiceJobStatus): ServiceLogType[] {
  if (status === "ASSIGNED") return ["START"];
  if (status === "IN_PROGRESS") {
    return ["BREAK_START", "FUEL", "EVIDENCE", "INCIDENT", "END"];
  }
  if (status === "PAUSED") return ["BREAK_END", "FUEL", "EVIDENCE", "INCIDENT"];
  return [];
}
