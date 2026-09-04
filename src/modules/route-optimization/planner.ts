import { PlatformError } from "@/modules/platform/errors";
import type {
  PreparedRoutePlan,
  RoutePlanWarning,
  RoutePlanningCandidate,
  RouteVehicleOption,
} from "@/modules/route-optimization/types";

export interface DistanceProvider {
  order(candidates: RoutePlanningCandidate[], origin?: RouteVehicleOption["currentLocation"]): Promise<Array<{
    deliveryId: string;
    estimatedTravelMinutes: number | null;
  }>>;
}

export class RouteOptimizationService {
  constructor(private readonly distanceProvider: DistanceProvider) {}

  prepare(input: Omit<Parameters<typeof prepareRoutePlan>[0], "provider">) {
    return prepareRoutePlan({ ...input, provider: this.distanceProvider });
  }
}

function warning(
  code: RoutePlanWarning["code"],
  message: string,
  deliveryId?: string,
): RoutePlanWarning {
  return { code, message, ...(deliveryId ? { deliveryId } : {}) };
}

function manualOrder(candidates: RoutePlanningCandidate[]) {
  return [...candidates].sort(
    (left, right) =>
      left.priority - right.priority ||
      left.deliveryNumber.localeCompare(right.deliveryNumber, "vi"),
  );
}

function profileFor(
  vehicle: RouteVehicleOption,
  candidate: RoutePlanningCandidate,
) {
  return candidate.lines.map((line) => ({
    line,
    profile: vehicle.loadProfiles.find(
      (profile) =>
        profile.uomId === line.uomId &&
        (profile.materialId === line.materialId ||
          (profile.materialId === null &&
            profile.materialGroupId !== null &&
            profile.materialGroupId === line.materialGroupId)),
    ),
  }));
}

function capacityWarnings(
  vehicle: RouteVehicleOption,
  candidates: RoutePlanningCandidate[],
): RoutePlanWarning[] {
  const warnings: RoutePlanWarning[] = [];
  const totals = new Map<string, { quantity: number; limit: number; deliveryIds: string[] }>();
  for (const candidate of candidates) {
    for (const { line, profile } of profileFor(vehicle, candidate)) {
      if (!profile) {
        warnings.push(warning(
          "CAPACITY_PROFILE_MISSING",
          `Xe ${vehicle.code} chưa có cấu hình tải cho ${line.uomSymbol}; cần điều phối xác nhận tải thực tế.`,
          candidate.id,
        ));
        continue;
      }
      const key = `${profile.materialId ?? profile.materialGroupId}:${profile.uomId}`;
      const current = totals.get(key) ?? { quantity: 0, limit: Number(profile.plannedQuantity), deliveryIds: [] };
      current.quantity += Number(line.plannedQuantity);
      current.deliveryIds.push(candidate.id);
      totals.set(key, current);
    }
  }
  for (const total of totals.values()) {
    if (total.quantity > total.limit) {
      for (const deliveryId of total.deliveryIds) {
        warnings.push(warning(
          "VEHICLE_CAPACITY_EXCEEDED",
          `Tổng khối lượng đề xuất ${total.quantity} vượt tải cấu hình ${total.limit}; không áp dụng cho đến khi điều phối tách chuyến.`,
          deliveryId,
        ));
      }
    }
  }
  return warnings;
}

function validProviderOrder(
  candidates: RoutePlanningCandidate[],
  providerOrder: Array<{ deliveryId: string }>,
) {
  const expected = new Set(candidates.map((candidate) => candidate.id));
  return providerOrder.length === candidates.length &&
    providerOrder.every((item) => expected.delete(item.deliveryId)) && expected.size === 0;
}

