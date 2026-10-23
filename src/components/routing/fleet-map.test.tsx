import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("leaflet/dist/leaflet.css", () => ({}));
vi.mock("leaflet", () => {
  const chain = () => { const value: Record<string, unknown> = {}; for (const name of ["addTo", "addLayer", "removeLayer", "hasLayer", "bindTooltip", "bindPopup", "on", "setView", "clearLayers", "remove", "fitBounds"]) value[name] = () => value; return value; };
  return { map: () => chain(), tileLayer: () => chain(), layerGroup: () => chain(), circleMarker: () => chain(), polyline: () => chain(), latLngBounds: () => ({}) };
});
import { FleetMap, type FleetPosition } from "./fleet-map";

const truck: FleetPosition = { session_id: "s1", delivery_id: "d1", delivery_number: "PG-0001", plate_number: "99C-123.45", employee_name: "Thợ A",
  latitude: "21.0", longitude: "105.8", captured_at: "2026-10-24T03:00:00Z", is_stale: false };
afterEach(() => vi.unstubAllGlobals());

it("lists the trucks sharing GPS and refreshes from the fleet API (FB10)", async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ fleet: [truck, { ...truck, session_id: "s2", plate_number: "99C-999.99", is_stale: true }], trail: [] })));
  vi.stubGlobal("fetch", fetchMock);
  render(<FleetMap initial={[truck]} />);
  expect(screen.getByText("99C-123.45")).toBeInTheDocument();
  await waitFor(() => expect(screen.getByText("99C-999.99")).toBeInTheDocument());
  expect(fetchMock).toHaveBeenCalledWith("/api/gps/fleet", { cache: "no-store" });
  expect(screen.getByText(/Mất tín hiệu/)).toBeInTheDocument();
});

it("explains how to start sharing when no truck is on the map", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ fleet: [], trail: [] }))));
  render(<FleetMap initial={[]} />);
  expect(screen.getByText(/Bật chia sẻ vị trí/)).toBeInTheDocument();
});
