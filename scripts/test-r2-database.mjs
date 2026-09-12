import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const migrationDirectory = new URL("../supabase/migrations/", import.meta.url);
const migrationFiles = (await readdir(migrationDirectory)).filter((name) => name.endsWith(".sql")).sort();
const migration = (await Promise.all(migrationFiles.map((name) => readFile(new URL(name, migrationDirectory), "utf8")))).join("\n");
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
  assert.equal(permissionCount, 17, "action permissions must be explicit");

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

  await database.exec(`
    reset role;
    insert into public.units_of_measure(id, code, name, symbol, decimal_scale) values
      ('70000000-0000-0000-0000-000000000001', 'kg', 'Kilôgam', 'kg', 3),
      ('70000000-0000-0000-0000-000000000002', 'ton', 'Tấn', 'tấn', 3),
      ('70000000-0000-0000-0000-000000000003', 'bag', 'Bao', 'bao', 0);
    insert into public.material_groups(id, code, name) values
      ('71000000-0000-0000-0000-000000000001', 'CEMENT', 'Xi măng');
    insert into public.materials(id, group_id, code, name, base_uom_id, specification) values
      ('72000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', 'CEMENT_A', 'Xi măng A', '70000000-0000-0000-0000-000000000001', 'Bao 50 kg');
    insert into public.material_uom_conversions(material_id, from_uom_id, to_uom_id, numerator, denominator, conversion_type)
      values ('72000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000001', 50, 1, 'PACKAGING');
    insert into public.pricing_rules(branch_id, scope_type, material_id, price_uom_id, unit_price_vnd, version, source_type, effective_from, created_by)
      values ('20000000-0000-0000-0000-000000000001', 'DEFAULT', '72000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002', 3000000, 1, 'LIST', '2026-01-01', '10000000-0000-0000-0000-000000000001');
    update public.customers set credit_limit_vnd = 10000000 where id = '50000000-0000-0000-0000-000000000001';
  `);

  const [{ conversion_ok: conversionOk }] = await queryRows(`select (2::numeric * numerator / denominator) = 100::numeric as conversion_ok
    from public.material_uom_conversions
    where material_id = '72000000-0000-0000-0000-000000000001' and from_uom_id = '70000000-0000-0000-0000-000000000003'`);
  assert.equal(conversionOk, true, "packaging conversion keeps decimal precision");

  let vehicleSettlementRejected = false;
  try {
    await database.exec(`insert into public.material_uom_conversions(material_id, from_uom_id, to_uom_id, numerator, denominator, conversion_type, settlement_allowed)
      values ('72000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000001', 1000, 1, 'VEHICLE_LOAD', true)`);
  } catch {
    vehicleSettlementRejected = true;
  }
  assert.equal(vehicleSettlementRejected, true, "vehicle load cannot become an authoritative settlement conversion");

  const firstCommitment = await queryRows(`select private.reserve_fixture_credit(
    '50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 6000000,
    'fixture-order-1', '10000000-0000-0000-0000-000000000001') as id`);
  const replayedCommitment = await queryRows(`select private.reserve_fixture_credit(
    '50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 6000000,
    'fixture-order-1', '10000000-0000-0000-0000-000000000001') as id`);
  assert.equal(replayedCommitment[0].id, firstCommitment[0].id, "same credit source replays idempotently");

  let creditOverflowRejected = false;
  try {
    await queryRows(`select private.reserve_fixture_credit(
      '50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 5000000,
      'fixture-order-2', '10000000-0000-0000-0000-000000000001')`);
  } catch {
    creditOverflowRejected = true;
  }
  assert.equal(creditOverflowRejected, true, "credit reservation cannot exceed approved limit");
  const [{ exposure_vnd: exposure }] = await queryRows("select exposure_vnd from public.customer_credit_exposure where customer_id = '50000000-0000-0000-0000-000000000001'");
  assert.equal(exposure.toString(), "6000000", "credit exposure counts an open commitment once");

  await database.exec(`
    insert into public.opening_balance_sources(id, branch_id, side, source_ref, note)
      values ('80000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'RECEIVABLE', 'OPEN-AR-1', 'Local opening fixture');
    insert into public.receivable_obligations(id, branch_id, customer_id, opening_source_id, original_amount_vnd, due_date, recorded_by)
      values ('81000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', 2000000, current_date + 7, '10000000-0000-0000-0000-000000000001');
  `);
  let immutableRejected = false;
  try {
    await database.exec("update public.receivable_obligations set original_amount_vnd = 1 where id = '81000000-0000-0000-0000-000000000001'");
  } catch {
    immutableRejected = true;
  }
  assert.equal(immutableRejected, true, "posted obligation is append-only");

  console.info("Isolated PostgreSQL checks passed: R2 access plus R3 catalog, conversion, obligation, and credit invariants.");
} finally {
  await database.close();
}
