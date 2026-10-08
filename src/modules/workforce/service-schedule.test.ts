import { describe, expect, it } from "vitest";
import { formatServiceSchedule } from "./service-schedule";
describe("service schedule uses the canonical Vietnam timezone", () => {
  it("renders 01:00 UTC as 08:00 Vietnam, matching the Worker portal", () => {
    expect(formatServiceSchedule("2026-10-09T01:00:00+00:00")).toContain("08:00");
  });
  it("keeps the correct local calendar date across the UTC midnight boundary", () => {
    const value = formatServiceSchedule("2026-10-08T18:00:00Z");
    expect(value).toContain("01:00"); expect(value).toContain("9 thg 10, 2026");
  });
  it("renders equivalent UTC and offset inputs equally without changing the source", () => {
    const original = "2026-10-09T08:00:00+07:00";
    expect(formatServiceSchedule(original)).toBe(formatServiceSchedule("2026-10-09T01:00:00Z"));
    expect(original).toBe("2026-10-09T08:00:00+07:00");
  });
});
