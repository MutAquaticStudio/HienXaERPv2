import { PlatformError } from "@/modules/platform/errors";
import type { InventoryCommandKind } from "@/modules/inventory/types";

export type InventoryCommandInput =
  | { kind: "inventory.reserve"; supplyAllocationId: string }
  | { kind: "reservation.release"; reservationId: string; reason: string }
  | {
      kind: "receipt.confirm";
      warehouseId: string;
      materialId: string;
      documentQuantity: string;
      documentUomId: string;
      documentUnitCost: string;
      reason: string;
    }
  | {
      kind: "issue.confirm";
      warehouseId: string;
      materialId: string;
      baseQuantity: string;
      reservationId: string | null;
      reason: string;
    }
  | {
      kind: "stock-count.record";
      warehouseId: string;
      materialId: string;
      countedQuantity: string;
      reason: string;
    }
  | {
      kind: "stock-adjustment.approve";
      stockCountId: string;
      evidenceId: string;
      reason: string;
    }
  | {
      kind: "reorder-policy.set";
      warehouseId: string;
      materialId: string;
      minimumQuantity: string;
      targetQuantity: string;
      reason: string;
    };

function invalid(message: string): never {
  throw new PlatformError(message, "INVALID_INVENTORY_DATA", 400);
}
function text(formData: FormData, name: string, label: string, maximum = 500) {
  const value = formData.get(name);
  if (typeof value !== "string" || !value.trim())
    invalid(`${label} là bắt buộc.`);
  const normalized = (value as string).trim();
  if (normalized.length > maximum) invalid(`${label} quá dài.`);
  return normalized;
}
function optional(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function id(
  formData: FormData,
  name: string,
  label: string,
  optionalValue = false,
) {
  const value = optional(formData, name);
  if (!value) return optionalValue ? null : invalid(`${label} là bắt buộc.`);
  if (!/^[A-Za-z0-9_-]{3,80}$/.test(value)) invalid(`${label} không hợp lệ.`);
  return value;
}
function quantity(
  formData: FormData,
  name: string,
  label: string,
  allowZero = false,
) {
  const value = text(formData, name, label, 30);
  if (
    !/^\d+(?:\.\d{1,6})?$/.test(value) ||
    (allowZero ? Number(value) < 0 : Number(value) <= 0)
  ) {
    invalid(`${label} không hợp lệ.`);
  }
  return value;
}
function reason(formData: FormData) {
  const value = text(formData, "reason", "Lý do", 500);
  if (value.length < 10) invalid("Lý do cần ít nhất 10 ký tự.");
  return value;
}

export function parseInventoryForm(formData: FormData): InventoryCommandInput {
  const kind = text(
    formData,
    "kind",
    "Loại thao tác",
    40,
  ) as InventoryCommandKind;
  switch (kind) {
    case "inventory.reserve":
      return {
        kind,
        supplyAllocationId: id(
          formData,
          "supplyAllocationId",
          "Phần chia nguồn",
        )!,
      };
    case "reservation.release":
      return {
        kind,
        reservationId: id(formData, "reservationId", "Phiếu giữ hàng")!,
        reason: reason(formData),
      };
    case "receipt.confirm":
      return {
        kind,
        warehouseId: id(formData, "warehouseId", "Kho")!,
        materialId: id(formData, "materialId", "Vật liệu")!,
        documentQuantity: quantity(
          formData,
          "documentQuantity",
          "Số lượng nhập",
        ),
        documentUomId: id(formData, "documentUomId", "Đơn vị nhập")!,
        documentUnitCost: quantity(
          formData,
          "documentUnitCost",
          "Đơn giá nhập",
        ),
        reason: reason(formData),
      };
    case "issue.confirm":
      return {
        kind,
        warehouseId: id(formData, "warehouseId", "Kho")!,
        materialId: id(formData, "materialId", "Vật liệu")!,
        baseQuantity: quantity(formData, "baseQuantity", "Số lượng xuất"),
        reservationId: id(formData, "reservationId", "Phiếu giữ hàng", true),
        reason: reason(formData),
      };
    case "stock-count.record":
      return {
        kind,
        warehouseId: id(formData, "warehouseId", "Kho")!,
        materialId: id(formData, "materialId", "Vật liệu")!,
        countedQuantity: quantity(
          formData,
          "countedQuantity",
          "Số đếm thực tế",
          true,
        ),
        reason: reason(formData),
      };
    case "stock-adjustment.approve":
      return {
        kind,
        stockCountId: id(formData, "stockCountId", "Phiếu kiểm kê")!,
        evidenceId: id(formData, "evidenceId", "Bằng chứng")!,
        reason: reason(formData),
      };
    case "reorder-policy.set": {
      const minimumQuantity = quantity(
        formData,
        "minimumQuantity",
        "Mức tối thiểu",
        true,
      );
      const targetQuantity = quantity(
        formData,
        "targetQuantity",
        "Mức mục tiêu",
      );
      if (Number(targetQuantity) <= Number(minimumQuantity))
        invalid("Mức mục tiêu phải lớn hơn mức tối thiểu.");
      return {
        kind,
        warehouseId: id(formData, "warehouseId", "Kho")!,
        materialId: id(formData, "materialId", "Vật liệu")!,
        minimumQuantity,
        targetQuantity,
        reason: reason(formData),
      };
    }
    default:
      return invalid("Thao tác kho không được hỗ trợ.");
  }
}
