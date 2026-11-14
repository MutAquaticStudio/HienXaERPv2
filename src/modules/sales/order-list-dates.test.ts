import { expect, it, vi } from "vitest";
import { applyDayRange, dayEndExclusiveIso, dayStartIso, hasOrderDateFilter, parseFilterDay, parseOrderDateFilters } from "./order-list-dates";

it("treats a day as a Vietnam business day: from 00:00 +07:00 to before the next 00:00", () => {
  expect(dayStartIso("2026-11-13")).toBe("2026-11-12T17:00:00.000Z");
  expect(dayEndExclusiveIso("2026-11-13")).toBe("2026-11-13T17:00:00.000Z");
  expect(dayEndExclusiveIso("2026-12-31")).toBe("2026-12-31T17:00:00.000Z");
});

it.each([["2026-11-13", "2026-11-13"], [" 2026-02-28 ", "2026-02-28"], ["2026-02-30", ""], ["13/11/2026", ""], ["", ""], [undefined, ""], ["2026-13-01", ""]])(
  "accepts only a real calendar day: %j", (value, expected) => expect(parseFilterDay(value)).toBe(expected));

it("reads the four filters and ignores the malformed ones", () => {
  const filters = parseOrderDateFilters({ createdFrom: "2026-11-01", createdTo: "bad", deliveryFrom: "", deliveryTo: "2026-11-30" });
  expect(filters).toEqual({ createdFrom: "2026-11-01", createdTo: "", deliveryFrom: "", deliveryTo: "2026-11-30" });
  expect(hasOrderDateFilter(filters)).toBe(true);
  expect(hasOrderDateFilter(parseOrderDateFilters({}))).toBe(false);
});

it("asks for the day range on the given column, with an open end when a date is empty", () => {
  const request = { gte: vi.fn(() => request), lt: vi.fn(() => request) };
  applyDayRange(request, "requested_delivery_at", "2026-11-01", "2026-11-13");
  expect(request.gte).toHaveBeenCalledExactlyOnceWith("requested_delivery_at", "2026-10-31T17:00:00.000Z");
  expect(request.lt).toHaveBeenCalledExactlyOnceWith("requested_delivery_at", "2026-11-13T17:00:00.000Z");
  const open = { gte: vi.fn(() => open), lt: vi.fn(() => open) };
  applyDayRange(open, "created_at", "", "2026-11-13");
  expect(open.gte).not.toHaveBeenCalled();
  expect(open.lt).toHaveBeenCalledTimes(1);
});
