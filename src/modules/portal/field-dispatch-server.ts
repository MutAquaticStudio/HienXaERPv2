import "server-only";

import { resolveInternalAccess } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { FIELD_DISPATCH_PERMISSION, type FieldDispatchBoard, type FieldDispatchSummary } from "@/modules/portal/field-dispatch";
import { portalRpc } from "@/modules/portal/server";

/** D85: the branch the worker portal works in, when the signed-in person may dispatch there ("Điều phối"); null otherwise. */
export async function fieldDispatchBranch(): Promise<string | null> {
  try {
    const access = await resolveInternalAccess();
    return access.permissions.has(FIELD_DISPATCH_PERMISSION) ? access.branchId : null;
  } catch {
    return null;
  }
}

/** The tab's red count and the "Điều phối hôm nay" card; null for an ordinary worker (no tab). */
export async function loadFieldDispatchSummary(): Promise<FieldDispatchSummary | null> {
  const branch = await fieldDispatchBranch();
  if (!branch) return null;
  try {
    return await portalRpc<FieldDispatchSummary>(await createServerSupabase(), "field_dispatch_summary", { target_branch_id: branch });
  } catch {
    // The permission is there; the count is unknown for now. The tab stays, without a number.
    return { waiting: 0, declined: 0, given: 0, given_workers: 0, short: 0 };
  }
}

export async function loadFieldDispatchBoard(branchId: string) {
  return portalRpc<FieldDispatchBoard>(await createServerSupabase(), "field_dispatch_board", { target_branch_id: branchId });
}

/** "Người giao việc" on the worker's job page: the lead who gave it; null when the office, the system or the worker did. */
export async function loadWorkItemDispatcher(workItemId: string): Promise<{ name: string; assigned_at: string } | null> {
  try {
    return await portalRpc<{ name: string; assigned_at: string } | null>(await createServerSupabase(), "work_item_field_dispatcher", { target_work_item_id: workItemId });
  } catch {
    return null;
  }
}
