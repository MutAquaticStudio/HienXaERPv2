import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("leaflet/dist/leaflet.css", () => ({}));
// Each base-map layer keeps its event handlers so a test can make its tiles fail.
const tileLayers = vi.hoisted(() => [] as Array<{ url: string; options: Record<string, unknown>; handlers: Record<string, () => void> }>);
const leafletMock = vi.hoisted(() => {
  const chain = () => { const value: Record<string, unknown> = {}; for (const name of ["addTo", "addLayer", "removeLayer", "hasLayer", "bindTooltip", "bindPopup", "on", "setView", "clearLayers", "remove", "fitBounds", "invalidateSize"]) value[name] = () => value; return value; };
  const tileLayer = (url: string, options: Record<string, unknown>) => {
    const value = chain(); const entry = { url, options, handlers: {} as Record<string, () => void> }; tileLayers.push(entry);
    value.on = (name: string, handler: () => void) => { entry.handlers[name] = handler; return value; };
    return value;
  };
  return { map: () => chain(), tileLayer, layerGroup: () => chain(), circleMarker: () => chain(), polyline: () => chain(), latLngBounds: () => ({}) };
});
// The map loads Leaflet through this seam; the fake is handed over directly, so the real library never loads in tests.
vi.mock("./load-leaflet", () => ({ loadLeaflet: async () => leafletMock }));
import { FleetMap, type FleetPosition } from "./fleet-map";

const worker: FleetPosition = { employee_id: "e1", employee_name: "Thợ A", delivery_number: "PG-0001", plate_number: "99C-123.45",
  latitude: "21.0", longitude: "105.8", captured_at: "2026-10-24T03:00:00Z", is_stale: false };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); tileLayers.length = 0; });

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

it("says so when OpenStreetMap sends no tiles and nothing else is configured (FB18)", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ fleet: [], trail: [] }))));
  render(<FleetMap initial={[]} />);
  await waitFor(() => expect(tileLayers).toHaveLength(1));
  expect(tileLayers[0]).toMatchObject({ url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", options: { referrerPolicy: "strict-origin-when-cross-origin" } });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  act(() => { for (let i = 0; i < 3; i += 1) tileLayers[0].handlers.tileerror(); });
  expect(screen.getByRole("alert")).toHaveTextContent("Không tải được nền bản đồ");
});
