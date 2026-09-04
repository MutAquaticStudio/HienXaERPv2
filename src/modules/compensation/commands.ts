import type {
  CompensationCommandKind,
  CompensationPlanScope,
  CompensationRuleType,
} from "@/modules/compensation/types";
import { COMPENSATION_RULE_TYPES } from "@/modules/compensation/types";
import { PlatformError } from "@/modules/platform/errors";
import type { RoleTemplate } from "@/modules/platform/types";
import { ROLE_TEMPLATES } from "@/modules/platform/types";

export interface EarningAllocationInput {
  workerUserId: string;
  sharePercent: string | null;
  approvedUnits: string | null;
}

export type CompensationCommandInput =
  | {
      kind: "compensation.profile.create";
      employeeUserId: string;
      effectiveFrom: string;
      note: string;
    }
  | {
      kind: "compensation.plan.create";
      planCode: string;
      name: string;
      versionNumber: number;
      scopeType: CompensationPlanScope;
      roleCode: RoleTemplate | null;
      employeeUserId: string | null;
      effectiveFrom: string;
      effectiveTo: string | null;
      currency: string;
      note: string;
    }
  | {
      kind: "compensation.rule.create";
      planVersionId: string;
      ruleType: CompensationRuleType;
      rate: string;
      workType: string | null;
      sourceType: string | null;
      description: string;
    }
  | {
      kind: "earning.create_from_work";
      workItemId: string;
      ruleType: CompensationRuleType;
      allocations: EarningAllocationInput[];
      note: string;
    }
  | {
      kind: "earning.bonus";
      employeeUserId: string;
      earnedOn: string;
      note: string;
    }
  | { kind: "earning.approve"; earningEventId: string; note: string }
  | {
      kind: "earning.adjust";
      earningAllocationId: string;
      amount: string;
      reason: string;
    }
  | { kind: "earning.reverse"; earningEventId: string; reason: string }
  | {
      kind: "payroll.period.create";
      periodCode: string;
      periodStart: string;
      periodEnd: string;
      currency: string;
      note: string;
    }
  | { kind: "payroll.monthly.generate"; payrollPeriodId: string }
  | { kind: "payroll.close"; payrollPeriodId: string; note: string }
  | {
      kind: "payroll.payment.link";
      payrollLineId: string;
      paymentId: string;
      amount: string;
      note: string;
    };

function invalid(message: string): never {
  throw new PlatformError(message, "INVALID_COMPENSATION_DATA", 400);
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
  allowEmpty = false,
) {
  const item = value(formData, name);
  if (!item && allowEmpty) return null;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      item,
    )
  )
    invalid(`${label} không hợp lệ.`);
  return item;
}
function positive(
  formData: FormData,
  name: string,
  label: string,
  allowSigned = false,
) {
  const item = required(formData, name, label, 30);
  const pattern = allowSigned ? /^-?\d+(?:\.\d{1,4})?$/ : /^\d+(?:\.\d{1,4})?$/;
  if (
    !pattern.test(item) ||
    (allowSigned ? Number(item) === 0 : Number(item) <= 0)
  )
    invalid(`${label} phải ${allowSigned ? "khác" : "lớn hơn"} 0.`);
  return item;
}
function isoDate(
  formData: FormData,
  name: string,
  label: string,
  allowEmpty = false,
) {
  const item = allowEmpty
    ? optional(formData, name, 10)
    : required(formData, name, label, 10);
  if (item && !/^\d{4}-\d{2}-\d{2}$/.test(item))
    invalid(`${label} không hợp lệ.`);
  return item;
}
function meaningful(formData: FormData, name: string, label: string) {
  const item = required(formData, name, label, 500);
  if (item.length < 10) invalid(`${label} cần ít nhất 10 ký tự.`);
  return item;
}
function currency(formData: FormData) {
  const item = required(formData, "currency", "Tiền tệ", 3).toUpperCase();
  if (!/^[A-Z]{3}$/.test(item)) invalid("Tiền tệ không hợp lệ.");
  return item;
}
function ruleType(formData: FormData) {
  const item = required(
    formData,
    "ruleType",
    "Cách tính",
    40,
  ) as CompensationRuleType;
  if (!COMPENSATION_RULE_TYPES.includes(item))
    invalid("Cách tính không hợp lệ.");
  return item;
}

