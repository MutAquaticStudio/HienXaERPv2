import { requireInternalPermission } from "@/lib/access/context";
import { formatVnd, vnd } from "@/lib/core/money";
import { createServerSupabase } from "@/lib/supabase/server";
import { entityCodesFor, type AuditObject } from "./presentation";

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
  /** D60: the object as people know it ("SO-2026-000079 · Công ty An Phát"), with a link when it has a page. */
  object: AuditObject | null;
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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type Row = Record<string, unknown>;
type Resolver = { table: string; select: string; label: (row: Row) => string; href?: (row: Row) => string | undefined };
const text = (...parts: unknown[]) => parts.filter((part) => typeof part === "string" && part.trim()).join(" · ");
const nested = (row: Row, key: string, field: string) => {
  const value = row[key] as Row | Row[] | null | undefined;
  return (Array.isArray(value) ? value[0] : value)?.[field];
};
const coded = (row: Row) => text(row.code, row.name ?? row.display_name);
const RESOLVERS: Record<string, Resolver> = {
  sales_order: { table: "sales_orders", select: "id, order_number, customer_name_snapshot", label: (row) => text(row.order_number, row.customer_name_snapshot), href: (row) => `/admin/orders/${row.id}` },
  delivery: { table: "deliveries", select: "id, delivery_number, customer_name_snapshot", label: (row) => text(row.delivery_number, row.customer_name_snapshot), href: (row) => `/admin/deliveries/${row.id}` },
  purchase_order: { table: "purchase_orders", select: "id, purchase_order_number, supplier_name_snapshot", label: (row) => text(row.purchase_order_number, row.supplier_name_snapshot), href: (row) => `/admin/purchase-orders/${row.id}` },
  purchase_receipt: { table: "purchase_receipts", select: "id, receipt_number, purchase_order_id", label: (row) => text(row.receipt_number), href: (row) => row.purchase_order_id ? `/admin/purchase-orders/${row.purchase_order_id}` : undefined },
  payment: { table: "payments", select: "id, payment_number, amount_vnd::text", label: (row) => text(row.payment_number, typeof row.amount_vnd === "string" ? formatVnd(vnd(row.amount_vnd)) : null) },
  payment_request: { table: "payment_requests", select: "id, code, amount_vnd::text", label: (row) => text(row.code, typeof row.amount_vnd === "string" ? formatVnd(vnd(row.amount_vnd)) : null) },
  customers: { table: "customers", select: "id, code, display_name", label: coded, href: (row) => `/admin/customers/${row.id}` },
  customer_sites: { table: "customer_sites", select: "id, name, customer_id, customers(display_name)", label: (row) => text(row.name, nested(row, "customers", "display_name")), href: (row) => `/admin/customers/${row.customer_id}` },
  materials: { table: "materials", select: "id, code, name", label: coded, href: (row) => `/admin/products/${row.id}` },
  material_groups: { table: "material_groups", select: "id, code, name", label: coded },
  units_of_measure: { table: "units_of_measure", select: "id, code, name", label: (row) => text(row.name, row.code) },
  material_uom_conversions: { table: "material_uom_conversions", select: "id, material_id, materials(name)", label: (row) => text(nested(row, "materials", "name")), href: (row) => `/admin/products/${row.material_id}` },
  suppliers: { table: "suppliers", select: "id, code, name", label: coded, href: (row) => `/admin/suppliers/${row.id}` },
  purchase_price_rules: { table: "purchase_price_rules", select: "id, materials(name), suppliers(name)", label: (row) => text(nested(row, "materials", "name"), nested(row, "suppliers", "name")) },
  warehouses: { table: "warehouses", select: "id, code, name", label: coded },
  vehicles: { table: "vehicles", select: "id, code, name", label: coded },
  branches: { table: "branches", select: "id, code, name", label: coded },
  employee: { table: "employees", select: "id, code, display_name", label: coded },
  employee_branch_access: { table: "employee_branch_access", select: "id, employees(display_name)", label: (row) => text(nested(row, "employees", "display_name")) },
  stock_count: { table: "stock_counts", select: "id, count_number", label: (row) => text(row.count_number), href: (row) => `/admin/stock-counts/${row.id}` },
  stock_count_line: { table: "stock_count_lines", select: "id, stock_count_id, materials(name), stock_counts(count_number)", label: (row) => text(nested(row, "stock_counts", "count_number"), nested(row, "materials", "name")), href: (row) => `/admin/stock-counts/${row.stock_count_id}` },
  expense: { table: "expenses", select: "id, expense_number, description", label: (row) => text(row.expense_number, row.description) },
  work_item: { table: "work_items", select: "id, work_number, title", label: (row) => text(row.work_number, row.title) },
  service_job: { table: "service_jobs", select: "id, job_number", label: (row) => text(row.job_number), href: (row) => `/admin/service-jobs/${row.id}` },
  finance_account: { table: "finance_accounts", select: "id, code, name", label: coded },
};
RESOLVERS.customer = RESOLVERS.customers;
RESOLVERS.customer_site = RESOLVERS.customer_sites;
RESOLVERS.branch = RESOLVERS.branches;

