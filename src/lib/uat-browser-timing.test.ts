import { describe, expect, it } from "vitest";
import { dashboardReadiness, percentile, timingVerdict, type TimingSample } from "./uat-browser-timing";

const sample = (durationMs: number, status: TimingSample["status"] = "READY"): TimingSample => ({ metric: "ADMIN_SHELL_BROWSER", durationMs, status, clock: "SAME_DOCUMENT", sequence: 1, action: "navigation-group-toggle" });

describe("UAT browser timing measurement contract", () => {
  it("uses deterministic linear interpolation and leaves raw sample order intact", () => {
    const values = Array.from({ length: 100 }, (_, index) => 100 - index);
    expect(percentile(values, 0.95)).toBeCloseTo(95.05, 10);
    expect(values[0]).toBe(100);
  });
  it("does not discard first/cold, slow or timeout samples", () => {
    expect(percentile([10000, 10, 20, 30], 0.95)).toBeCloseTo(8504.5, 10);
    expect(timingVerdict([sample(10), sample(10000, "TIMEOUT")], 300)).toBe("FAIL");
  });
  it("enforces strict budgets and does not pass empty or error evidence", () => {
    expect(timingVerdict([], 300)).toBe("PENDING");
    expect(timingVerdict([sample(300)], 300)).toBe("FAIL");
    expect(timingVerdict([sample(299.9)], 300)).toBe("PASS");
    expect(timingVerdict([sample(10, "ERROR")], 300)).toBe("FAIL");
  });
  it("rejects invalid clock samples rather than converting them to zero", () => {
    expect(() => percentile([-1], 0.95)).toThrow();
    expect(() => percentile([NaN], 0.95)).toThrow();
    expect(() => percentile([Infinity], 0.95)).toThrow();
  });
  it("requires the current request nonce, not a prior visible dashboard", () => {
    expect(dashboardReadiness("new", { response: "old", filters: "ready", kpi: "ready", content: "ready" })).toBe("PENDING");
  });
  it("does not finish at a loading shell or KPI alone", () => {
    expect(dashboardReadiness("new", { response: "new", filters: null, kpi: "ready", content: null })).toBe("PENDING");
    expect(dashboardReadiness("new", { response: "new", filters: "ready", kpi: "ready", content: null })).toBe("PENDING");
  });
  it("finishes only after all useful requested regions are present", () => {
    expect(dashboardReadiness("new", { response: "new", filters: "ready", kpi: "ready", content: "ready" })).toBe("READY");
  });
  it("records an unavailable requested region as an error, not a fast PASS", () => {
    expect(dashboardReadiness("new", { response: "new", filters: "ready", kpi: "error", content: "ready" })).toBe("ERROR");
  });
});
