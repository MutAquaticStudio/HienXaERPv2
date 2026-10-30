import { afterEach, describe, expect, it, vi } from "vitest";

import { PUBLIC_OSRM, recommendRoute } from "./provider";

const stops = [{ deliveryId: "a", latitude: 10.8, longitude: 106.7 }, { deliveryId: "b", latitude: 10.9, longitude: 106.8 }];
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("route suggestions (FB18)", () => {
  it("uses the public OpenStreetMap routing server when none is configured", async () => {
    vi.stubEnv("HX_OSRM_BASE_URL", "");
    const fetch = vi.fn(async () => new Response(JSON.stringify({ code: "Ok", waypoints: [{ waypoint_index: 1 }, { waypoint_index: 0 }], trips: [{ distance: 1200, duration: 300 }] })));
    vi.stubGlobal("fetch", fetch);
    const result = await recommendRoute(stops);
    expect(String((fetch.mock.calls[0] as unknown[])[0])).toMatch(new RegExp(`^${PUBLIC_OSRM}/trip/v1/driving/`));
    expect(result).toMatchObject({ state: "RECOMMENDED", orderedDeliveryIds: ["b", "a"], distanceMeters: 1200 });
  });

  it("keeps the manual order when switched off or when a site has no point", async () => {
    vi.stubEnv("HX_OSRM_BASE_URL", "off");
    expect(await recommendRoute(stops)).toMatchObject({ state: "MANUAL_FALLBACK" });
    vi.stubEnv("HX_OSRM_BASE_URL", "");
    expect(await recommendRoute([stops[0], { deliveryId: "c", latitude: null, longitude: null }])).toMatchObject({ state: "MANUAL_FALLBACK", safeError: expect.stringMatching(/tọa độ/) });
  });
});
