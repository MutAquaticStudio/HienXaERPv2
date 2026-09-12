import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const migrationUrl = new URL("../supabase/migrations/20260912101030_identity_access.sql", import.meta.url);
const migration = await readFile(migrationUrl, "utf8");
const database = await PGlite.create({ extensions: { pgcrypto } });

async function queryRows(sql) {
  const result = await database.query(sql);
  return result.rows;
}

try {
  await database.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
  `);
  await database.exec(migration);

  const [{ count: tableCount }] = await queryRows(`
    select count(*)::int as count
    from information_schema.tables
    where table_schema = 'public'
      and table_name = any(array['branches','employees','roles','permissions','role_permissions','employee_branch_access','customers','customer_portal_memberships','audit_events'])
  `);
  assert.equal(tableCount, 9, "all R2 tables must exist");

  const [{ count: rlsCount }] = await queryRows(`
    select count(*)::int as count
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relrowsecurity
      and c.relname = any(array['branches','employees','roles','permissions','role_permissions','employee_branch_access','customers','customer_portal_memberships','audit_events'])
  `);
  assert.equal(rlsCount, 9, "RLS must protect every R2 table");

  const [{ count: permissionCount }] = await queryRows("select count(*)::int as count from public.permissions");
  assert.equal(permissionCount, 9, "action permissions must be explicit");

  await database.exec(`
    insert into auth.users(id) values
      ('10000000-0000-0000-0000-000000000001'),
      ('10000000-0000-0000-0000-000000000002'),
      ('10000000-0000-0000-0000-000000000003');
    insert into public.branches(id, code, name) values
      ('20000000-0000-0000-0000-000000000001', 'BRANCH_A', 'Chi nhánh A'),
      ('20000000-0000-0000-0000-000000000002', 'BRANCH_B', 'Chi nhánh B');
    insert into public.employees(id, auth_user_id, code, display_name) values
      ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'EMP_A', 'Nhân viên A'),
      ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'EMP_B', 'Nhân viên B');
    insert into public.roles(id, code, name) values
      ('40000000-0000-0000-0000-000000000001', 'sales', 'Bán hàng');
    insert into public.role_permissions(role_id, permission_code) values
      ('40000000-0000-0000-0000-000000000001', 'orders.read'),
      ('40000000-0000-0000-0000-000000000001', 'customers.read');
    insert into public.employee_branch_access(employee_id, branch_id, role_id) values
      ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001'),
      ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001');
    insert into public.customers(id, branch_id, code, display_name) values
      ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'CUS_A', 'Khách A'),
      ('50000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'CUS_B', 'Khách B');
    insert into public.customer_portal_memberships(auth_user_id, customer_id, membership_role) values
      ('10000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000001', 'RECEIVER');
  `);

  let uniqueRejected = false;
  try {
    await database.exec(`insert into public.employee_branch_access(employee_id, branch_id, role_id) values
      ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001')`);
  } catch {
    uniqueRejected = true;
  }
  assert.equal(uniqueRejected, true, "a second active role in one branch must be rejected");

  await database.exec("set role authenticated; select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);");
  const branches = await queryRows("select code from public.branches order by code");
  assert.deepEqual(branches.map((row) => row.code), ["BRANCH_A"], "internal branch RLS must isolate rows");
  const customers = await queryRows("select code from public.customers order by code");
  assert.deepEqual(customers.map((row) => row.code), ["CUS_A"], "internal customer RLS must isolate rows");
  const [{ allowed, denied }] = await queryRows(`select
    private.has_permission('20000000-0000-0000-0000-000000000001', 'orders.read') as allowed,
    private.has_permission('20000000-0000-0000-0000-000000000002', 'orders.read') as denied`);
  assert.equal(allowed, true);
  assert.equal(denied, false);

  let commandDenied = false;
  try {
    await queryRows(`select public.assign_employee_role(
      '30000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000001',
      'unauthorized test',
      '60000000-0000-0000-0000-000000000001')`);
  } catch {
    commandDenied = true;
  }
  assert.equal(commandDenied, true, "reachable security-definer command must self-deny without roles.manage");

  await database.exec("select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', false);");
  const portalCustomers = await queryRows("select code from public.customers order by code");
  assert.deepEqual(portalCustomers.map((row) => row.code), ["CUS_A"], "customer membership must not cross customer scope");

  console.info("R2 isolated PostgreSQL checks passed: schema, constraints, RLS, cross-scope denial, command denial.");
} finally {
  await database.close();
}
