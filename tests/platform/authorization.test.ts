import { describe, expect, it } from "vitest";

import {
  assertPermission,
  canAccessResource,
  hasPermission,
} from "@/modules/platform/authorization";
import {
  SYNTHETIC_OFFICE_PRINCIPAL,
  SYNTHETIC_WORKER_PRINCIPAL,
} from "@/modules/platform/synthetic-principals";

describe("P1 authorization contract", () => {
  it("does not grant Finance or Margin access to a driver", () => {
    expect(hasPermission(SYNTHETIC_WORKER_PRINCIPAL, "finance.read")).toBe(
      false,
    );
    expect(hasPermission(SYNTHETIC_WORKER_PRINCIPAL, "margin.read")).toBe(
      false,
    );
    expect(() =>
      assertPermission(SYNTHETIC_WORKER_PRINCIPAL, "finance.read"),
    ).toThrowError(/không có quyền/i);
  });

  it("allows ASSIGNED_ONLY access only to the current worker", () => {
    expect(
      canAccessResource(SYNTHETIC_WORKER_PRINCIPAL, {
        assignedUserId: SYNTHETIC_WORKER_PRINCIPAL.userId,
      }),
    ).toBe(true);
    expect(
      canAccessResource(SYNTHETIC_WORKER_PRINCIPAL, {
        assignedUserId: "another-worker",
      }),
    ).toBe(false);
  });

  it("denies every protected permission when the employee is disabled", () => {
    const disabled = {
      ...SYNTHETIC_OFFICE_PRINCIPAL,
      status: "DISABLED" as const,
    };
    expect(hasPermission(disabled, "finance.read")).toBe(false);
    expect(() => assertPermission(disabled, "finance.read")).toThrowError(
      /vô hiệu hóa/i,
    );
  });
});
