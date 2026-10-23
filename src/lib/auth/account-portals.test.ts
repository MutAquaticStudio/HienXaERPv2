import { expect, it } from "vitest";
import { accountPortals, wrongPortalMessage } from "./account-portals";

function client(tables: Record<string, unknown>) {
  return { from(table: string) {
    const query: Record<string, unknown> = {};
    for (const method of ["select", "eq", "limit"]) query[method] = () => query;
    const result = Promise.resolve({ data: tables[table] ?? null, error: null });
    query.maybeSingle = () => result;
    query.then = result.then.bind(result);
    return query;
  } } as never;
}
const roles = (...codes: string[]) => [{ roles: { role_permissions: codes.map((permission_code) => ({ permission_code })) } }];

it("puts a worker on Thợ & tài xế only", async () => {
  const portals = await accountPortals(client({ employees: { id: "e1" }, employee_branch_access: roles("work.read", "work.claim"), customer_portal_memberships: [] }), "u1");
  expect(portals).toEqual({ admin: false, work: true, customer: false });
  expect(wrongPortalMessage("admin", portals)).toContain("thợ & tài xế");
  expect(wrongPortalMessage("work", portals)).toBeNull();
});

it("counts an extra grant as an operations permission", async () => {
  const portals = await accountPortals(client({ employees: { id: "e1" }, employee_branch_access: roles("work.read"),
    employee_permission_grants: [{ permission_code: "orders.read" }], customer_portal_memberships: [] }), "u1");
  expect(portals.admin).toBe(true);
});

it("puts a customer on Khách hàng only", async () => {
  const portals = await accountPortals(client({ employees: null, customer_portal_memberships: [{ id: "m1" }] }), "u1");
  expect(portals).toEqual({ admin: false, work: false, customer: true });
  expect(wrongPortalMessage("admin", portals)).toContain("khách hàng");
  expect(wrongPortalMessage("work", portals)).toContain("khách hàng");
});

it("explains an account without any portal", () => {
  expect(wrongPortalMessage("admin", { admin: false, work: false, customer: false })).toContain("chưa được cấp quyền");
});
