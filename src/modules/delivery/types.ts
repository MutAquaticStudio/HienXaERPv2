export const DELIVERY_STATUSES = [
  "PLANNED",
  "ASSIGNED",
  "DISPATCHED",
  "ARRIVED",
  "DELIVERED",
  "CONFIRMED",
  "PARTIAL",
  "FAILED",
  "CANCELLED",
] as const;

export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];
export type DeliveryProofType = "PHOTO" | "DOCUMENT" | "LOCATION" | "SIGNATURE";

export interface DeliveryLineSummary {
  id: string;
  materialName: string;
  materialCode: string;
  plannedQuantity: string;
  uomSymbol: string;
  actualQuantity: string | null;
  acceptedQuantity: string | null;
}

export interface DeliveryCard {
  id: string;
  deliveryNumber: string;
  salesOrderNumber: string;
  customerName: string;
  sourcingMode: "WAREHOUSE" | "SUPPLIER_DIRECT" | "SUPPLIER_TO_WAREHOUSE";
  pickupAddress: string;
  dropAddress: string;
  scheduledDate: string;
  status: DeliveryStatus;
  vehicleName: string | null;
  driverName: string | null;
  driverUserId: string | null;
  proofCount: number;
  lines: DeliveryLineSummary[];
}

export interface DeliveryPlanningOption {
  id: string;
  salesOrderNumber: string;
  customerName: string;
  materialName: string;
  allocatedQuantity: string;
  uomSymbol: string;
  sourcingMode: "WAREHOUSE" | "SUPPLIER_DIRECT" | "SUPPLIER_TO_WAREHOUSE";
  pickupAddress: string;
  dropAddress: string;
}

export interface DeliveryVehicleOption {
  id: string;
  code: string;
  plateNumber: string;
  vehicleType: string;
}

export interface DeliveryDriverOption {
  userId: string;
  displayName: string;
  employeeCode: string;
}

export interface DeliveryEvidenceOption {
  id: string;
  label: string;
}

export interface DeliverySnapshot {
  deliveries: DeliveryCard[];
  planningOptions: DeliveryPlanningOption[];
  vehicles: DeliveryVehicleOption[];
  drivers: DeliveryDriverOption[];
  evidence: DeliveryEvidenceOption[];
}

export type DeliveryCommandKind =
  | "delivery.plan"
  | "delivery.assign"
  | "delivery.progress"
  | "delivery.proof"
  | "delivery.confirm";
