import { PlatformError } from "@/modules/platform/errors";
import type { DeliveryStatus } from "@/modules/delivery/types";

const transitions: Record<DeliveryStatus, readonly DeliveryStatus[]> = {
  PLANNED: ["ASSIGNED", "CANCELLED"],
  ASSIGNED: ["DISPATCHED", "CANCELLED"],
  DISPATCHED: ["ARRIVED", "FAILED"],
  ARRIVED: ["DELIVERED", "FAILED"],
  DELIVERED: ["CONFIRMED", "PARTIAL"],
  CONFIRMED: [],
  PARTIAL: [],
  FAILED: [],
  CANCELLED: [],
};

export function assertDeliveryTransition(from: DeliveryStatus, to: DeliveryStatus) {
  if (!transitions[from].includes(to)) {
    throw new PlatformError(
      `Không thể chuyển chuyến từ ${from} sang ${to}.`,
      "INVALID_DELIVERY_TRANSITION",
      409,
    );
  }
}

export function resolveDeliveryOutcome(
  lines: ReadonlyArray<{
    plannedQuantity: string | number;
    actualQuantity: string | number;
    acceptedQuantity: string | number;
  }>,
): "CONFIRMED" | "PARTIAL" {
  if (!lines.length) {
    throw new PlatformError("Chuyến giao chưa có dòng hàng.", "DELIVERY_LINES_REQUIRED", 400);
  }
  let partial = false;
  for (const line of lines) {
    const planned = Number(line.plannedQuantity);
    const actual = Number(line.actualQuantity);
    const accepted = Number(line.acceptedQuantity);
    if (
      !Number.isFinite(planned) ||
      !Number.isFinite(actual) ||
      !Number.isFinite(accepted) ||
      planned <= 0 ||
      actual < 0 ||
      accepted < 0 ||
      actual > planned ||
      accepted > actual
    ) {
      throw new PlatformError(
        "Số thực giao/thực nhận không hợp lệ.",
        "INVALID_DELIVERY_ACTUAL_QUANTITY",
        400,
      );
    }
    partial ||= accepted < planned;
  }
  return partial ? "PARTIAL" : "CONFIRMED";
}
