export const SERVICE_RATE_TYPES = [
  "HOUR",
  "SHIFT",
  "TRIP",
  "DAY",
  "FIXED_JOB",
] as const;
export type ServiceRateType = (typeof SERVICE_RATE_TYPES)[number];

export const SERVICE_JOB_STATUSES = [
  "SCHEDULED",
  "ASSIGNED",
  "IN_PROGRESS",
  "PAUSED",
  "COMPLETED",
  "APPROVED",
  "CUSTOMER_CONFIRMED",
  "BILLED",
  "CANCELLED",
] as const;
export type ServiceJobStatus = (typeof SERVICE_JOB_STATUSES)[number];

export const SERVICE_LOG_TYPES = [
  "START",
  "BREAK_START",
  "BREAK_END",
  "FUEL",
  "EVIDENCE",
  "INCIDENT",
  "END",
] as const;
export type ServiceLogType = (typeof SERVICE_LOG_TYPES)[number];

export const SERVICE_COST_CATEGORIES = [
  "FUEL",
  "MACHINE",
  "DIRECT_LABOR",
  "OTHER",
] as const;
export type ServiceCostCategory = (typeof SERVICE_COST_CATEGORIES)[number];

export interface ServiceJobSummary {
  id: string;
  jobNumber: string;
  customerId: string;
  customerSiteId: string;
  serviceTypeId: string;
  machineId: string;
  customerName: string;
  siteName: string;
  siteAddress: string;
  serviceTypeName: string;
  machineName: string;
  status: ServiceJobStatus;
  scheduledStartAt: string;
  scheduledEndAt: string;
  startedAt: string | null;
  endedAt: string | null;
  breakMinutes: number;
  actualMinutes: number;
  actualHours: string;
  approvedBillableHours: string | null;
  approvedBillableQuantity: string | null;
  rateType: ServiceRateType;
  unitRate: string;
  currency: string;
  approvalNote: string | null;
  notes: string | null;
  operatorUserId: string | null;
  operatorName: string | null;
  actualCost: string;
  recognizedRevenue: string;
  contributionProfit: string;
  isAssignedOperator: boolean;
}

export interface ServiceWorkLog {
  id: string;
  serviceJobId: string;
  logType: ServiceLogType;
  occurredAt: string;
  note: string | null;
  fuelLiters: string | null;
  fuelUnitCost: string | null;
  evidenceId: string | null;
}

export interface ServiceTypeOption {
  id: string;
  code: string;
  name: string;
  defaultRateType: ServiceRateType;
  defaultUnitRate: string | null;
  standardShiftHours: string;
}

export interface ServiceMachineOption {
  id: string;
  code: string;
  name: string;
  machineType: string;
  serialNumber: string | null;
  status: "AVAILABLE" | "ASSIGNED" | "MAINTENANCE" | "INACTIVE";
  meterHours: string;
}

export interface ServiceCustomerOption {
  id: string;
  code: string;
  name: string;
}

export interface ServiceSiteOption {
  id: string;
  customerId: string;
  name: string;
  address: string;
}

export interface ServiceOperatorOption {
  userId: string;
  displayName: string;
  employeeCode: string;
}

export interface ServiceSimpleOption {
  id: string;
  label: string;
}

export interface ServiceJobSnapshot {
  jobs: ServiceJobSummary[];
  logs: ServiceWorkLog[];
  serviceTypes: ServiceTypeOption[];
  machines: ServiceMachineOption[];
  customers: ServiceCustomerOption[];
  sites: ServiceSiteOption[];
  operators: ServiceOperatorOption[];
  warehouses: ServiceSimpleOption[];
  evidence: ServiceSimpleOption[];
}

export type ServiceJobCommandKind =
  | "service.type.create"
  | "service.machine.create"
  | "service.job.create"
  | "service.job.assign"
  | "service.job.log"
  | "service.job.approve"
  | "service.job.cost"
  | "service.job.confirm"
  | "service.job.cancel";
