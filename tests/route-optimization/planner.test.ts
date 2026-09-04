import { describe, expect, it } from "vitest";

import { prepareRoutePlan } from "@/modules/route-optimization/planner";
import type { RoutePlanningCandidate, RouteVehicleOption } from "@/modules/route-optimization/types";

const vehicle: RouteVehicleOption = {
  id: "vehicle-1", code: "XE-01", plateNumber: "99C-123.45", vehicleType: "Xe ben",
  maxPayloadKg: "15000", maxVolumeM3: null,
  loadProfiles: [{ materialId: "material-1", materialGroupId: null, plannedQuantity: "10", uomId: "uom-1" }],
};

function candidate(id: string, priority: number, quantity = "6"): RoutePlanningCandidate {
  return {
    id, deliveryNumber: `DLV-${id}`, customerName: `Khách ${id}`,
    pickupAddress: "Kho", dropAddress: `Điểm ${id}`, scheduledDate: "2026-09-01",
    priority, assignmentMode: null, timeWindowStart: null, timeWindowEnd: null,
    lines: [{ materialId: "material-1", materialGroupId: null, plannedQuantity: quantity, uomId: "uom-1", uomSymbol: "tấn" }],
  };
}

describe("RO1 planning guardrails", () => {
  it("falls back without changing Delivery order when the map provider fails", async () => {
    const output = await prepareRoutePlan({
      candidates: [candidate("2", 2), candidate("1", 1)], vehicle, driverActiveAssignmentCount: 0,
      provider: { order: async () => { throw new Error("provider outage"); } },
    });
    expect(output.providerMode).toBe("MANUAL_FALLBACK");
    expect(output.orderedDeliveryIds).toEqual(["1", "2"]);
    expect(output.warnings.map((item) => item.code)).toContain("MAP_PROVIDER_UNAVAILABLE");
    expect(output.warnings.map((item) => item.code)).toContain("VEHICLE_CAPACITY_EXCEEDED");
  });

  it("surfaces time window and pool-claim warnings from a provider recommendation", async () => {
    const blocked = candidate("pool", 1, "4");
    blocked.assignmentMode = "POOL_CLAIM";
    blocked.timeWindowStart = "2026-09-01T07:00:00.000Z";
    blocked.timeWindowEnd = "2026-09-01T07:30:00.000Z";
    const output = await prepareRoutePlan({
      candidates: [blocked], vehicle, driverActiveAssignmentCount: 1,
      provider: { order: async () => [{ deliveryId: "pool", estimatedTravelMinutes: 60 }] },
    });
    expect(output.providerMode).toBe("MAP_PROVIDER");
    expect(output.warnings.map((item) => item.code)).toEqual(expect.arrayContaining([
      "TIME_WINDOW_VIOLATION", "POOL_CLAIM_BLOCKS_APPLY", "DRIVER_HAS_EXISTING_ASSIGNMENTS",
    ]));
  });

  it("passes a fresh GPS position only as a recommendation input and lowers confidence for stale GPS", async () => {
    const gpsVehicle: RouteVehicleOption = {
      ...vehicle,
      currentLocation: {
        latitude: "21.1714382", longitude: "106.0697221",
        recordedAt: "2026-09-01T07:14:35.000Z", freshness: "LIVE",
      },
    };
    let providerOrigin: RouteVehicleOption["currentLocation"];
    const live = await prepareRoutePlan({
      candidates: [candidate("live", 1, "4")], vehicle: gpsVehicle, driverActiveAssignmentCount: 0,
      provider: { order: async (items, origin) => {
        providerOrigin = origin;
        return items.map((item) => ({ deliveryId: item.id, estimatedTravelMinutes: 15 }));
      } },
    });
    expect(providerOrigin).toEqual(gpsVehicle.currentLocation);
    expect(live.warnings.map((item) => item.code)).toContain("GPS_CURRENT_LOCATION_AVAILABLE");
    expect(live.orderedDeliveryIds).toEqual(["live"]);

    const stale = await prepareRoutePlan({
      candidates: [candidate("stale", 1, "4")],
      vehicle: { ...gpsVehicle, currentLocation: { ...gpsVehicle.currentLocation!, freshness: "STALE" } },
      driverActiveAssignmentCount: 0,
      provider: { order: async (items) => items.map((item) => ({ deliveryId: item.id, estimatedTravelMinutes: null })) },
    });
    expect(stale.warnings.map((item) => item.code)).toContain("GPS_LOCATION_STALE");
  });
});
