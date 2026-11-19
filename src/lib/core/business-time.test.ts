import { describe, expect, it } from "vitest";
import { businessDay, businessDaysBetween, formatBusinessDate, formatBusinessDateTime, isBusinessDay, parseBusinessDateTime, shiftBusinessDay } from "./business-time";
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
    expect(formatBusinessDate("2026-09-27T20:15:00Z")).toBe("28/09/2026");
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
        expect(result).toBe("07/10/2026 16:00");
      }
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });
  it("formats date-only values and missing dates without changing the input", () => {
    const source = "2026-01-02";
    expect(formatBusinessDate(source)).toBe("02/01/2026");
    expect(source).toBe("2026-01-02");
    expect(formatBusinessDate("invalid")).toBe("Chưa có dữ liệu");
    expect(formatBusinessDateTime("invalid")).toBe("Chưa có dữ liệu");
    expect(formatBusinessDateTime("2026-01-01T17:00:00Z")).toBe("02/01/2026 00:00");
  });
  it("tells the Vietnam business day of an instant, whatever the server clock says", () => {
    expect(businessDay("2026-11-16T17:30:00Z")).toBe("2026-11-17");
    expect(businessDay("2026-11-17T16:59:00Z")).toBe("2026-11-17");
    expect(businessDay("invalid")).toBe("");
  });
  it("does calendar arithmetic on business days", () => {
    expect(shiftBusinessDay("2026-11-17", -1)).toBe("2026-11-16");
    expect(shiftBusinessDay("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftBusinessDay("2024-03-01", -1)).toBe("2024-02-29");
    expect(shiftBusinessDay("2026-12-31", 1)).toBe("2027-01-01");
    expect(businessDaysBetween("2026-11-11", "2026-11-17")).toBe(6);
    expect(isBusinessDay("2026-02-28")).toBe(true);
    expect(isBusinessDay("2026-02-30")).toBe(false);
    expect(isBusinessDay("17/11/2026")).toBe(false);
  });
  it("removes database quantity padding without rounding away stored precision", () => {
    expect(formatQuantity("1.000000")).toBe("1");
    expect(formatQuantity("1234.567000")).toBe("1.234,567");
    expect(formatQuantity("0.000001")).toBe("0,000001");
  });
});
