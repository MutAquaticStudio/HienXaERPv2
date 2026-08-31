import { describe, expect, it } from "vitest";

import {
  assertEmployeeTransition,
  canTransitionEmployee,
} from "@/modules/platform/employee-lifecycle";

describe("employee lifecycle", () => {
  it("supports invite, activate, suspend and reactivate", () => {
    expect(canTransitionEmployee("INVITED", "ACTIVE")).toBe(true);
    expect(canTransitionEmployee("ACTIVE", "SUSPENDED")).toBe(true);
    expect(canTransitionEmployee("SUSPENDED", "ACTIVE")).toBe(true);
  });

  it("treats DISABLED as a terminal state", () => {
    expect(canTransitionEmployee("ACTIVE", "DISABLED")).toBe(true);
    expect(canTransitionEmployee("DISABLED", "ACTIVE")).toBe(false);
    expect(() => assertEmployeeTransition("DISABLED", "ACTIVE")).toThrowError(
      /Không thể chuyển tài khoản/i,
    );
  });
});
