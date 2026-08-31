import {
  AccessDeniedError,
  AccountInactiveError,
} from "@/modules/platform/errors";
import type {
  Permission,
  Principal,
  ScopedResource,
} from "@/modules/platform/types";

export function isActive(principal: Principal): boolean {
  return principal.status === "ACTIVE";
}

export function assertActive(principal: Principal): void {
  if (!isActive(principal)) {
    throw new AccountInactiveError(principal.status);
  }
}

export function hasPermission(
  principal: Principal,
  permission: Permission,
): boolean {
  return isActive(principal) && principal.permissions.includes(permission);
}

export function assertPermission(
  principal: Principal,
  permission: Permission,
): void {
  assertActive(principal);
  if (!principal.permissions.includes(permission)) {
    throw new AccessDeniedError();
  }
}

export function canAccessResource(
  principal: Principal,
  resource: ScopedResource,
): boolean {
  if (!isActive(principal)) return false;

  return principal.scopes.some((scope) => {
    switch (scope.kind) {
      case "ALL":
        return true;
      case "BRANCH":
        return Boolean(scope.branchId && scope.branchId === resource.branchId);
      case "WAREHOUSE":
        return Boolean(
          scope.warehouseId && scope.warehouseId === resource.warehouseId,
        );
      case "ASSIGNED_ONLY":
        return resource.assignedUserId === principal.userId;
      case "SELF":
        return resource.ownerUserId === principal.userId;
    }
  });
}

export function assertResourceAccess(
  principal: Principal,
  resource: ScopedResource,
): void {
  assertActive(principal);
  if (!canAccessResource(principal, resource)) {
    throw new AccessDeniedError("Bạn không được xem dữ liệu được giao cho người khác.");
  }
}
