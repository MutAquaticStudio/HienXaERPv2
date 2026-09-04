export const ROUTE_PLAN_STATUSES = [
  "DRAFT",
  "APPROVED",
  "APPLIED",
  "SUPERSEDED",
  "CANCELLED",
] as const;

export type RoutePlanStatus = (typeof ROUTE_PLAN_STATUSES)[number];
export type RouteProviderMode = "MAP_PROVIDER" | "MANUAL_FALLBACK";

export interface RoutePlanWarning {
  code:
    | "MAP_PROVIDER_UNAVAILABLE"
    | "VEHICLE_CAPACITY_EXCEEDED"
    | "CAPACITY_PROFILE_MISSING"
    | "TIME_WINDOW_UNAVAILABLE"
    | "TIME_WINDOW_VIOLATION"
    | "DRIVER_HAS_EXISTING_ASSIGNMENTS"
    | "POOL_CLAIM_BLOCKS_APPLY"
    | "GPS_CURRENT_LOCATION_AVAILABLE"
    | "GPS_LOCATION_STALE";
  message: string;
  deliveryId?: string;
}

export interface RouteCandidateLine {
  materialId: string;
  materialGroupId: string | null;
  plannedQuantity: string;
  uomId: string;
  uomSymbol: string;
}

export interface RoutePlanningCandidate {
  id: string;
  deliveryNumber: string;
  customerName: string;
  pickupAddress: string;
  dropAddress: string;
  scheduledDate: string;
  priority: number;
  assignmentMode: "DIRECT" | "POOL_CLAIM" | null;
  timeWindowStart: string | null;
  timeWindowEnd: string | null;
  lines: RouteCandidateLine[];
}

export interface RouteLoadProfile {
  materialId: string | null;
  materialGroupId: string | null;
  plannedQuantity: string;
  uomId: string;
}

export interface RouteVehicleOption {
  id: string;
  code: string;
  plateNumber: string;
  vehicleType: string;
  maxPayloadKg: string | null;
  maxVolumeM3: string | null;
  loadProfiles: RouteLoadProfile[];
  currentLocation?: {
    latitude: string;
    longitude: string;
    recordedAt: string;
    freshness: "LIVE" | "STALE" | "OFFLINE";
  } | null;
}

export interface RouteDriverOption {
  userId: string;
  displayName: string;
  employeeCode: string;
  activeAssignmentCount: number;
}

export interface RoutePlanStop {
  id: string;
  deliveryId: string;
  stopSequence: number;
  deliveryNumber: string;
  customerName: string;
  pickupAddress: string;
  dropAddress: string;
  priority: number;
  warnings: RoutePlanWarning[];
}

export interface RoutePlanCard {
  id: string;
  planNumber: string;
  scheduledDate: string;
  vehicleName: string;
  driverName: string;
  status: RoutePlanStatus;
  providerMode: RouteProviderMode;
  warnings: RoutePlanWarning[];
  approvalReason: string | null;
  applyReason: string | null;
  stops: RoutePlanStop[];
}

export interface RouteOptimizationSnapshot {
  candidates: RoutePlanningCandidate[];
  vehicles: RouteVehicleOption[];
  drivers: RouteDriverOption[];
  plans: RoutePlanCard[];
}

export interface ApprovedDriverRoute {
  planNumber: string;
  scheduledDate: string;
  vehicleName: string;
  stops: RoutePlanStop[];
}

export type RoutePlanCommandInput =
  | {
      kind: "route.plan.create";
      scheduledDate: string;
      vehicleId: string;
      driverUserId: string;
      deliveryIds: string[];
    }
  | {
      kind: "route.plan.approve";
      routePlanId: string;
      reason: string;
    }
  | {
      kind: "route.plan.apply";
      routePlanId: string;
      reason: string;
      confirmApply: true;
    };

export interface PreparedRoutePlan {
  orderedDeliveryIds: string[];
  providerMode: RouteProviderMode;
  warnings: RoutePlanWarning[];
}
