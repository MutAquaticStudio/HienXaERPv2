import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ForegroundGpsControl } from "./foreground-gps-control";

describe("foreground GPS failure handling", () => {
  const originalGeolocation = Object.getOwnPropertyDescriptor(navigator, "geolocation");
  const originalRandomUUID = Object.getOwnPropertyDescriptor(globalThis.crypto, "randomUUID");
  let locationSuccess: PositionCallback | undefined;
  let locationError: PositionErrorCallback | undefined;
  let watchPosition: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    locationSuccess = undefined;
    locationError = undefined;
    watchPosition = vi.fn((onSuccess: PositionCallback, onError: PositionErrorCallback) => {
      locationSuccess = onSuccess;
      locationError = onError;
      return 7;
    });
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { watchPosition, clearWatch: vi.fn() },
    });
    Object.defineProperty(globalThis.crypto, "randomUUID", {
      configurable: true,
      value: () => "00000000-0000-4000-8000-000000000001",
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    if (originalGeolocation) Object.defineProperty(navigator, "geolocation", originalGeolocation);
    else Reflect.deleteProperty(navigator, "geolocation");
    if (originalRandomUUID) Object.defineProperty(globalThis.crypto, "randomUUID", originalRandomUUID);
    else Reflect.deleteProperty(globalThis.crypto, "randomUUID");
  });

  it("retains the permission-denied explanation after server stop succeeds", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sessionId: "gps-session", lastSequence: 0 }) })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", request);
    render(<ForegroundGpsControl deliveryId="delivery" assignmentVersion={1} />);
    fireEvent.click(screen.getByRole("button", { name: "Bật chia sẻ vị trí" }));
    await waitFor(() => expect(watchPosition).toHaveBeenCalledOnce());
    await act(async () => {
      locationError?.({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError);
    });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Bạn chưa cấp quyền vị trí cho trình duyệt."));
    expect(screen.getByRole("button", { name: "Bật chia sẻ vị trí" })).toBeEnabled();
    expect(request).toHaveBeenCalledWith("/api/gps/session/stop", expect.objectContaining({ method: "POST" }));
  });

  it("does not claim a server stop on failure and permits retry", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sessionId: "gps-session", lastSequence: 0 }) })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", request);
    render(<ForegroundGpsControl deliveryId="delivery" assignmentVersion={1} />);
    fireEvent.click(screen.getByRole("button", { name: "Bật chia sẻ vị trí" }));
    await screen.findByRole("button", { name: "Dừng GPS" });
    fireEvent.click(screen.getByRole("button", { name: "Dừng GPS" }));
    await screen.findByRole("button", { name: "Thử dừng GPS" });
    expect(screen.getByRole("status")).toHaveTextContent("chưa xác nhận dừng phiên trên máy chủ");
    fireEvent.click(screen.getByRole("button", { name: "Thử dừng GPS" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Đã dừng chia sẻ vị trí."));
    expect(screen.getByRole("button", { name: "Bật chia sẻ vị trí" })).toBeEnabled();
  });

  it("recovers the start button after a network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("offline")));
    render(<ForegroundGpsControl deliveryId="delivery" assignmentVersion={1} />);
    fireEvent.click(screen.getByRole("button", { name: "Bật chia sẻ vị trí" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Không thể kết nối để bật GPS."));
    expect(screen.getByRole("button", { name: "Bật chia sẻ vị trí" })).toBeEnabled();
  });

  it("continues the sequence of an active session after reconnecting", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sessionId: "gps-session", lastSequence: 7 }) })
      .mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", request);
    render(<ForegroundGpsControl deliveryId="delivery" assignmentVersion={1} />);
    fireEvent.click(screen.getByRole("button", { name: "Bật chia sẻ vị trí" }));
    await waitFor(() => expect(watchPosition).toHaveBeenCalledOnce());
    await act(async () => {
      locationSuccess?.({
        timestamp: Date.now(),
        coords: { latitude: 10, longitude: 106, accuracy: 10, speed: null, heading: null },
      } as GeolocationPosition);
    });
    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/gps/session/ping", expect.objectContaining({
      body: expect.stringContaining('"sequence":8'),
    })));
  });
});
