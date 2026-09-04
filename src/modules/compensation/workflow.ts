import type {
  CompensationPlanScope,
  CompensationRuleType,
} from "@/modules/compensation/types";

export interface AllocationDraft {
  workerUserId: string;
  sharePercent?: number;
  approvedUnits?: number;
}

export interface PlanCandidate {
  id: string;
  scopeType: CompensationPlanScope;
  roleCode: string | null;
  employeeUserId: string | null;
  effectiveFrom: string;
  versionNumber: number;
}

const scopeRank: Record<CompensationPlanScope, number> = {
  EMPLOYEE: 0,
  ROLE: 1,
  COMPANY: 2,
};

export function resolvePlanCandidate(
  candidates: PlanCandidate[],
  employeeUserId: string,
  roles: string[],
): PlanCandidate | null {
  return (
    candidates
      .filter(
        (candidate) =>
          candidate.scopeType === "COMPANY" ||
          (candidate.scopeType === "EMPLOYEE" &&
            candidate.employeeUserId === employeeUserId) ||
          (candidate.scopeType === "ROLE" &&
            Boolean(candidate.roleCode && roles.includes(candidate.roleCode))),
      )
      .sort(
        (left, right) =>
          scopeRank[left.scopeType] - scopeRank[right.scopeType] ||
          right.effectiveFrom.localeCompare(left.effectiveFrom) ||
          right.versionNumber - left.versionNumber ||
          left.id.localeCompare(right.id),
      )[0] ?? null
  );
}

export function validateAllocationDrafts(
  allocations: AllocationDraft[],
  basisQuantity: number,
): boolean {
  if (!allocations.length || basisQuantity <= 0) return false;
  if (
    new Set(allocations.map((item) => item.workerUserId)).size !==
    allocations.length
  )
    return false;
  const percentMode = allocations.every(
    (item) =>
      item.sharePercent !== undefined && item.approvedUnits === undefined,
  );
  const unitMode = allocations.every(
    (item) =>
      item.approvedUnits !== undefined && item.sharePercent === undefined,
  );
  if (percentMode) {
    return (
      allocations.every((item) => (item.sharePercent ?? 0) > 0) &&
      Math.abs(
        allocations.reduce(
          (total, item) => total + (item.sharePercent ?? 0),
          0,
        ) - 100,
      ) < 0.0001
    );
  }
  if (unitMode) {
    return (
      allocations.every((item) => (item.approvedUnits ?? 0) > 0) &&
      Math.abs(
        allocations.reduce(
          (total, item) => total + (item.approvedUnits ?? 0),
          0,
        ) - basisQuantity,
      ) < 0.0001
    );
  }
  return false;
}

export function calculateAllocationAmount(input: {
  ruleType: CompensationRuleType;
  rate: number;
  approvedUnits: number;
  sharePercent: number;
  basisAmount?: number;
}): string {
  const raw =
    input.ruleType === "PERCENT_GROSS_PROFIT"
      ? ((input.basisAmount ?? 0) * input.rate * input.sharePercent) / 10_000
      : input.rate * input.approvedUnits;
  return (Math.round((raw + Number.EPSILON) * 100) / 100).toFixed(2);
}

export function isVariableDirectLabor(ruleType: CompensationRuleType): boolean {
  return !["FIXED_MONTHLY", "BONUS", "ADJUSTMENT"].includes(ruleType);
}