function earningAllocations(formData: FormData): EarningAllocationInput[] {
  const mode = required(formData, "allocationMode", "Cách chia", 12);
  if (!["PERCENT", "UNITS"].includes(mode)) invalid("Cách chia không hợp lệ.");
  const result: EarningAllocationInput[] = [];
  for (const suffix of ["1", "2", "3"]) {
    const workerUserId = uuid(
      formData,
      `workerUserId${suffix}`,
      `Người lao động ${suffix}`,
      true,
    );
    if (!workerUserId) continue;
    result.push({
      workerUserId,
      sharePercent:
        mode === "PERCENT"
          ? positive(formData, `sharePercent${suffix}`, `Tỷ lệ người ${suffix}`)
          : null,
      approvedUnits:
        mode === "UNITS"
          ? positive(
              formData,
              `approvedUnits${suffix}`,
              `Sản lượng người ${suffix}`,
            )
          : null,
    });
  }
  if (!result.length) invalid("Cần chọn ít nhất một người nhận quyền lợi.");
  if (new Set(result.map((item) => item.workerUserId)).size !== result.length)
    invalid("Mỗi người chỉ được xuất hiện một lần.");
  if (mode === "PERCENT") {
    const total = result.reduce(
      (sum, item) => sum + Number(item.sharePercent),
      0,
    );
    if (Math.abs(total - 100) > 0.0001)
      invalid("Tổng tỷ lệ chia phải bằng 100%.");
  }
  return result;
}