function timeWindowWarnings(
  candidates: RoutePlanningCandidate[],
  providerOrder: Array<{ deliveryId: string; estimatedTravelMinutes: number | null }>,
): RoutePlanWarning[] {
  const candidatesById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const firstDate = candidates[0]?.scheduledDate;
  if (!firstDate) return [];
  let elapsedMinutes = 0;
  const warnings: RoutePlanWarning[] = [];
  for (const item of providerOrder) {
    const candidate = candidatesById.get(item.deliveryId);
    if (!candidate || !candidate.timeWindowStart || !candidate.timeWindowEnd) continue;
    elapsedMinutes += item.estimatedTravelMinutes ?? 0;
    const arrival = new Date(`${firstDate}T07:00:00.000Z`).getTime() + elapsedMinutes * 60_000;
    const windowStart = new Date(candidate.timeWindowStart).getTime();
    const windowEnd = new Date(candidate.timeWindowEnd).getTime();
    if (Number.isNaN(windowStart) || Number.isNaN(windowEnd) || arrival < windowStart || arrival > windowEnd) {
      warnings.push(warning(
        "TIME_WINDOW_VIOLATION",
        "Thứ tự đề xuất đi ngoài khung giờ giao của chuyến; điều phối cần tách hoặc đổi thứ tự trước khi duyệt.",
        candidate.id,
      ));
    }
  }
  return warnings;
}

export async function prepareRoutePlan(input: {
  candidates: RoutePlanningCandidate[];
  vehicle: RouteVehicleOption;
  driverActiveAssignmentCount: number;
  provider: DistanceProvider;
}): Promise<PreparedRoutePlan> {
  if (!input.candidates.length) {
    throw new PlatformError("Cần chọn ít nhất một chuyến giao để lập lộ trình.", "ROUTE_PLAN_STOPS_REQUIRED", 400);
  }

  const warnings = capacityWarnings(input.vehicle, input.candidates);
  for (const candidate of input.candidates) {
    if (!candidate.timeWindowStart || !candidate.timeWindowEnd) {
      warnings.push(warning(
        "TIME_WINDOW_UNAVAILABLE",
        "Chuyến chưa có khung giờ giao; đây là đề xuất thứ tự, điều phối cần xác nhận giờ hẹn trước khi áp dụng.",
        candidate.id,
      ));
    }
    if (candidate.assignmentMode === "POOL_CLAIM") {
      warnings.push(warning(
        "POOL_CLAIM_BLOCKS_APPLY",
        "Việc liên quan đang ở bể nhận việc; RO1 chỉ hiển thị và không được nhận hoặc chuyển việc này.",
        candidate.id,
      ));
    }
  }
  if (input.driverActiveAssignmentCount > 0) {
    warnings.push(warning(
      "DRIVER_HAS_EXISTING_ASSIGNMENTS",
      "Tài xế đã có chuyến đang phân công trong ngày; hãy đối chiếu ca làm trước khi duyệt.",
    ));
  }
  if (input.vehicle.currentLocation?.freshness === "LIVE") {
    warnings.push(warning(
      "GPS_CURRENT_LOCATION_AVAILABLE",
      "Đề xuất có thể dùng vị trí xe mới nhất làm đầu vào. GPS chỉ hỗ trợ ước lượng; điều phối vẫn phải duyệt trước khi áp dụng P7.",
    ));
  } else if (input.vehicle.currentLocation) {
    warnings.push(warning(
      "GPS_LOCATION_STALE",
      "Vị trí xe đã cũ; hệ thống dùng điểm xuất phát kế hoạch và hạ độ tin cậy của đề xuất.",
    ));
  }

  try {
    const ordered = await input.provider.order(input.candidates, input.vehicle.currentLocation);
    if (!validProviderOrder(input.candidates, ordered)) throw new Error("DISTANCE_PROVIDER_RESULT_INVALID");
    return {
      orderedDeliveryIds: ordered.map((item) => item.deliveryId),
      providerMode: "MAP_PROVIDER",
      warnings: [...warnings, ...timeWindowWarnings(input.candidates, ordered)],
    };
  } catch {
    return {
      orderedDeliveryIds: manualOrder(input.candidates).map((candidate) => candidate.id),
      providerMode: "MANUAL_FALLBACK",
      warnings: [
        warning(
          "MAP_PROVIDER_UNAVAILABLE",
          "Chưa kết nối được nhà cung cấp bản đồ. Hệ thống giữ nguyên dữ liệu Delivery và đưa ra thứ tự thủ công để điều phối xem xét.",
        ),
        ...warnings,
      ],
    };
  }
}
