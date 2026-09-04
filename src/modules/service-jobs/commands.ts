import { PlatformError } from "@/modules/platform/errors";
import {
  SERVICE_COST_CATEGORIES,
  SERVICE_LOG_TYPES,
  SERVICE_RATE_TYPES,
  type ServiceCostCategory,
  type ServiceJobCommandKind,
  type ServiceLogType,
  type ServiceRateType,
} from "@/modules/service-jobs/types";
import { validateBillingQuantity } from "@/modules/service-jobs/workflow";

export type ServiceJobCommandInput =
  | {
      kind: "service.type.create";
      code: string;
      name: string;
      rateType: ServiceRateType;
      unitRate: string;
      standardShiftHours: string;
    }
  | {
      kind: "service.machine.create";
      code: string;
      name: string;
      machineType: string;
      serialNumber: string | null;
      warehouseId: string | null;
      meterHours: string;
    }
  | {
      kind: "service.job.create";
      customerId: string;
      customerSiteId: string;
      serviceTypeId: string;
      machineId: string;
      scheduledStartAt: string;
      scheduledEndAt: string;
      rateType: ServiceRateType;
      unitRate: string;
      currency: string;
      notes: string | null;
    }
  | { kind: "service.job.assign"; serviceJobId: string; operatorUserId: string }
  | {
      kind: "service.job.log";
      serviceJobId: string;
      logType: ServiceLogType;
      occurredAt: string;
      note: string | null;
      fuelLiters: string | null;
      fuelUnitCost: string | null;
      evidenceId: string | null;
    }
  | {
      kind: "service.job.approve";
      serviceJobId: string;
      approvedBillableHours: string;
      approvedBillableQuantity: string;
      rateType: ServiceRateType;
      note: string;
    }
  | {
      kind: "service.job.cost";
      serviceJobId: string;
      category: ServiceCostCategory;
      amount: string;
      note: string;
      occurredAt: string;
    }
  | {
      kind: "service.job.confirm";
      serviceJobId: string;
      customerRepresentative: string;
      confirmationNote: string;
      signatureEvidenceId: string | null;
    }
  | { kind: "service.job.cancel"; serviceJobId: string; reason: string };

function invalid(message: string): never {
  throw new PlatformError(message, "INVALID_SERVICE_JOB_DATA", 400);
}
function value(formData: FormData, name: string) {
  const item = formData.get(name);
  return typeof item === "string" ? item.trim() : "";
}
function required(
  formData: FormData,
  name: string,
  label: string,
  maximum = 500,
) {
  const item = value(formData, name);
  if (!item) invalid(`${label} là bắt buộc.`);
  if (item.length > maximum) invalid(`${label} quá dài.`);
  return item;
}
function optional(formData: FormData, name: string, maximum = 500) {
  const item = value(formData, name);
  if (item.length > maximum) invalid(`${name} quá dài.`);
  return item || null;
}
function uuid(
  formData: FormData,
  name: string,
  label: string,
  optionalValue = false,
) {
  const item = value(formData, name);
  if (!item && optionalValue) return null;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      item,
    )
  ) {
    invalid(`${label} không hợp lệ.`);
  }
  return item;
}
function positive(formData: FormData, name: string, label: string, scale = 4) {
  const item = required(formData, name, label, 24);
  const pattern = new RegExp(`^\\d+(?:\\.\\d{1,${scale}})?$`);
  if (!pattern.test(item) || Number(item) <= 0)
    invalid(`${label} phải lớn hơn 0.`);
  return item;
}
function nonNegative(formData: FormData, name: string, label: string) {
  const item = value(formData, name) || "0";
  if (!/^\d+(?:\.\d{1,2})?$/.test(item) || Number(item) < 0)
    invalid(`${label} không hợp lệ.`);
  return item;
}
function rateType(formData: FormData) {
  const item = required(
    formData,
    "rateType",
    "Cách tính giá",
    20,
  ) as ServiceRateType;
  if (!SERVICE_RATE_TYPES.includes(item))
    invalid("Cách tính giá không hợp lệ.");
  return item;
}
function timestamp(formData: FormData, name: string, label: string) {
  const item = required(formData, name, label, 40);
  if (Number.isNaN(Date.parse(item))) invalid(`${label} không hợp lệ.`);
  return new Date(item).toISOString();
}
function timestampOrNow(formData: FormData, name: string, label: string) {
  return value(formData, name)
    ? timestamp(formData, name, label)
    : new Date().toISOString();
}
function reason(formData: FormData, name = "reason", label = "Lý do") {
  const item = required(formData, name, label, 500);
  if (item.length < 10) invalid(`${label} cần ít nhất 10 ký tự.`);
  return item;
}