export function parseCompensationForm(
  formData: FormData,
): CompensationCommandInput {
  const kind = required(
    formData,
    "kind",
    "Loại thao tác",
    50,
  ) as CompensationCommandKind;
  switch (kind) {
    case "compensation.profile.create":
      return {
        kind,
        employeeUserId: uuid(formData, "employeeUserId", "Nhân viên")!,
        effectiveFrom: isoDate(formData, "effectiveFrom", "Ngày bắt đầu")!,
        note: meaningful(formData, "note", "Ghi chú"),
      };
    case "compensation.plan.create": {
      const scopeType = required(
        formData,
        "scopeType",
        "Phạm vi",
        20,
      ) as CompensationPlanScope;
      if (!["COMPANY", "ROLE", "EMPLOYEE"].includes(scopeType))
        invalid("Phạm vi không hợp lệ.");
      const role = optional(formData, "roleCode", 40) as RoleTemplate | null;
      if (role && !ROLE_TEMPLATES.includes(role))
        invalid("Vai trò không hợp lệ.");
      const employeeUserId = uuid(
        formData,
        "employeeUserId",
        "Nhân viên",
        true,
      );
      if ((scopeType === "ROLE") !== Boolean(role))
        invalid("Kế hoạch theo vai trò phải chọn đúng một vai trò.");
      if ((scopeType === "EMPLOYEE") !== Boolean(employeeUserId))
        invalid("Kế hoạch riêng phải chọn đúng một nhân viên.");
      const effectiveFrom = isoDate(
        formData,
        "effectiveFrom",
        "Ngày hiệu lực",
      )!;
      const effectiveTo = isoDate(
        formData,
        "effectiveTo",
        "Ngày kết thúc",
        true,
      );
      if (effectiveTo && effectiveTo < effectiveFrom)
        invalid("Ngày kết thúc phải từ ngày hiệu lực trở đi.");
      const version = Number(
        required(formData, "versionNumber", "Số phiên bản", 6),
      );
      if (!Number.isInteger(version) || version < 1)
        invalid("Số phiên bản phải là số nguyên từ 1.");
      return {
        kind,
        planCode: required(
          formData,
          "planCode",
          "Mã kế hoạch",
          32,
        ).toUpperCase(),
        name: required(formData, "name", "Tên kế hoạch", 160),
        versionNumber: version,
        scopeType,
        roleCode: scopeType === "ROLE" ? role : null,
        employeeUserId: scopeType === "EMPLOYEE" ? employeeUserId : null,
        effectiveFrom,
        effectiveTo,
        currency: currency(formData),
        note: meaningful(formData, "note", "Ghi chú phiên bản"),
      };
    }
    case "compensation.rule.create":
      return {
        kind,
        planVersionId: uuid(formData, "planVersionId", "Phiên bản kế hoạch")!,
        ruleType: ruleType(formData),
        rate: positive(formData, "rate", "Mức trả"),
        workType: optional(formData, "workType", 30),
        sourceType: optional(formData, "sourceType", 30),
        description: meaningful(formData, "description", "Mô tả quy tắc"),
      };
    case "earning.create_from_work":
      return {
        kind,
        workItemId: uuid(formData, "workItemId", "Công việc")!,
        ruleType: ruleType(formData),
        allocations: earningAllocations(formData),
        note: meaningful(formData, "note", "Ghi chú tính quyền lợi"),
      };
    case "earning.bonus":
      return {
        kind,
        employeeUserId: uuid(formData, "employeeUserId", "Nhân viên")!,
        earnedOn: isoDate(formData, "earnedOn", "Ngày ghi nhận")!,
        note: meaningful(formData, "note", "Lý do thưởng"),
      };
    case "earning.approve":
      return {
        kind,
        earningEventId: uuid(formData, "earningEventId", "Quyền lợi")!,
        note: meaningful(formData, "note", "Ghi chú duyệt"),
      };
    case "earning.adjust":
      return {
        kind,
        earningAllocationId: uuid(
          formData,
          "earningAllocationId",
          "Khoản quyền lợi",
        )!,
        amount: positive(formData, "amount", "Số tiền điều chỉnh", true),
        reason: meaningful(formData, "reason", "Lý do điều chỉnh"),
      };
    case "earning.reverse":
      return {
        kind,
        earningEventId: uuid(formData, "earningEventId", "Quyền lợi")!,
        reason: meaningful(formData, "reason", "Lý do đảo quyền lợi"),
      };
    case "payroll.period.create": {
      const periodStart = isoDate(formData, "periodStart", "Ngày đầu kỳ")!;
      const periodEnd = isoDate(formData, "periodEnd", "Ngày cuối kỳ")!;
      if (periodEnd < periodStart)
        invalid("Ngày cuối kỳ phải từ ngày đầu kỳ trở đi.");
      return {
        kind,
        periodCode: required(formData, "periodCode", "Mã kỳ", 32).toUpperCase(),
        periodStart,
        periodEnd,
        currency: currency(formData),
        note: meaningful(formData, "note", "Ghi chú kỳ"),
      };
    }
    case "payroll.monthly.generate":
      return {
        kind,
        payrollPeriodId: uuid(formData, "payrollPeriodId", "Kỳ thu nhập")!,
      };
    case "payroll.close":
      return {
        kind,
        payrollPeriodId: uuid(formData, "payrollPeriodId", "Kỳ thu nhập")!,
        note: meaningful(formData, "note", "Xác nhận chốt kỳ"),
      };
    case "payroll.payment.link":
      return {
        kind,
        payrollLineId: uuid(formData, "payrollLineId", "Dòng thu nhập")!,
        paymentId: uuid(formData, "paymentId", "Khoản chi")!,
        amount: positive(formData, "amount", "Số tiền liên kết"),
        note: meaningful(formData, "note", "Ghi chú liên kết"),
      };
    default:
      invalid("Loại thao tác thu nhập không hợp lệ.");
  }
}
