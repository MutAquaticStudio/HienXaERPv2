import { PlatformError } from "@/modules/platform/errors";
import type {
  DeliveryCommandKind,
  DeliveryProofType,
  DeliveryStatus,
} from "@/modules/delivery/types";

export type DeliveryCommandInput =
  | {
      kind: "delivery.plan";
      supplyAllocationId: string;
      pickupAddress: string;
      dropAddress: string;
      scheduledDate: string;
    }
  | {
      kind: "delivery.assign";
      deliveryId: string;
      vehicleId: string;
      driverUserId: string;
    }
  | {
      kind: "delivery.progress";
      deliveryId: string;
      nextStatus: "DISPATCHED" | "ARRIVED" | "DELIVERED" | "FAILED" | "CANCELLED";
      reason: string;
    }
  | {
      kind: "delivery.proof";
      deliveryId: string;
      proofType: DeliveryProofType;
      evidenceId: string | null;
      latitude: string | null;
      longitude: string | null;
      receiverName: string | null;
    }
  | {
      kind: "delivery.confirm";
      deliveryId: string;
      deliveryLineId: string;
      actualQuantity: string;
      acceptedQuantity: string;
      receiverName: string;
      reason: string;
    };

function invalid(message: string): never {
  throw new PlatformError(message, "INVALID_DELIVERY_DATA", 400);
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
function id(formData: FormData, name: string, label: string) {
  const item = required(formData, name, label, 80);
  if (!/^[A-Za-z0-9_-]{3,80}$/.test(item)) invalid(`${label} không hợp lệ.`);
  return item;
}
function quantity(formData: FormData, name: string, label: string) {
  const item = required(formData, name, label, 30);
  if (!/^\d+(?:\.\d{1,6})?$/.test(item)) invalid(`${label} không hợp lệ.`);
  return item;
}
function reason(formData: FormData) {
  const item = required(formData, "reason", "Lý do", 500);
  if (item.length < 10) invalid("Lý do cần ít nhất 10 ký tự.");
  return item;
}

export function parseDeliveryForm(formData: FormData): DeliveryCommandInput {
  const kind = required(formData, "kind", "Loại thao tác", 40) as DeliveryCommandKind;
  switch (kind) {
    case "delivery.plan": {
      const scheduledDate = required(formData, "scheduledDate", "Ngày giao", 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate) || Number.isNaN(Date.parse(scheduledDate)))
        invalid("Ngày giao không hợp lệ.");
      return {
        kind,
        supplyAllocationId: id(formData, "supplyAllocationId", "Phần chia nguồn"),
        pickupAddress: required(formData, "pickupAddress", "Điểm lấy", 500),
        dropAddress: required(formData, "dropAddress", "Điểm giao", 500),
        scheduledDate,
      };
    }
    case "delivery.assign":
      return {
        kind,
        deliveryId: id(formData, "deliveryId", "Chuyến giao"),
        vehicleId: id(formData, "vehicleId", "Xe"),
        driverUserId: id(formData, "driverUserId", "Tài xế"),
      };
    case "delivery.progress": {
      const nextStatus = required(formData, "nextStatus", "Bước tiếp theo", 20) as DeliveryStatus;
      if (!["DISPATCHED", "ARRIVED", "DELIVERED", "FAILED", "CANCELLED"].includes(nextStatus))
        invalid("Bước giao hàng không được hỗ trợ.");
      return {
        kind,
        deliveryId: id(formData, "deliveryId", "Chuyến giao"),
        nextStatus: nextStatus as Extract<DeliveryStatus, "DISPATCHED" | "ARRIVED" | "DELIVERED" | "FAILED" | "CANCELLED">,
        reason: reason(formData),
      };
    }
    case "delivery.proof": {
      const proofType = required(formData, "proofType", "Loại bằng chứng", 20) as DeliveryProofType;
      if (!["PHOTO", "DOCUMENT", "LOCATION", "SIGNATURE"].includes(proofType))
        invalid("Loại bằng chứng không được hỗ trợ.");
      const evidenceId = value(formData, "evidenceId") || null;
      const latitude = value(formData, "latitude") || null;
      const longitude = value(formData, "longitude") || null;
      if (proofType === "LOCATION" && (!latitude || !longitude)) invalid("Vị trí là bắt buộc.");
      if (proofType !== "LOCATION" && !evidenceId) invalid("Tệp bằng chứng là bắt buộc.");
      return {
        kind,
        deliveryId: id(formData, "deliveryId", "Chuyến giao"),
        proofType,
        evidenceId,
        latitude,
        longitude,
        receiverName: value(formData, "receiverName") || null,
      };
    }
    case "delivery.confirm": {
      const actualQuantity = quantity(formData, "actualQuantity", "Số thực giao");
      const acceptedQuantity = quantity(formData, "acceptedQuantity", "Số thực nhận");
      if (Number(acceptedQuantity) > Number(actualQuantity))
        invalid("Số thực nhận không thể vượt số thực giao.");
      return {
        kind,
        deliveryId: id(formData, "deliveryId", "Chuyến giao"),
        deliveryLineId: id(formData, "deliveryLineId", "Dòng giao"),
        actualQuantity,
        acceptedQuantity,
        receiverName: required(formData, "receiverName", "Người nhận", 120),
        reason: reason(formData),
      };
    }
    default:
      return invalid("Thao tác giao hàng không được hỗ trợ.");
  }
}