export function parseServiceJobForm(
  formData: FormData,
): ServiceJobCommandInput {
  const kind = required(
    formData,
    "kind",
    "Loại thao tác",
    40,
  ) as ServiceJobCommandKind;
  switch (kind) {
    case "service.type.create":
      return {
        kind,
        code: required(formData, "code", "Mã dịch vụ", 32).toUpperCase(),
        name: required(formData, "name", "Tên dịch vụ", 160),
        rateType: rateType(formData),
        unitRate: positive(formData, "unitRate", "Đơn giá", 2),
        standardShiftHours: positive(
          formData,
          "standardShiftHours",
          "Số giờ một ca",
          2,
        ),
      };
    case "service.machine.create":
      return {
        kind,
        code: required(formData, "code", "Mã máy", 32).toUpperCase(),
        name: required(formData, "name", "Tên máy", 160),
        machineType: required(formData, "machineType", "Loại máy", 100),
        serialNumber: optional(formData, "serialNumber", 120),
        warehouseId: uuid(formData, "warehouseId", "Kho quản lý", true),
        meterHours: nonNegative(formData, "meterHours", "Số giờ đồng hồ"),
      };
    case "service.job.create": {
      const scheduledStartAt = timestamp(
        formData,
        "scheduledStartAt",
        "Giờ bắt đầu dự kiến",
      );
      const scheduledEndAt = timestamp(
        formData,
        "scheduledEndAt",
        "Giờ kết thúc dự kiến",
      );
      if (Date.parse(scheduledEndAt) <= Date.parse(scheduledStartAt))
        invalid("Giờ kết thúc phải sau giờ bắt đầu.");
      const currency = required(
        formData,
        "currency",
        "Tiền tệ",
        3,
      ).toUpperCase();
      if (!/^[A-Z]{3}$/.test(currency)) invalid("Tiền tệ không hợp lệ.");
      return {
        kind,
        customerId: uuid(formData, "customerId", "Khách hàng")!,
        customerSiteId: uuid(formData, "customerSiteId", "Địa điểm")!,
        serviceTypeId: uuid(formData, "serviceTypeId", "Loại dịch vụ")!,
        machineId: uuid(formData, "machineId", "Máy")!,
        scheduledStartAt,
        scheduledEndAt,
        rateType: rateType(formData),
        unitRate: positive(formData, "unitRate", "Đơn giá", 2),
        currency,
        notes: optional(formData, "notes", 1000),
      };
    }
    case "service.job.assign":
      return {
        kind,
        serviceJobId: uuid(formData, "serviceJobId", "Công việc")!,
        operatorUserId: uuid(formData, "operatorUserId", "Người vận hành")!,
      };
    case "service.job.log": {
      const logType = required(
        formData,
        "logType",
        "Loại nhật ký",
        20,
      ) as ServiceLogType;
      if (!SERVICE_LOG_TYPES.includes(logType))
        invalid("Loại nhật ký không hợp lệ.");
      const note = optional(formData, "note", 1000);
      if (logType === "INCIDENT" && (!note || note.length < 10))
        invalid("Mô tả sự cố cần ít nhất 10 ký tự.");
      const fuelLiters =
        logType === "FUEL"
          ? positive(formData, "fuelLiters", "Số lít", 3)
          : null;
      const fuelUnitCost =
        logType === "FUEL"
          ? positive(formData, "fuelUnitCost", "Đơn giá nhiên liệu", 2)
          : null;
      const evidenceId =
        logType === "EVIDENCE"
          ? uuid(formData, "evidenceId", "Bằng chứng")
          : null;
      return {
        kind,
        serviceJobId: uuid(formData, "serviceJobId", "Công việc")!,
        logType,
        occurredAt: timestampOrNow(formData, "occurredAt", "Thời điểm"),
        note,
        fuelLiters,
        fuelUnitCost,
        evidenceId,
      };
    }
    case "service.job.approve": {
      const selectedRateType = rateType(formData);
      const approvedBillableHours = positive(
        formData,
        "approvedBillableHours",
        "Giờ được duyệt",
      );
      const approvedBillableQuantity = positive(
        formData,
        "approvedBillableQuantity",
        "Sản lượng tính tiền",
      );
      if (
        !validateBillingQuantity(
          selectedRateType,
          approvedBillableHours,
          approvedBillableQuantity,
        )
      ) {
        invalid(
          selectedRateType === "HOUR"
            ? "Dịch vụ theo giờ phải có sản lượng tính tiền bằng số giờ được duyệt."
            : "Dịch vụ trọn công việc phải có sản lượng bằng 1.",
        );
      }
      return {
        kind,
        serviceJobId: uuid(formData, "serviceJobId", "Công việc")!,
        approvedBillableHours,
        approvedBillableQuantity,
        rateType: selectedRateType,
        note: reason(formData, "note", "Ghi chú duyệt"),
      };
    }
    case "service.job.cost": {
      const category = required(
        formData,
        "category",
        "Loại chi phí",
        30,
      ) as ServiceCostCategory;
      if (!SERVICE_COST_CATEGORIES.includes(category))
        invalid("Loại chi phí không hợp lệ.");
      return {
        kind,
        serviceJobId: uuid(formData, "serviceJobId", "Công việc")!,
        category,
        amount: positive(formData, "amount", "Chi phí", 2),
        note: required(formData, "note", "Diễn giải", 500),
        occurredAt: timestamp(formData, "occurredAt", "Thời điểm"),
      };
    }
    case "service.job.confirm":
      return {
        kind,
        serviceJobId: uuid(formData, "serviceJobId", "Công việc")!,
        customerRepresentative: required(
          formData,
          "customerRepresentative",
          "Người đại diện khách hàng",
          160,
        ),
        confirmationNote: reason(
          formData,
          "confirmationNote",
          "Nội dung xác nhận",
        ),
        signatureEvidenceId: uuid(
          formData,
          "signatureEvidenceId",
          "Chữ ký / biên bản",
          true,
        ),
      };
    case "service.job.cancel":
      return {
        kind,
        serviceJobId: uuid(formData, "serviceJobId", "Công việc")!,
        reason: reason(formData),
      };
    default:
      invalid("Thao tác dịch vụ không được hỗ trợ.");
  }
}
