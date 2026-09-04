import "server-only";

import type { TransactionSql } from "postgres";
import type { createClient } from "@/lib/supabase/server";

import type { WorkCommandInput } from "@/modules/workforce/commands";
import { assertPermission } from "@/modules/platform/authorization";
import { PlatformError } from "@/modules/platform/errors";
import type { Principal, RoleTemplate } from "@/modules/platform/types";
import type {
  WorkforceSnapshot,
  WorkforceWorkerOption,
  WorkItemCard,
  WorkItemStatus,
  WorkNotification,
} from "@/modules/workforce/types";
import { orderWorkerWorkItems } from "@/modules/workforce/workflow";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

interface WorkItemRow {
  id: string;
  work_number: string;
  title: string;
  description: string | null;
  work_type: WorkItemCard["workType"];
  required_role: RoleTemplate | null;
  assignment_mode: WorkItemCard["assignmentMode"];
  status: WorkItemStatus;
  priority: number;
  assigned_user_id: string | null;
  claimed_by: string | null;
  worker_name: string | null;
  claimed_at: string | null;
  claim_expires_at: string | null;
  started_at: string | null;
  heartbeat_due_at: string | null;
  last_heartbeat_at: string | null;
  completed_at: string | null;
  verified_at: string | null;
  blocked_reason: string | null;
  external_effect_started: boolean;
  due_at: string | null;
  source_type: string | null;
  source_id: string | null;
  delivery_number: string | null;
  customer_name: string | null;
  pickup_address: string | null;
  drop_address: string | null;
  source_status: string | null;
  is_eligible: boolean;
}

interface NotificationRow {
  id: string;
  work_item_id: string;
  notification_type: string;
  title: string;
  message: string;
  action_path: string;
  read_at: string | null;
  resolved_at: string | null;
  created_at: string;
  work_number: string;
  work_status: WorkItemStatus;
}

function mapItem(row: WorkItemRow): WorkItemCard {
  return {
    id: row.id,
    workNumber: row.work_number,
    title: row.title,
    description: row.description,
    workType: row.work_type,
    requiredRole: row.required_role,
    assignmentMode: row.assignment_mode,
    status: row.status,
    priority: Number(row.priority),
    assignedUserId: row.assigned_user_id,
    claimedBy: row.claimed_by,
    workerName: row.worker_name,
    claimedAt: row.claimed_at,
    claimExpiresAt: row.claim_expires_at,
    startedAt: row.started_at,
    heartbeatDueAt: row.heartbeat_due_at,
    lastHeartbeatAt: row.last_heartbeat_at,
    completedAt: row.completed_at,
    verifiedAt: row.verified_at,
    blockedReason: row.blocked_reason,
    externalEffectStarted: row.external_effect_started,
    dueAt: row.due_at,
    sourceType: row.source_type,
    sourceId: row.source_id,
    deliveryNumber: row.delivery_number,
    customerName: row.customer_name,
    pickupAddress: row.pickup_address,
    dropAddress: row.drop_address,
    sourceStatus: row.source_status,
    isEligible: row.is_eligible,
  };
}

function mapNotification(row: NotificationRow): WorkNotification {
  return {
    id: row.id,
    workItemId: row.work_item_id,
    notificationType: row.notification_type,
    title: row.title,
    message: row.message,
    actionPath: row.action_path,
    readAt: row.read_at,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    workNumber: row.work_number,
    workStatus: row.work_status,
  };
}

function vietnamDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: "year" | "month" | "day") =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${value("year")}-${value("month")}-${value("day")}`;
}

export async function readWorkforceSnapshotFromSupabase(
  supabase: SupabaseServerClient,
  principal: Principal,
  view: "worker" | "office",
): Promise<WorkforceSnapshot> {
  if (view === "worker") assertPermission(principal, "work_item.read_assigned");
  else assertPermission(principal, "work_item.verify");

  const itemQuery = supabase
    .from("work_item_operational_view")
    .select("*")
    .order("priority", { ascending: true })
    .order("due_at", { ascending: true })
    .limit(300);
  const [itemResult, notificationResult, workerResult] = await Promise.all([
    itemQuery,
    principal.permissions.includes("work_notification.read")
      ? supabase
          .from("work_notification_view")
          .select("*")
          .is("resolved_at", null)
          .order("created_at", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [], error: null }),
    view === "office" && principal.permissions.includes("work_item.supervise")
      ? supabase.from("workforce_worker_view").select("*").order("display_name")
      : Promise.resolve({ data: [], error: null }),
  ]);
  const firstError = [itemResult.error, notificationResult.error, workerResult.error].find(Boolean);
  if (firstError) {
    throw new PlatformError(
      "Chưa đọc được dữ liệu công việc. Hãy thử tải lại.",
      "WORKFORCE_READ_FAILED",
      503,
    );
  }
  const items = ((itemResult.data ?? []) as WorkItemRow[]).map(mapItem);
  const own = items.filter((item) => item.claimedBy === principal.userId);
  const officeActive = items.filter((item) =>
    ["CLAIMED", "IN_PROGRESS", "BLOCKED", "HEARTBEAT_MISSED", "UNRESPONSIVE"].includes(item.status),
  );
  const today = vietnamDateKey(new Date());
  const completedToday = own.filter(
    (item) =>
      ["DONE", "VERIFIED"].includes(item.status) &&
      item.completedAt?.startsWith(today),
  );
  const activeOwn = own.filter((item) => !["DONE", "VERIFIED"].includes(item.status));
  const workerPool = items
    .filter((item) => item.status === "AVAILABLE" && item.isEligible)
    .map((item) => ({
      ...item,
      customerName: null,
      pickupAddress: null,
      dropAddress: null,
    }));
  return {
    assigned: view === "office" ? officeActive : orderWorkerWorkItems([...activeOwn, ...completedToday]),
    pool: workerPool,
    attention: items.filter((item) => ["BLOCKED", "HEARTBEAT_MISSED", "UNRESPONSIVE", "DONE"].includes(item.status)),
    completed: (view === "office" ? items : own).filter((item) => ["DONE", "VERIFIED"].includes(item.status)),
    notifications: ((notificationResult.data ?? []) as NotificationRow[]).map(mapNotification),
    workers: ((workerResult.data ?? []) as Array<{
      user_id: string;
      display_name: string;
      employee_code: string;
      roles: RoleTemplate[];
    }>).map((row): WorkforceWorkerOption => ({
      userId: row.user_id,
      displayName: row.display_name,
      employeeCode: row.employee_code,
      roles: row.roles,
    })),
  };
}

export async function executeWorkCommand(
  sql: TransactionSql,
  principal: Principal,
  idempotencyKey: string,
  input: WorkCommandInput,
) {
  switch (input.kind) {
    case "work.claim":
      await sql`select app_private.claim_work_item(${input.workItemId}, ${principal.userId}, ${idempotencyKey})`;
      break;
    case "work.start":
      await sql`select app_private.start_work_item(${input.workItemId}, ${principal.userId})`;
      break;
    case "work.heartbeat":
      await sql`select app_private.record_work_heartbeat(${input.workItemId}, ${principal.userId}, ${input.progressNote})`;
      break;
    case "work.block":
      await sql`select app_private.block_work_item(${input.workItemId}, ${principal.userId}, ${input.reason})`;
      break;
    case "work.complete":
      await sql`select app_private.complete_work_item(${input.workItemId}, ${principal.userId})`;
      break;
    case "work.verify":
      await sql`select app_private.verify_work_item(${input.workItemId}, ${input.reason}, ${principal.userId})`;
      break;
    case "work.supervise":
      await sql`select app_private.resolve_work_item(
        ${input.workItemId}, ${input.action}::public.work_supervisor_action,
        ${input.reassignUserId}, ${input.reason}, ${principal.userId}
      )`;
      break;
    case "work.sweep":
      await sql`select app_private.sweep_work_item_timeouts(${principal.userId})`;
      break;
  }
  return { id: "workItemId" in input ? input.workItemId : principal.userId, kind: input.kind };
}
