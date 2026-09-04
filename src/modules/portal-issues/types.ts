export const PORTAL_ISSUE_SOURCE_TYPES = [
  "WORK_ITEM",
  "DELIVERY",
  "SERVICE_JOB",
] as const;

export type PortalIssueSourceType =
  (typeof PORTAL_ISSUE_SOURCE_TYPES)[number];

export const PORTAL_ISSUE_CATEGORIES = [
  "CUSTOMER_UNREACHABLE",
  "WRONG_ADDRESS",
  "VEHICLE_OR_MACHINE_FAILURE",
  "INSUFFICIENT_GOODS",
  "CUSTOMER_PARTIAL_REFUSAL",
  "OTHER",
] as const;

export type PortalIssueCategory = (typeof PORTAL_ISSUE_CATEGORIES)[number];

export interface PortalIssueCommandInput {
  kind: "portal.issue.report";
  sourceType: PortalIssueSourceType;
  sourceId: string;
  category: PortalIssueCategory;
  description: string;
}
