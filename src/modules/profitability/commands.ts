import { PlatformError } from "@/modules/platform/errors";
import {
  DIRECT_COST_CATEGORIES,
  PROFITABILITY_BASES,
  type DirectCostCategory,
  type ProfitabilityBasis,
  type ProfitabilityCommandKind,
} from "@/modules/profitability/types";

export type ProfitabilityCommandInput =
  | {
      kind: "profitability.cost.record";
      salesOrderId: string;
      basis: ProfitabilityBasis;
      category: DirectCostCategory;
      amount: string;
      materialId: string | null;
      supplierId: string | null;
      vehicleId: string | null;
      serviceReferenceId: string | null;
      expenseAllocationId: string | null;
      reason: string;
      occurredAt: string;
    }
  | { kind: "profitability.finalize"; salesOrderId: string; reason: string }
  | { kind: "profitability.reopen"; salesOrderId: string; reason: string };

function invalid(message: string): never {
  throw new PlatformError(message, "INVALID_PROFITABILITY_DATA", 400);
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
function id(formData: FormData, name: string, label: string) {
  const item = required(formData, name, label, 80);
  if (!/^[A-Za-z0-9_-]{3,80}$/.test(item)) invalid(`${label} không hợp lệ.`);
  return item;
}
function optionalId(formData: FormData, name: string, label: string) {
  const item = value(formData, name);
  if (!item) return null;
  if (!/^[A-Za-z0-9_-]{3,80}$/.test(item)) invalid(`${label} không hợp lệ.`);
  return item;
}
function reason(formData: FormData) {
  const item = required(formData, "reason", "Lý do", 500);
  if (item.length < 10)
    invalid("Lý do cần ít nhất 10 ký tự để lưu dấu vết kiểm toán.");
  return item;
}

export function parseProfitabilityForm(
  formData: FormData,
): ProfitabilityCommandInput {
  const kind = required(
    formData,
    "kind",
    "Loại thao tác",
    50,
  ) as ProfitabilityCommandKind;
  const salesOrderId = id(formData, "salesOrderId", "Đơn bán");
  if (kind === "profitability.finalize" || kind === "profitability.reopen") {
    return { kind, salesOrderId, reason: reason(formData) };
  }
  if (kind !== "profitability.cost.record")
    invalid("Loại thao tác lợi nhuận không hợp lệ.");
  const basis = required(
    formData,
    "basis",
    "Cơ sở chi phí",
    20,
  ) as ProfitabilityBasis;
  const category = required(
    formData,
    "category",
    "Nhóm chi phí",
    30,
  ) as DirectCostCategory;
  if (!PROFITABILITY_BASES.includes(basis))
    invalid("Cơ sở chi phí không hợp lệ.");
  if (!DIRECT_COST_CATEGORIES.includes(category))
    invalid("Nhóm chi phí không hợp lệ.");
  const amount = required(formData, "amount", "Số tiền", 24);
  if (!/^\d+(?:\.\d{1,2})?$/.test(amount) || Number(amount) <= 0)
    invalid("Số tiền phải lớn hơn 0.");
  const occurredAt = required(
    formData,
    "occurredAt",
    "Thời điểm phát sinh",
    32,
  );
  if (Number.isNaN(Date.parse(occurredAt)))
    invalid("Thời điểm phát sinh không hợp lệ.");
  return {
    kind,
    salesOrderId,
    basis,
    category,
    amount,
    materialId: optionalId(formData, "materialId", "Vật liệu"),
    supplierId: optionalId(formData, "supplierId", "Nhà cung cấp"),
    vehicleId: optionalId(formData, "vehicleId", "Phương tiện"),
    serviceReferenceId: optionalId(formData, "serviceReferenceId", "Dịch vụ"),
    expenseAllocationId: optionalId(
      formData,
      "expenseAllocationId",
      "Phân bổ chi phí",
    ),
    reason: reason(formData),
    occurredAt,
  };
}
