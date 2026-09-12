import { AppError } from "@/lib/core/errors";

export type InternalAssignment = Readonly<{
  branchId: string;
  branchName: string;
  roleId: string;
  roleName: string;
  permissions: readonly string[];
  active: boolean;
}>;

export type InternalAccessContext = Readonly<{
  kind: "internal";
  authUserId: string;
  employeeId: string;
  employeeName: string;
  branchId: string;
  branchName: string;
  roleId: string;
  roleName: string;
  permissions: ReadonlySet<string>;
}>;

export type CustomerMembership = Readonly<{
  customerId: string;
  customerName: string;
  role: "OWNER" | "FINANCE_CONTACT" | "RECEIVER";
  active: boolean;
}>;

export function selectInternalContext(input: {
  authUserId: string;
  employeeId: string;
  employeeName: string;
  employeeActive: boolean;
  assignments: readonly InternalAssignment[];
  requestedBranchId?: string;
}): InternalAccessContext {
  if (!input.employeeActive) throw forbidden("Tài khoản nhân viên đã bị thu hồi.");
  const activeAssignments = input.assignments.filter((assignment) => assignment.active);
  const selected = input.requestedBranchId
    ? activeAssignments.find((assignment) => assignment.branchId === input.requestedBranchId)
    : activeAssignments.length === 1
      ? activeAssignments[0]
      : undefined;

  if (!selected) {
    throw new AppError({
      code: activeAssignments.length > 1 ? "CONFLICT" : "FORBIDDEN",
      message: activeAssignments.length > 1 ? "Cần chọn chi nhánh đang làm việc." : "Không có quyền tại chi nhánh này.",
      status: activeAssignments.length > 1 ? 409 : 403,
    });
  }

  return {
    kind: "internal",
    authUserId: input.authUserId,
    employeeId: input.employeeId,
    employeeName: input.employeeName,
    branchId: selected.branchId,
    branchName: selected.branchName,
    roleId: selected.roleId,
    roleName: selected.roleName,
    permissions: new Set(selected.permissions),
  };
}

export function requirePermission(context: InternalAccessContext, permission: string): void {
  if (!context.permissions.has(permission)) throw forbidden("Bạn không có quyền thực hiện thao tác này.");
}

export function selectCustomerMembership(
  memberships: readonly CustomerMembership[],
  requestedCustomerId: string,
  allowedRoles?: readonly CustomerMembership["role"][],
): CustomerMembership {
  const membership = memberships.find((item) => item.active && item.customerId === requestedCustomerId);
  if (!membership || (allowedRoles && !allowedRoles.includes(membership.role))) {
    throw forbidden("Bạn không có quyền xem dữ liệu khách hàng này.");
  }
  return membership;
}

function forbidden(message: string) {
  return new AppError({ code: "FORBIDDEN", message, status: 403 });
}
