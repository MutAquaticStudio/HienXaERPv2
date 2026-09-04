import type { RoleTemplate } from "@/modules/platform/types";

export const COMPENSATION_RULE_TYPES = [
  "FIXED_MONTHLY",
  "PER_JOB",
  "PER_TRIP",
  "PER_HOUR",
  "PER_SHIFT",
  "PER_DAY",
  "PER_TON",
  "PER_M3",
  "PER_BAG",
  "PER_UNIT",
  "PERCENT_GROSS_PROFIT",
  "BONUS",
  "ADJUSTMENT",
] as const;

export type CompensationRuleType = (typeof COMPENSATION_RULE_TYPES)[number];
export type CompensationPlanScope = "COMPANY" | "ROLE" | "EMPLOYEE";
export type EarningEventStatus = "PENDING_APPROVAL" | "APPROVED" | "REVERSED";
export type PayrollPeriodStatus = "OPEN" | "CLOSED";

export interface CompensationWorkerOption {
  userId: string;
  displayName: string;
  employeeCode: string;
  roles: RoleTemplate[];
}

export interface CompensationProfileSummary {
  employeeUserId: string;
  displayName: string;
  employeeCode: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
}

export interface CompensationPlanSummary {
  id: string;
  planCode: string;
  name: string;
  versionNumber: number;
  scopeType: CompensationPlanScope;
  roleCode: RoleTemplate | null;
  employeeUserId: string | null;
  employeeName: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  currency: string;
  ruleCount: number;
}

export interface CompensationRuleSummary {
  id: string;
  planVersionId: string;
  planLabel: string;
  ruleType: CompensationRuleType;
  rate: string;
  workType: string | null;
  sourceType: string | null;
  description: string;
}

export interface VerifiedWorkOption {
  id: string;
  workNumber: string;
  title: string;
  workType: string;
  sourceType: string;
  sourceId: string;
  workerUserId: string;
  workerName: string;
  verifiedAt: string;
}

export interface EarningAllocationSummary {
  id: string;
  workerUserId: string;
  workerName: string;
  employeeCode: string;
  planLabel: string;
  ruleType: CompensationRuleType;
  rateSnapshot: string;
  unitsSnapshot: string;
  sharePercent: string;
  baseAmount: string;
  adjustmentAmount: string;
  netAmount: string;
}

export interface EarningEventSummary {
  id: string;
  eventNumber: string;
  sourceType: "WORK_VERIFICATION" | "PAYROLL_PERIOD" | "MANUAL_BONUS";
  sourceNumber: string;
  description: string;
  status: EarningEventStatus;
  earnedOn: string;
  currency: string;
  basisQuantity: string;
  basisLabel: string;
  totalAmount: string;
  allocations: EarningAllocationSummary[];
  approvedAt: string | null;
}

export interface PayrollLineSummary {
  id: string;
  employeeUserId: string;
  employeeName: string;
  employeeCode: string;
  baseAmount: string;
  adjustmentAmount: string;
  netAmount: string;
  paidAmount: string;
  paymentStatus: "UNPAID" | "PARTIALLY_PAID" | "PAID";
}

export interface PayrollPeriodSummary {
  id: string;
  periodCode: string;
  periodStart: string;
  periodEnd: string;
  currency: string;
  status: PayrollPeriodStatus;
  totalEntitlement: string;
  totalPaid: string;
  lineCount: number;
  lines: PayrollLineSummary[];
}

export interface CompensationPaymentOption {
  id: string;
  number: string;
  amount: string;
  currency: string;
  paymentDate: string;
  availableAmount: string;
}

export interface CompensationSnapshot {
  profiles: CompensationProfileSummary[];
  plans: CompensationPlanSummary[];
  rules: CompensationRuleSummary[];
  verifiedWork: VerifiedWorkOption[];
  events: EarningEventSummary[];
  periods: PayrollPeriodSummary[];
  workers: CompensationWorkerOption[];
  payments: CompensationPaymentOption[];
}

export interface MyEarningSummary {
  allocationId: string;
  eventNumber: string;
  sourceNumber: string;
  description: string;
  status: EarningEventStatus;
  earnedOn: string;
  ruleType: CompensationRuleType;
  rateSnapshot: string;
  unitsSnapshot: string;
  currency: string;
  baseAmount: string;
  adjustmentAmount: string;
  netAmount: string;
  paidAmount: string;
}

export interface MyEarningsSnapshot {
  earnings: MyEarningSummary[];
  verifiedJobs: number;
  approvedAmount: string;
  pendingAmount: string;
  paidAmount: string;
  currency: string;
}

export type CompensationCommandKind =
  | "compensation.profile.create"
  | "compensation.plan.create"
  | "compensation.rule.create"
  | "earning.create_from_work"
  | "earning.bonus"
  | "earning.approve"
  | "earning.adjust"
  | "earning.reverse"
  | "payroll.period.create"
  | "payroll.monthly.generate"
  | "payroll.close"
  | "payroll.payment.link";
