import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/core/errors";
import { requirePermission, selectCustomerMembership, selectInternalContext } from "./policy";

const assignment = {
  branchId: "branch-a",
  branchName: "Chi nhánh A",
  roleId: "sales",
  roleName: "Bán hàng",
  permissions: ["orders.read"],
  active: true,
} as const;

describe("access policy", () => {
  it("resolves one active role for the requested branch", () => {
    const context = selectInternalContext({ authUserId: "auth-1", employeeId: "emp-1", employeeName: "An", employeeActive: true, assignments: [assignment], requestedBranchId: "branch-a" });
    expect(context.roleId).toBe("sales");
    expect(context.branches).toEqual([{ id: "branch-a", name: "Chi nhánh A" }]);
    expect(() => requirePermission(context, "orders.read")).not.toThrow();
  });

  it("lists every active branch for the quick switch, but not a revoked one", () => {
    const other = { ...assignment, branchId: "branch-b", branchName: "Chi nhánh B" };
    const revoked = { ...assignment, branchId: "branch-c", branchName: "Chi nhánh C", active: false };
    const context = selectInternalContext({ authUserId: "auth-1", employeeId: "emp-1", employeeName: "An", employeeActive: true, assignments: [other, assignment, revoked], requestedBranchId: "branch-b" });
    expect(context.branchId).toBe("branch-b");
    expect(context.branches).toEqual([{ id: "branch-a", name: "Chi nhánh A" }, { id: "branch-b", name: "Chi nhánh B" }]);
  });

  it("denies cross-branch access and missing permission", () => {
    expect(() => selectInternalContext({ authUserId: "auth-1", employeeId: "emp-1", employeeName: "An", employeeActive: true, assignments: [assignment], requestedBranchId: "branch-b" })).toThrowError(AppError);
    const context = selectInternalContext({ authUserId: "auth-1", employeeId: "emp-1", employeeName: "An", employeeActive: true, assignments: [assignment] });
    expect(() => requirePermission(context, "finance.ar.read")).toThrowError(AppError);
  });

  it("separates receiver and finance customer scopes", () => {
    const memberships = [{ customerId: "customer-a", customerName: "A", role: "RECEIVER" as const, active: true }];
    expect(selectCustomerMembership(memberships, "customer-a", ["RECEIVER"]).role).toBe("RECEIVER");
    expect(() => selectCustomerMembership(memberships, "customer-a", ["FINANCE_CONTACT"])).toThrowError(AppError);
    expect(() => selectCustomerMembership(memberships, "customer-b")).toThrowError(AppError);
  });
});
