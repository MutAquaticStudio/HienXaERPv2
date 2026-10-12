import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { realQAAuth } from "./auth.mjs";
import { argumentsForRun, openQA } from "./native-fixture.mjs";

const args = argumentsForRun();
assert.ok(args["auth-env"]);
const auth = await realQAAuth(args["auth-env"], {
  owner: "hxqa-owner@example.test", sales: "hxqa-sales@example.test", purchasing: "hxqa-purchasing@example.test",
  warehouse: "hxqa-warehouse-dispatch@example.test", finance: "hxqa-finance-employee@example.test",
  worker: "hxqa-worker@example.test", customer: "hxqa-receiver@example.test",
});
const qa = await openQA(args);
const grants = {
  sales: ["dashboard.read", "catalog.read", "customers.read", "pricing.read", "orders.read", "orders.create", "orders.confirm", "orders.cancel",
    "quotation.read", "quotation.create", "quotation.send", "quotation.accept", "delivery.read", "inventory.read", "finance.ar.read"],
  purchasing: ["dashboard.read", "catalog.read", "suppliers.read", "purchasing.read", "purchasing.create", "purchasing.confirm", "purchasing.cancel",
    "purchasing.price.read", "purchasing.price.manage", "delivery.read", "inventory.read", "finance.ap.read"],
  warehouse: ["dashboard.read", "catalog.read", "customers.read", "suppliers.read", "purchasing.read", "inventory.read", "inventory.reserve",
    "inventory.receive", "inventory.count", "inventory.adjust", "delivery.read", "delivery.create", "delivery.assign", "delivery.handoff",
    "delivery.submit", "delivery.verify", "delivery.exception", "work.manage", "workforce.read"],
  finance: ["dashboard.read", "catalog.read", "customers.read", "suppliers.read", "delivery.read", "inventory.read", "inventory.cost.read",
    "finance.ar.read", "finance.ar.adjust", "finance.ap.read", "finance.ap.adjust", "finance.account.manage", "finance.payment.post",
    "finance.payment.reverse", "finance.payment_notice.review", "finance.reconcile", "finance.expense.read", "finance.expense.manage",
    "finance.profit.read", "compensation.read", "compensation.approve"],
  worker: ["work.claim", "workforce.read"],
};
try {
  assert.equal(auth.accounts.owner.subject, qa.fixtures.owner);
  const personas = await qa.sql.begin(async (tx) => {
    const result = {};
    for (const [name, permissions] of Object.entries(grants)) {
      const subject = auth.accounts[name].subject;
      await tx`insert into auth.users(id) values(${subject}) on conflict do nothing`;
      await tx`insert into public.employees(id,auth_user_id,code,display_name,active)
        values(${randomUUID()},${subject},${"RM_" + name.toUpperCase()},${"QA khắc phục " + name},true) on conflict(auth_user_id) do nothing`;
      const [employee] = await tx`select id from public.employees where auth_user_id=${subject} and active`;
      assert.ok(employee);
      const roleId = randomUUID();
      await tx`insert into public.roles(id,code,name) values(${roleId},${"rm_" + name},${"QA khắc phục " + name})`;
      for (const permission of permissions) await tx`insert into public.role_permissions(role_id,permission_code) values(${roleId},${permission})`;
      const existing = await tx`select id from public.employee_branch_access where employee_id=${employee.id} and branch_id=${qa.fixtures.branch} and active`;
      if (existing.length) await tx`update public.employee_branch_access set role_id=${roleId} where id=${existing[0].id}`;
      else await tx`insert into public.employee_branch_access(employee_id,branch_id,role_id) values(${employee.id},${qa.fixtures.branch},${roleId})`;
      result[name] = { subject, employee: employee.id, role: roleId, permissions };
    }
    return result;
  });
  const report = { scope: "REAL_MANAGED_QA_AUTH_LOCAL_SYNTHETIC_ROLE_PERSONAS", database: args.database,
    branch: qa.fixtures.branch, owner: auth.accounts.owner.subject, customer: auth.accounts.customer.subject, personas,
    managedAuthVerified: true, tokensRecorded: false, passwordsRecorded: false,
    managedQaPermissionsChanged: false, productionAccess: "NONE" };
  await writeFile(args.out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ authenticatedRoles: Object.keys(auth.accounts), nativeRoleFixtures: Object.keys(personas), cloudPermissionsChanged: false, tokensRecorded: false }));
} finally { await qa.sql.end({ timeout: 3 }); }
