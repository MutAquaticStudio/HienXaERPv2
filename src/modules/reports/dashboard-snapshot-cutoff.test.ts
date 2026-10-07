import { describe, expect, it } from "vitest";
import { dashboardSnapshotCutoff } from "./dashboard-snapshot-cutoff";
import { formatBusinessDateTime } from "@/lib/core/business-time";

describe("dashboard debt snapshot effective cutoff", () => {
  const now = "2026-10-07T16:30:00.000Z";
  it("clamps a future period end to the same server-now used as knowledge cutoff", () => {
    expect(dashboardSnapshotCutoff("2026-11-01", now)).toBe(now);
    expect(formatBusinessDateTime(dashboardSnapshotCutoff("2026-11-01", now))).toContain("23:30");
  });
  it("keeps a past business-date cutoff at Vietnam midnight", () => {
    expect(dashboardSnapshotCutoff("2026-10-07", now)).toBe("2026-10-06T17:00:00.000Z");
  });
  it("defaults to current instant, not UTC midnight of a different business day", () => {
    const afterMidnight = "2026-10-07T17:15:00.000Z";
    expect(dashboardSnapshotCutoff(undefined, afterMidnight)).toBe(afterMidnight);
    expect(formatBusinessDateTime(dashboardSnapshotCutoff(undefined, afterMidnight))).toContain("00:15");
    expect(formatBusinessDateTime(dashboardSnapshotCutoff(undefined, afterMidnight))).toContain("8 thg 10");
  });
  it.each(["2026-02-30", "2026-13-01", "bad-date"])("rejects invalid date without silently reading another period: %s", (date) => {
    expect(() => dashboardSnapshotCutoff(date, now)).toThrow("invalid_snapshot_business_date");
  });
});
