import { describe, expect, it } from "vitest";
import { formatBusinessDate, formatBusinessDateTime, parseBusinessDateTime } from "./business-time";
import { formatQuantity } from "./quantity";

describe("business document display", () => {
  it("converts Vietnam wall-clock inputs without using the server timezone", () => {
    expect(parseBusinessDateTime("2026-10-01T08:30")).toBe("2026-10-01T01:30:00.000Z");
    expect(parseBusinessDateTime("2026-10-01T00:15:30.125")).toBe("2026-09-30T17:15:30.125Z");
    expect(parseBusinessDateTime("2024-02-29T08:30")).toBe("2024-02-29T01:30:00.000Z");
  });
  it("preserves an explicitly zoned instant", () => {
    expect(parseBusinessDateTime("2026-10-01T01:30:00.000Z")).toBe("2026-10-01T01:30:00.000Z");
    expect(parseBusinessDateTime("2026-10-01T08:30:00+07:00")).toBe("2026-10-01T01:30:00.000Z");
  });
  it.each(["", "2026-10-01", "2026-02-30T08:30", "2025-02-29T08:30", "2026-13-01T08:30", "2026-10-01T24:00", "2026-10-01T08:60", "2026-10-01T08:30:60", "2026-10-01T08:30+07:60"])("rejects an invalid business datetime: %s", (value) => {
    expect(parseBusinessDateTime(value)).toBeNull();
  });
  it("keeps Vietnam midnight on the correct business date on a UTC server", () => {
    expect(formatBusinessDate("2026-09-27T20:15:00Z")).toBe("28/9/2026");
    const result = formatBusinessDateTime("2026-10-27T20:19:00Z");
    expect(result).toContain("03:19");
    expect(result).toContain("28");
  });
  it("shows the delivery instant at 16:00 in the business timezone regardless of server timezone", () => {
    const previous = process.env.TZ;
    try {
      for (const timezone of ["UTC", "America/Los_Angeles", "Asia/Ho_Chi_Minh"]) {
        process.env.TZ = timezone;
        const result = formatBusinessDateTime("2026-10-07T09:00:00Z");
        expect(result).toContain("16:00");
        expect(result).toContain("7 thg 10, 2026");
      }
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });
  it("removes database quantity padding without rounding away stored precision", () => {
    expect(formatQuantity("1.000000")).toBe("1");
    expect(formatQuantity("1234.567000")).toBe("1.234,567");
    expect(formatQuantity("0.000001")).toBe("0,000001");
  });
});
