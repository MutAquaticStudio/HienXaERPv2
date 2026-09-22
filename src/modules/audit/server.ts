import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";

export const AUDIT_PAGE_SIZE = 25;

export type AuditFilters = {
  actor?: string;
  entity?: string;
  action?: string;
  from?: string;
  to?: string;
  page: number;
};

export type AuditEvent = {
  id: number;
  occurredAt: string;
  actorId: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  traceId: string;
  changedFields: string[];
  reason: string | null;
};

type AuditRow = {
  id: number;
  occurred_at: string;
  actor_auth_user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  trace_id: string;
  changed_fields: string[] | null;
  reason: string | null;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function searchToken(value: string | undefined, maxLength: number) {
  return value?.trim().replace(/[%_]/g, "").slice(0, maxLength) || "";
}

async function resolveActorIds(branchId: string, actor: string) {
  if (UUID_PATTERN.test(actor)) return [actor];

  const supabase = await createServerSupabase();
  const { data: employees, error: employeeError } = await supabase
    .from("employees")
    .select("id,auth_user_id")
    .eq("active", true)
    .ilike("display_name", `%${actor}%`)
    .limit(50);

  if (employeeError) throw employeeError;
  const employeeIds = (employees ?? []).map((row) => String(row.id));
  if (!employeeIds.length) return [];

  const { data: memberships, error: membershipError } = await supabase
    .from("employee_branch_access")
    .select("employee_id")
    .eq("branch_id", branchId)
    .eq("active", true)
    .in("employee_id", employeeIds)
    .limit(50);

  if (membershipError) throw membershipError;
  const branchEmployeeIds = new Set((memberships ?? []).map((row) => String(row.employee_id)));
  return [...new Set((employees ?? [])
    .filter((row) => branchEmployeeIds.has(String(row.id)) && row.auth_user_id)
    .map((row) => String(row.auth_user_id)))];
}

export async function loadAuditPage(filters: AuditFilters) {
  const access = await requireInternalPermission("roles.manage");
  const supabase = await createServerSupabase();
  const page = Number.isFinite(filters.page) ? Math.max(1, Math.trunc(filters.page)) : 1;
  const actor = searchToken(filters.actor, 80);
  const entity = searchToken(filters.entity, 80);
  const action = searchToken(filters.action, 100);
  const from = DATE_PATTERN.test(filters.from ?? "") ? filters.from! : "";
  const to = DATE_PATTERN.test(filters.to ?? "") ? filters.to! : "";
  const actorIds = actor ? await resolveActorIds(access.branchId, actor) : undefined;

  if (actorIds && !actorIds.length) {
    return { events: [] as AuditEvent[], total: 0, page: 1, pageCount: 1 };
  }

  let query = supabase
    .from("audit_events")
    .select(
      "id,occurred_at,actor_auth_user_id,action,entity_type,entity_id,trace_id,changed_fields,reason",
      { count: "exact" },
    )
    .eq("branch_id", access.branchId);

  if (actorIds) query = query.in("actor_auth_user_id", actorIds);
  if (entity) query = query.ilike("entity_type", `%${entity}%`);
  if (action) query = query.ilike("action", `%${action}%`);
  if (from) query = query.gte("occurred_at", `${from}T00:00:00+07:00`);
  if (to) query = query.lte("occurred_at", `${to}T23:59:59.999+07:00`);

  const offset = (page - 1) * AUDIT_PAGE_SIZE;
  const { data, error, count } = await query
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + AUDIT_PAGE_SIZE - 1);

  if (error) throw error;
  const rows = (data ?? []) as AuditRow[];
  const actorAuthIds = [...new Set(rows.map((row) => row.actor_auth_user_id))];
  const { data: employees, error: employeesError } = actorAuthIds.length
    ? await supabase
        .from("employees")
        .select("auth_user_id,display_name,code")
        .in("auth_user_id", actorAuthIds)
        .limit(AUDIT_PAGE_SIZE)
    : { data: [], error: null };

  if (employeesError) throw employeesError;
  const actorNames = new Map(
    (employees ?? []).map((employee) => [
      String(employee.auth_user_id),
      `${employee.display_name}${employee.code ? ` (${employee.code})` : ""}`,
    ]),
  );
  const total = count ?? 0;

  return {
    events: rows.map((row) => ({
      id: row.id,
      occurredAt: row.occurred_at,
      actorId: row.actor_auth_user_id,
      actorName: actorNames.get(row.actor_auth_user_id) ?? `Người dùng ${row.actor_auth_user_id.slice(0, 8)}`,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      traceId: row.trace_id,
      changedFields: row.changed_fields ?? [],
      reason: row.reason,
    })),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)),
  };
}
