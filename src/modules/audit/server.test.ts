// @vitest-environment node
import { expect, it, vi } from "vitest";

const calls: { table: string; ids: string[] }[] = [];
const tables: Record<string, Record<string, unknown>[]> = {
  audit_events: [
    { id: 3, occurred_at: "2026-11-04T04:32:00Z", actor_auth_user_id: "u1", action: "sales_order.confirm", entity_type: "sales_order", entity_id: "o1", trace_id: "t", changed_fields: [], reason: null },
    { id: 2, occurred_at: "2026-11-03T10:42:00Z", actor_auth_user_id: "u1", action: "delivery.auto_dispatched", entity_type: "delivery", entity_id: "d1", trace_id: "t", changed_fields: [], reason: "Tự điều phối" },
    { id: 1, occurred_at: "2026-11-03T10:40:00Z", actor_auth_user_id: "c9", action: "catalog.delete", entity_type: "warehouses", entity_id: "w-gone", trace_id: "t", changed_fields: [], reason: null },
  ],
  employees: [{ auth_user_id: "u1", display_name: "Owner Hiền Xa", code: "HX_OWNER" }],
  sales_orders: [{ id: "o1", order_number: "SO-2026-000079", customer_name_snapshot: "Công ty An Phát" }],
  deliveries: [{ id: "d1", delivery_number: "DL-2026-000012", customer_name_snapshot: "Công ty An Phát" }],
  warehouses: [],
  customer_portal_memberships: [{ auth_user_id: "c9", customers: { display_name: "Công ty An Phát" } }],
};
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: async () => ({ branchId: "b" }) }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({ from: (table: string) => {
  let rows = tables[table] ?? [];
  const query: Record<string, unknown> = {};
  for (const key of ["select", "eq", "order", "range", "limit", "ilike", "gte", "lte"]) query[key] = () => query;
  query.in = (_column: string, ids: string[]) => { calls.push({ table, ids }); rows = rows.filter((row) => table === "employees" || table === "customer_portal_memberships" || ids.includes(String(row.id))); return query; };
  query.then = (resolve: (value: unknown) => unknown) => resolve({ data: rows, error: null, count: rows.length });
  return query;
} }) }));
import { loadAuditPage } from "./server";

it("names each object as people know it, links it, and marks a deleted one (D60)", async () => {
  const page = await loadAuditPage({ page: 1 });
  expect(page.events.map((event) => event.object)).toEqual([
    { label: "SO-2026-000079 · Công ty An Phát", href: "/admin/orders/o1" },
    { label: "DL-2026-000012 · Công ty An Phát", href: "/admin/deliveries/d1" },
    { label: "(đã xóa)" },
  ]);
  expect(page.events[0].actorName).toBe("Owner Hiền Xa (HX_OWNER)");
  // A customer acting on the portal is named as the customer, not by a login id.
  expect(page.events[2].actorName).toBe("Khách Công ty An Phát (cổng khách)");
  // One lookup per kind of object on the page.
  expect(calls.filter((call) => call.table === "sales_orders")).toHaveLength(1);
});
