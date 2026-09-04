import { PlatformError } from "@/modules/platform/errors";
import type { RoutePlanCommandInput } from "@/modules/route-optimization/types";

function invalid(message: string): never {
  throw new PlatformError(message, "INVALID_ROUTE_PLAN_DATA", 400);
}

function value(formData: FormData, name: string) {
  const item = formData.get(name);
  return typeof item === "string" ? item.trim() : "";
}

function required(formData: FormData, name: string, label: string, maximum = 500) {
  const item = value(formData, name);
  if (!item) invalid(`${label} là bắt buộc.`);
  if (item.length > maximum) invalid(`${label} quá dài.`);
  return item;
}

function idValue(valueToCheck: string, label: string) {
  if (!/^[A-Za-z0-9_-]{3,80}$/.test(valueToCheck)) invalid(`${label} không hợp lệ.`);
  return valueToCheck;
}

function id(formData: FormData, name: string, label: string) {
  return idValue(required(formData, name, label, 80), label);
}

function date(formData: FormData) {
  const item = required(formData, "scheduledDate", "Ngày chạy lộ trình", 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(item)) invalid("Ngày chạy lộ trình không hợp lệ.");
  const parsed = new Date(`${item}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== item) {
    invalid("Ngày chạy lộ trình không hợp lệ.");
  }
  return item;
}

function reason(formData: FormData) {
  const item = required(formData, "reason", "Lý do", 500);
  if (item.length < 10) invalid("Lý do cần ít nhất 10 ký tự.");
  return item;
}

export function parseRoutePlanForm(formData: FormData): RoutePlanCommandInput {
  const kind = required(formData, "kind", "Loại thao tác", 40);
  if (kind === "route.plan.create") {
    const deliveryIds = formData
      .getAll("deliveryId")
      .filter((item): item is string => typeof item === "string")
      .map((item) => idValue(item.trim(), "Chuyến giao"));
    if (!deliveryIds.length) invalid("Cần chọn ít nhất một chuyến giao.");
    if (deliveryIds.length > 50) invalid("Một đề xuất chỉ hỗ trợ tối đa 50 chuyến giao.");
    if (new Set(deliveryIds).size !== deliveryIds.length) invalid("Một chuyến chỉ được chọn một lần.");
    return {
      kind,
      scheduledDate: date(formData),
      vehicleId: id(formData, "vehicleId", "Xe"),
      driverUserId: id(formData, "driverUserId", "Tài xế"),
      deliveryIds,
    };
  }
  if (kind === "route.plan.approve") {
    return { kind, routePlanId: id(formData, "routePlanId", "Đề xuất lộ trình"), reason: reason(formData) };
  }
  if (kind === "route.plan.apply") {
    if (value(formData, "confirmApply") !== "apply-p7") {
      invalid("Cần xác nhận thao tác sẽ phân công chuyến bằng quy trình P7.");
    }
    return {
      kind,
      routePlanId: id(formData, "routePlanId", "Đề xuất lộ trình"),
      reason: reason(formData),
      confirmApply: true,
    };
  }
  return invalid("Thao tác lộ trình không được hỗ trợ.");
}
