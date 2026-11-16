import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => m }));

import { LIVE_REFRESH_GAP_MS, LIVE_REFRESH_INTERVAL_MS, LiveRefresh } from "./live-refresh";

let visibility: DocumentVisibilityState = "visible";
const worker = new EventTarget();

function setVisibility(state: DocumentVisibilityState) {
  visibility = state;
  act(() => { document.dispatchEvent(new Event("visibilitychange")); });
}

beforeEach(() => {
  vi.useFakeTimers();
  m.refresh.mockClear();
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: worker });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("D92 live refresh", () => {
  it("refreshes when the service worker reports a push, and ignores other messages", () => {
    render(<LiveRefresh />);
    act(() => { worker.dispatchEvent(new MessageEvent("message", { data: { type: "other" } })); });
    expect(m.refresh).not.toHaveBeenCalled();
    act(() => { worker.dispatchEvent(new MessageEvent("message", { data: { type: "hx-push", kind: "announcement", id: "x" } })); });
    expect(m.refresh).toHaveBeenCalledTimes(1);
  });

  it("refreshes on the Android app's window event, at most once per gap, with a trailing refresh for a burst", () => {
    render(<LiveRefresh />);
    act(() => { window.dispatchEvent(new CustomEvent("hx-push", { detail: { kind: "announcement", id: "a" } })); });
    act(() => { window.dispatchEvent(new CustomEvent("hx-push")); });
    act(() => { window.dispatchEvent(new CustomEvent("hx-push")); });
    expect(m.refresh).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(LIVE_REFRESH_GAP_MS); });
    expect(m.refresh).toHaveBeenCalledTimes(2);
    act(() => { vi.advanceTimersByTime(LIVE_REFRESH_GAP_MS * 2); });
    expect(m.refresh).toHaveBeenCalledTimes(2);
  });

  it("refreshes every minute while visible, pauses while hidden, and refreshes on coming back", () => {
    render(<LiveRefresh />);
    act(() => { vi.advanceTimersByTime(LIVE_REFRESH_INTERVAL_MS); });
    expect(m.refresh).toHaveBeenCalledTimes(1);
    setVisibility("hidden");
    act(() => { vi.advanceTimersByTime(LIVE_REFRESH_INTERVAL_MS * 3); });
    expect(m.refresh).toHaveBeenCalledTimes(1);
    setVisibility("visible");
    expect(m.refresh).toHaveBeenCalledTimes(2);
    act(() => { vi.advanceTimersByTime(LIVE_REFRESH_INTERVAL_MS); });
    expect(m.refresh).toHaveBeenCalledTimes(3);
  });

  it("stops listening when unmounted", () => {
    const view = render(<LiveRefresh />);
    act(() => { window.dispatchEvent(new CustomEvent("hx-push")); });
    act(() => { window.dispatchEvent(new CustomEvent("hx-push")); });
    view.unmount();
    act(() => { vi.advanceTimersByTime(LIVE_REFRESH_INTERVAL_MS * 2); });
    act(() => { window.dispatchEvent(new CustomEvent("hx-push")); });
    act(() => { worker.dispatchEvent(new MessageEvent("message", { data: { type: "hx-push" } })); });
    setVisibility("hidden");
    setVisibility("visible");
    expect(m.refresh).toHaveBeenCalledTimes(1);
  });
});
