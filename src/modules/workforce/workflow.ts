import type { RoleTemplate } from "@/modules/platform/types";
import type { WorkItemStatus } from "@/modules/workforce/types";

const transitions: Record<WorkItemStatus, readonly WorkItemStatus[]> = {
  AVAILABLE: ["CLAIMED", "CANCELLED"],
  CLAIMED: ["IN_PROGRESS", "CLAIM_EXPIRED", "CANCELLED"],
  IN_PROGRESS: ["BLOCKED", "DONE", "HEARTBEAT_MISSED", "CANCELLED"],
  BLOCKED: ["IN_PROGRESS", "DONE", "AVAILABLE", "CLAIMED", "CANCELLED"],
  DONE: ["VERIFIED"],
  VERIFIED: [],
  CLAIM_EXPIRED: ["AVAILABLE"],
  HEARTBEAT_MISSED: ["IN_PROGRESS", "UNRESPONSIVE", "AVAILABLE", "CLAIMED", "CANCELLED"],
  UNRESPONSIVE: ["IN_PROGRESS", "AVAILABLE", "CLAIMED", "CANCELLED"],
  CANCELLED: [],
};

export function canTransitionWorkItem(from: WorkItemStatus, to: WorkItemStatus) {
  return transitions[from].includes(to);
}

export function canClaimAnotherWorkItem(
  role: RoleTemplate,
  counts: { claimed: number; inProgress: number },
) {
  if (role === "DRIVER") {
    return counts.claimed < 1 && counts.inProgress <= 1;
  }
  if (role === "OPERATOR_WORKER") {
    return counts.claimed < 1 && counts.inProgress < 1;
  }
  return counts.claimed < 1 && counts.inProgress < 1;
}

export function isClaimLeaseExpired(input: {
  status: WorkItemStatus;
  claimExpiresAt: string | null;
  now?: Date;
}) {
  return Boolean(
    input.status === "CLAIMED" &&
      input.claimExpiresAt &&
      new Date(input.claimExpiresAt).getTime() <= (input.now ?? new Date()).getTime(),
  );
}

export function nextHeartbeatState(input: {
  current: WorkItemStatus;
  heartbeatDueAt: string | null;
  now?: Date;
  responseSeconds?: number;
  graceSeconds?: number;
}): WorkItemStatus {
  if (!input.heartbeatDueAt || !["IN_PROGRESS", "HEARTBEAT_MISSED"].includes(input.current)) {
    return input.current;
  }
  const elapsed = (input.now ?? new Date()).getTime() - new Date(input.heartbeatDueAt).getTime();
  const response = (input.responseSeconds ?? 60) * 1_000;
  const grace = (input.graceSeconds ?? 120) * 1_000;
  if (elapsed > response + grace) return "UNRESPONSIVE";
  if (elapsed > response) return "HEARTBEAT_MISSED";
  return input.current;
}
