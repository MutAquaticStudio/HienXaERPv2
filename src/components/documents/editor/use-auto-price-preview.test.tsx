import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PRICE_PREVIEW_DELAY_MS, useAutoPricePreview } from "./use-auto-price-preview";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const settle = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(PRICE_PREVIEW_DELAY_MS + 1); }); };

it("prices again when the same choice is made twice, so the total never stays blank", async () => {
  const load = vi.fn().mockResolvedValue("priced");
  const { result } = renderHook(() => useAutoPricePreview({ load, enabled: true, scope: "s", failure: "failed" }));
  await settle();
  expect(load).toHaveBeenCalledTimes(1);
  expect(result.current.preview).toBe("priced");

  act(() => result.current.invalidate());
  expect(result.current.preview).toBeNull();
  await settle();
  expect(load).toHaveBeenCalledTimes(2);
  expect(result.current.preview).toBe("priced");
});

it("does not reprice a stored draft just by opening it", async () => {
  const load = vi.fn().mockResolvedValue("priced");
  const { result } = renderHook(() => useAutoPricePreview({ load, enabled: true, scope: "s", failure: "failed", holdUntilChange: true }));
  await settle();
  expect(load).not.toHaveBeenCalled();
  act(() => result.current.invalidate());
  await settle();
  expect(load).toHaveBeenCalledTimes(1);
});
