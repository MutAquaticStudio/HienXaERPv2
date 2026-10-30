export type ProviderStop = {
  deliveryId: string;
  latitude: number | null;
  longitude: number | null;
};

export type RouteRecommendation = {
  providerName: "OSRM";
  state: "RECOMMENDED" | "MANUAL_FALLBACK";
  orderedDeliveryIds: string[];
  distanceMeters: number | null;
  durationSeconds: number | null;
  safeError: string | null;
};

function manualFallback(stops: ProviderStop[], safeError: string): RouteRecommendation {
  return {
    providerName: "OSRM",
    state: "MANUAL_FALLBACK",
    orderedDeliveryIds: stops.map((stop) => stop.deliveryId),
    distanceMeters: null,
    durationSeconds: null,
    safeError,
  };
}

export const PUBLIC_OSRM = "https://router.project-osrm.org";

export async function recommendRoute(stops: ProviderStop[]): Promise<RouteRecommendation> {
  if (stops.length < 2) return manualFallback(stops, "Cần ít nhất hai điểm để nhà cung cấp đề xuất thứ tự.");
  if (stops.some((stop) => stop.latitude === null || stop.longitude === null)) {
    return manualFallback(stops, "Một hoặc nhiều công trình chưa có tọa độ; giữ thứ tự thủ công.");
  }

  // FB18: without its own server the app uses the public OpenStreetMap routing server (light use, a few plans a day);
  // HX_OSRM_BASE_URL points it elsewhere, and "off" keeps every plan in the manual order.
  const configuredBase = process.env.HX_OSRM_BASE_URL?.trim() || PUBLIC_OSRM;
  if (configuredBase === "off") return manualFallback(stops, "Nhà cung cấp lộ trình đang tắt; giữ thứ tự thủ công.");

  try {
    const base = new URL(configuredBase);
    if (base.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(base.hostname)) {
      return manualFallback(stops, "Cấu hình nhà cung cấp lộ trình không an toàn; giữ thứ tự thủ công.");
    }
    const coordinates = stops.map((stop) => `${stop.longitude},${stop.latitude}`).join(";");
    const endpoint = new URL(`/trip/v1/driving/${coordinates}`, base);
    endpoint.searchParams.set("roundtrip", "false");
    endpoint.searchParams.set("source", "first");
    endpoint.searchParams.set("destination", "last");
    endpoint.searchParams.set("overview", "false");
    endpoint.searchParams.set("steps", "false");
    const configuredTimeout = Number(process.env.HX_ROUTE_PROVIDER_TIMEOUT_MS);
    const timeoutMs = Number.isFinite(configuredTimeout) ? Math.min(8000, Math.max(500, configuredTimeout)) : 3000;
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
    if (!response.ok) return manualFallback(stops, "Nhà cung cấp lộ trình tạm thời không khả dụng; giữ thứ tự thủ công.");
    const body = await response.json() as {
      code?: string;
      waypoints?: Array<{ waypoint_index?: number }>;
      trips?: Array<{ distance?: number; duration?: number }>;
    };
    if (body.code !== "Ok" || body.waypoints?.length !== stops.length || !body.trips?.[0]) {
      return manualFallback(stops, "Nhà cung cấp không trả về đề xuất hợp lệ; giữ thứ tự thủ công.");
    }
    const distance = body.trips[0].distance;
    const duration = body.trips[0].duration;
    const indexes = body.waypoints.map((waypoint) => waypoint.waypoint_index);
    if (!Number.isFinite(distance) || !Number.isFinite(duration)
      || distance! < 0 || duration! < 0
      || indexes.some((index) => !Number.isInteger(index) || index! < 0 || index! >= stops.length)
      || new Set(indexes).size !== stops.length) {
      return manualFallback(stops, "Nhà cung cấp thiếu dữ liệu thời gian, quãng đường hoặc thứ tự; giữ thứ tự thủ công.");
    }
    const orderedDeliveryIds = body.waypoints
      .map((waypoint, inputIndex) => ({ inputIndex, order: waypoint.waypoint_index }))
      .sort((a, b) => (a.order ?? a.inputIndex) - (b.order ?? b.inputIndex))
      .map(({ inputIndex }) => stops[inputIndex].deliveryId);
    if (new Set(orderedDeliveryIds).size !== stops.length) {
      return manualFallback(stops, "Nhà cung cấp trả về thứ tự không đầy đủ; giữ thứ tự thủ công.");
    }
    return {
      providerName: "OSRM",
      state: "RECOMMENDED",
      orderedDeliveryIds,
      distanceMeters: Math.round(distance!),
      durationSeconds: Math.round(duration!),
      safeError: null,
    };
  } catch {
    return manualFallback(stops, "Nhà cung cấp lộ trình hết thời gian hoặc không thể kết nối; giữ thứ tự thủ công.");
  }
}
