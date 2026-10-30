import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("leaflet/dist/leaflet.css", () => ({}));
vi.mock("leaflet", () => {
  const chain = () => { const value: Record<string, unknown> = {}; for (const name of ["addTo", "addLayer", "removeLayer", "hasLayer", "bindTooltip", "bindPopup", "on", "setView", "clearLayers", "remove", "fitBounds"]) value[name] = () => value; return value; };
  return { map: () => chain(), tileLayer: () => chain(), layerGroup: () => chain(), circleMarker: () => chain(), polyline: () => chain(), latLngBounds: () => ({}) };
});
import { FleetMap, type FleetPosition } from "./fleet-map";

const worker: FleetPosition = { employee_id: "e1", employee_name: "Thợ A", delivery_number: "PG-0001", plate_number: "99C-123.45",
  latitude: "21.0", longitude: "105.8", captured_at: "2026-10-24T03:00:00Z", is_stale: false };
afterEach(() => vi.unstubAllGlobals());

it("lists the workers on shift and refreshes from the fleet API (FB18 D40)", async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ fleet: [worker,
    { ...worker, employee_id: "e2", employee_name: "Thợ B", delivery_number: null, plate_number: null, is_stale: true }], trail: [] })));
  vi.stubGlobal("fetch", fetchMock);
  render(<FleetMap initial={[worker]} />);
  expect(screen.getByText("Thợ A")).toBeInTheDocument();
  expect(screen.getByText("Đang giao PG-0001 · 99C-123.45")).toBeInTheDocument();
  await waitFor(() => expect(screen.getByText("Thợ B")).toBeInTheDocument());
  expect(screen.getByText("Không có chuyến giao")).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith("/api/gps/fleet", { cache: "no-store" });
  expect(screen.getByText(/Mất tín hiệu/)).toBeInTheDocument();
});

it("explains that sharing starts with the shift when nobody is on the map", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ fleet: [], trail: [] }))));
  render(<FleetMap initial={[]} />);
  expect(screen.getByText(/tự bật khi thợ Vào ca/)).toBeInTheDocument();
});
