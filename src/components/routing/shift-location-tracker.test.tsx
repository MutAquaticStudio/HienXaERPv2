import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/work" }));
import { ShiftLocationTracker } from "./shift-location-tracker";
import { ShiftLocationStatus } from "./shift-location-status";

const position = { coords: { latitude: 10.82, longitude: 106.63, accuracy: 12 }, timestamp: Date.parse("2026-10-30T02:00:00Z") };

function geolocation(onWatch: (success: (p: unknown) => void, failure: (e: unknown) => void) => void) {
  const clearWatch = vi.fn();
  vi.stubGlobal("navigator", { ...navigator, geolocation: { watchPosition: vi.fn((s, f) => { onWatch(s, f); return 7; }), clearWatch } });
  return clearWatch;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("shares the position while the worker is on shift (FB18 D40)", async () => {
  geolocation((success) => setTimeout(() => success(position), 0));
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => new Response(JSON.stringify(init?.method === "POST" ? { onShift: true, stored: true } : { onShift: true })));
  vi.stubGlobal("fetch", fetchMock);
  render(<><ShiftLocationTracker /><ShiftLocationStatus /></>);
  await waitFor(() => expect(screen.getByRole("status", { name: "Đang chia sẻ vị trí trong ca" })).toBeInTheDocument());
  const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
  expect(JSON.parse(String(post?.[1]?.body))).toEqual({ latitude: 10.82, longitude: 106.63, accuracyMeters: 12, capturedAt: "2026-10-30T02:00:00.000Z" });
  expect(screen.getByRole("heading", { name: "Đang chia sẻ vị trí trong ca" })).toBeInTheDocument();
});

it("does not ask for the location outside a shift and stops when the shift has ended", async () => {
  const watch = vi.fn();
  vi.stubGlobal("navigator", { ...navigator, geolocation: { watchPosition: watch, clearWatch: vi.fn() } });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ onShift: false }))));
  render(<><ShiftLocationTracker /><ShiftLocationStatus /></>);
  await waitFor(() => expect(screen.getByRole("heading", { name: "Chưa vào ca" })).toBeInTheDocument());
  expect(watch).not.toHaveBeenCalled();
});

it("points the worker to the Vị trí page when the browser blocks the location", async () => {
  geolocation((_success, failure) => setTimeout(() => failure({ code: 1, PERMISSION_DENIED: 1 }), 0));
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ onShift: true }))));
  render(<ShiftLocationTracker />);
  await waitFor(() => expect(screen.getByRole("link", { name: "Chưa bật vị trí trong ca" })).toHaveAttribute("href", "/work/tracking"));
});
