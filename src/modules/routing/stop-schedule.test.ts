import { describe, expect, it } from "vitest";
import { effectiveWindow, overlappingIndexes, parseStopMinutes, stopWindows } from "@/modules/routing/stop-schedule";

describe("route stop schedule", () => {
  it("accepts whole minutes per stop within the supported range", () => {
    expect(parseStopMinutes("60")).toBe(60);
    expect(parseStopMinutes("9")).toBeNull();
    expect(parseStopMinutes("481")).toBeNull();
    expect(parseStopMinutes("45.5")).toBeNull();
    expect(parseStopMinutes("")).toBeNull();
  });

  it("lays stops back to back from the departure time", () => {
    expect(stopWindows("2200-01-01T00:00:00.000Z", 45, 3)).toEqual([
      { start: "2200-01-01T00:00:00.000Z", end: "2200-01-01T00:45:00.000Z" },
      { start: "2200-01-01T00:45:00.000Z", end: "2200-01-01T01:30:00.000Z" },
      { start: "2200-01-01T01:30:00.000Z", end: "2200-01-01T02:15:00.000Z" },
    ]);
    expect(stopWindows("không phải ngày", 45, 3)).toEqual([]);
  });

  it("keeps a delivery's own schedule and assumes four hours when it has no end", () => {
    const planned = { start: "2200-01-01T00:00:00.000Z", end: "2200-01-01T01:00:00.000Z" };
    expect(effectiveWindow(null, null, planned)).toBe(planned);
    expect(effectiveWindow("2200-01-01T03:00:00.000Z", null, planned)).toEqual({ start: "2200-01-01T03:00:00.000Z", end: "2200-01-01T07:00:00.000Z" });
    expect(effectiveWindow("2200-01-01T03:00:00.000Z", "2200-01-01T04:00:00.000Z", planned)).toEqual({ start: "2200-01-01T03:00:00.000Z", end: "2200-01-01T04:00:00.000Z" });
  });

  it("flags stops whose windows overlap on the same vehicle, touching ends allowed", () => {
    expect([...overlappingIndexes([
      { start: "2200-01-01T00:00:00.000Z", end: "2200-01-01T01:00:00.000Z" },
      { start: "2200-01-01T01:00:00.000Z", end: "2200-01-01T02:00:00.000Z" },
      { start: "2200-01-01T01:30:00.000Z", end: "2200-01-01T02:30:00.000Z" },
      null,
    ])].sort()).toEqual([1, 2]);
  });
});
