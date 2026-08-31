import { PlatformError } from "@/modules/platform/errors";
import type { EmployeeStatus } from "@/modules/platform/types";

const allowedTransitions: Record<EmployeeStatus, readonly EmployeeStatus[]> = {
  INVITED: ["ACTIVE", "DISABLED"],
  ACTIVE: ["SUSPENDED", "DISABLED"],
  SUSPENDED: ["ACTIVE", "DISABLED"],
  DISABLED: [],
};

export function canTransitionEmployee(
  current: EmployeeStatus,
  next: EmployeeStatus,
): boolean {
  return allowedTransitions[current].includes(next);
}

export function assertEmployeeTransition(
  current: EmployeeStatus,
  next: EmployeeStatus,
): void {
  if (!canTransitionEmployee(current, next)) {
    throw new PlatformError(
      `Không thể chuyển tài khoản từ ${current} sang ${next}.`,
      "INVALID_EMPLOYEE_TRANSITION",
      409,
    );
  }
}
