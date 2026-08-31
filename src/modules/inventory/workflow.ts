import { PlatformError } from "@/modules/platform/errors";

function finiteNonNegative(value: string | number, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new PlatformError(
      `${label} không hợp lệ.`,
      "INVALID_INVENTORY_QUANTITY",
      400,
    );
  }
  return number;
}

export function deriveInventoryAvailability(
  onHand: string | number,
  reserved: string | number,
) {
  const onHandValue = finiteNonNegative(onHand, "Tồn thực tế");
  const reservedValue = finiteNonNegative(reserved, "Tồn đã giữ");
  if (reservedValue > onHandValue) {
    throw new PlatformError(
      "Tồn đã giữ không thể vượt tồn thực tế.",
      "RESERVATION_EXCEEDS_ON_HAND",
      409,
    );
  }
  return onHandValue - reservedValue;
}

export function reserveAvailableStock(
  onHand: string | number,
  alreadyReserved: string | number,
  requested: string | number,
) {
  const request = finiteNonNegative(requested, "Số lượng giữ");
  if (
    request <= 0 ||
    request > deriveInventoryAvailability(onHand, alreadyReserved)
  ) {
    throw new PlatformError(
      "Không đủ tồn khả dụng để giữ hàng.",
      "INSUFFICIENT_AVAILABLE_INVENTORY",
      409,
    );
  }
  return Number(alreadyReserved) + request;
}

export function movingWeightedAverage(
  currentQuantity: string | number,
  currentAverage: string | number,
  receiptQuantity: string | number,
  receiptUnitCost: string | number,
) {
  const current = finiteNonNegative(currentQuantity, "Tồn hiện tại");
  const average = finiteNonNegative(currentAverage, "Giá vốn bình quân");
  const incoming = finiteNonNegative(receiptQuantity, "Số lượng nhập");
  const cost = finiteNonNegative(receiptUnitCost, "Đơn giá nhập");
  if (incoming <= 0)
    throw new PlatformError(
      "Số lượng nhập phải lớn hơn 0.",
      "INVALID_RECEIPT_QUANTITY",
      400,
    );
  return (current * average + incoming * cost) / (current + incoming);
}

export function stockCountVariance(
  systemQuantity: string | number,
  countedQuantity: string | number,
) {
  return (
    finiteNonNegative(countedQuantity, "Số đếm thực tế") -
    finiteNonNegative(systemQuantity, "Số liệu hệ thống")
  );
}

export function adjustmentMovementForVariance(variance: string | number) {
  const value = Number(variance);
  if (!Number.isFinite(value) || value === 0) return null;
  return value > 0 ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT";
}

export function isLowStock(
  available: string | number,
  minimum: string | number | null,
) {
  if (minimum === null) return false;
  return (
    finiteNonNegative(available, "Tồn khả dụng") <=
    finiteNonNegative(minimum, "Ngưỡng tối thiểu")
  );
}

export function assertWarehouseReceiptRoute(
  deliveryMode: "SUPPLIER_TO_WAREHOUSE" | "SUPPLIER_DIRECT",
) {
  if (deliveryMode === "SUPPLIER_DIRECT") {
    throw new PlatformError(
      "Đơn giao thẳng không được nhập kho.",
      "DROPSHIP_CANNOT_ENTER_WAREHOUSE",
      409,
    );
  }
}