/** One query per kind of object on the page; a deleted object reads "(đã xóa)", a kind without a name shows nothing. */
async function resolveObjects(supabase: Awaited<ReturnType<typeof createServerSupabase>>, rows: AuditRow[]) {
  const objects = new Map<string, AuditObject>();
  const byType = new Map<string, Set<string>>();
  for (const row of rows) if (RESOLVERS[row.entity_type]) byType.set(row.entity_type, (byType.get(row.entity_type) ?? new Set()).add(row.entity_id));
  await Promise.all([...byType].map(async ([type, ids]) => {
    const resolver = RESOLVERS[type];
    const { data, error } = await supabase.from(resolver.table as "customers").select(resolver.select).in("id", [...ids]);
    if (error) return;
    const found = new Map(((data ?? []) as unknown as Row[]).map((row) => [String(row.id), row]));
    for (const id of ids) {
      const row = found.get(id);
      const label = row ? resolver.label(row) : "";
      objects.set(`${type}:${id}`, row ? { label: label || "—", href: resolver.href?.(row) } : { label: "(đã xóa)" });
    }
  }));
  return objects;
}

function searchToken(value: string | undefined, maxLength: number) {
  return value?.trim().replace(/%/g, "").slice(0, maxLength) || "";
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
  // D60: the filters are picked from Vietnamese lists — a kind of object (all its stored codes) and an exact action.
  const entityCodes = entity ? entityCodesFor(entity) : [];
  if (entityCodes.length) query = query.in("entity_type", entityCodes);
  else if (entity) query = query.ilike("entity_type", `%${entity}%`);
  if (action && /^[a-z_]+(\.[a-z_]+)+$/.test(action)) query = query.eq("action", action);
  else if (action) query = query.ilike("action", `%${action}%`);
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
  const objects = await resolveObjects(supabase, rows);
  // D60: an actor who is not staff is a customer on the portal — named as that customer, never by a login id.
  const outsiders = actorAuthIds.filter((id) => !(employees ?? []).some((employee) => String(employee.auth_user_id) === id));
  const { data: portalMembers } = outsiders.length
    ? await supabase.from("customer_portal_memberships").select("auth_user_id, customers(display_name)").in("auth_user_id", outsiders).limit(AUDIT_PAGE_SIZE)
    : { data: [] };
  const customerNames = new Map(((portalMembers ?? []) as unknown as Row[]).map((row) => [String(row.auth_user_id), nested(row, "customers", "display_name")]));
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
      actorName: actorNames.get(row.actor_auth_user_id)
        ?? (customerNames.get(row.actor_auth_user_id) ? `Khách ${customerNames.get(row.actor_auth_user_id)} (cổng khách)` : "Tài khoản đã xóa hoặc chưa gắn nhân viên"),
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      traceId: row.trace_id,
      changedFields: row.changed_fields ?? [],
      reason: row.reason,
      object: objects.get(`${row.entity_type}:${row.entity_id}`) ?? null,
    })),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)),
  };
}
