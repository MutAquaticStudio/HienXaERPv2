import { describe, expect, it } from "vitest";

import {
  allowedWorkerLogs,
  calculateActualMinutes,
  calculateBillingAmount,
  validateBillingQuantity,
} from "@/modules/service-jobs/workflow";

describe("P11 service job workflow", () => {
  it("calculates actual elapsed time after breaks without changing billable hours", () => {
    expect(
      calculateActualMinutes(
        "2026-09-04T01:00:00Z",
        "2026-09-04T09:30:00Z",
        45,
      ),
    ).toBe(465);
    expect(validateBillingQuantity("HOUR", "8", "8")).toBe(true);
    expect(validateBillingQuantity("HOUR", "7.75", "8")).toBe(false);
  });

  it("enforces fixed-job quantity and computes billing deterministically", () => {
    expect(validateBillingQuantity("FIXED_JOB", "7.75", "1")).toBe(true);
    expect(validateBillingQuantity("FIXED_JOB", "7.75", "2")).toBe(false);
    expect(calculateBillingAmount("8", "850000")).toBe("6800000.00");
  });

  it("offers only lifecycle-valid worker logs", () => {
    expect(allowedWorkerLogs("ASSIGNED")).toEqual(["START"]);
    expect(allowedWorkerLogs("IN_PROGRESS")).toContain("END");
    expect(allowedWorkerLogs("PAUSED")).toContain("BREAK_END");
    expect(allowedWorkerLogs("COMPLETED")).toEqual([]);
  });
});
