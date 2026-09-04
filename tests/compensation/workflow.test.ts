import { describe, expect, it } from "vitest";

import {
  calculateAllocationAmount,
  isVariableDirectLabor,
  resolvePlanCandidate,
  validateAllocationDrafts,
} from "@/modules/compensation/workflow";

describe("P12 compensation workflow", () => {
  it("resolves employee override before role plan and company default", () => {
    const result = resolvePlanCandidate(
      [
        {
          id: "company",
          scopeType: "COMPANY",
          roleCode: null,
          employeeUserId: null,
          effectiveFrom: "2026-01-01",
          versionNumber: 1,
        },
        {
          id: "role",
          scopeType: "ROLE",
          roleCode: "DRIVER",
          employeeUserId: null,
          effectiveFrom: "2026-01-01",
          versionNumber: 1,
        },
        {
          id: "employee",
          scopeType: "EMPLOYEE",
          roleCode: null,
          employeeUserId: "worker-1",
          effectiveFrom: "2026-01-01",
          versionNumber: 1,
        },
      ],
      "worker-1",
      ["DRIVER"],
    );
    expect(result?.id).toBe("employee");
  });

  it("requires multi-worker shares to reconcile to 100 percent", () => {
    expect(
      validateAllocationDrafts(
        [
          { workerUserId: "worker-1", sharePercent: 60 },
          { workerUserId: "worker-2", sharePercent: 40 },
        ],
        1,
      ),
    ).toBe(true);
    expect(
      validateAllocationDrafts(
        [
          { workerUserId: "worker-1", sharePercent: 60 },
          { workerUserId: "worker-2", sharePercent: 30 },
        ],
        1,
      ),
    ).toBe(false);
  });

  it("also accepts approved units that reconcile to the verified basis", () => {
    expect(
      validateAllocationDrafts(
        [
          { workerUserId: "worker-1", approvedUnits: 6 },
          { workerUserId: "worker-2", approvedUnits: 2 },
        ],
        8,
      ),
    ).toBe(true);
  });

  it("calculates unit and gross-profit earnings without classifying salary as direct labor", () => {
    expect(
      calculateAllocationAmount({
        ruleType: "PER_TRIP",
        rate: 350_000,
        approvedUnits: 0.6,
        sharePercent: 60,
      }),
    ).toBe("210000.00");
    expect(
      calculateAllocationAmount({
        ruleType: "PERCENT_GROSS_PROFIT",
        rate: 5,
        approvedUnits: 1,
        sharePercent: 40,
        basisAmount: 10_000_000,
      }),
    ).toBe("200000.00");
    expect(isVariableDirectLabor("PER_TRIP")).toBe(true);
    expect(isVariableDirectLabor("FIXED_MONTHLY")).toBe(false);
  });
});
