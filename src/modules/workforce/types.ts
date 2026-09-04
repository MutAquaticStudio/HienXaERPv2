import type { RoleTemplate } from "@/modules/platform/types";

export const WORK_ITEM_STATUSES = [
  "AVAILABLE",
  "CLAIMED",
  "IN_PROGRESS",
  "BLOCKED",
  "DONE",
  "VERIFIED",
  "CLAIM_EXPIRED",
  "HEARTBEAT_MISSED",
  "UNRESPONSIVE",
  "CANCELLED",
] as const;

export type WorkItemStatus = (typeof WORK_ITEM_STATUSES)[number];
export type WorkAssignmentMode = "DIRECT" | "POOL_CLAIM";
export type WorkSupervisorAction =
  | "KEEP_ASSIGNMENT"
  | "RECALL"
  | "REASSIGN"
  | "CANCEL";

export interface WorkItemCard {
  id: string;
  workNumber: string;
  title: string;
  description: string | null;
  workType: "DELIVERY" | "OPERATION" | "GENERAL";
  requiredRole: RoleTemplate | null;
  assignmentMode: WorkAssignmentMode;
  status: WorkItemStatus;
  priority: number;
  assignedUserId: string | null;
  claimedBy: string | null;
  workerName: string | null;
  claimedAt: string | null;
  claimExpiresAt: string | null;
  startedAt: string | null;
  heartbeatDueAt: string | null;
  lastHeartbeatAt: string | null;
  completedAt: string | null;
  verifiedAt: string | null;
  blockedReason: string | null;
  externalEffectStarted: boolean;
  dueAt: string | null;
  sourceType: string | null;
  sourceId: string | null;
  deliveryNumber: string | null;
  customerName: string | null;
  pickupAddress: string | null;
  dropAddress: string | null;
  sourceStatus: string | null;
  isEligible: boolean;
}

export interface WorkNotification {
  id: string;
  workItemId: string;
  notificationType: string;
  title: string;
  message: string;
  actionPath: string;
  readAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  workNumber: string;
  workStatus: WorkItemStatus;
}

export interface WorkforceWorkerOption {
  userId: string;
  displayName: string;
  employeeCode: string;
  roles: RoleTemplate[];
}

export interface WorkforceSnapshot {
  assigned: WorkItemCard[];
  pool: WorkItemCard[];
  attention: WorkItemCard[];
  completed: WorkItemCard[];
  notifications: WorkNotification[];
  workers: WorkforceWorkerOption[];
}

export type WorkCommandKind =
  | "work.claim"
  | "work.start"
  | "work.heartbeat"
  | "work.block"
  | "work.complete"
  | "work.verify"
  | "work.supervise"
  | "work.sweep";
