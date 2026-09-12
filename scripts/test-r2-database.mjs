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
  assert.equal(permissionCount, 22, "action permissions must be explicit");

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
      ('40000000-0000-0000-0000-000000000001', 'orders.create'),
      ('40000000-0000-0000-0000-000000000001', 'orders.confirm'),
      ('40000000-0000-0000-0000-000000000001', 'orders.cancel'),
      ('40000000-0000-0000-0000-000000000001', 'customers.read'),
      ('40000000-0000-0000-0000-000000000001', 'pricing.read'),
      ('40000000-0000-0000-0000-000000000001', 'quotation.read'),
      ('40000000-0000-0000-0000-000000000001', 'quotation.create'),
      ('40000000-0000-0000-0000-000000000001', 'quotation.send'),
      ('40000000-0000-0000-0000-000000000001', 'quotation.accept');
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
      values
      ('72000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000001', 50, 1, 'PACKAGING'),
      ('72000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000001', 1000, 1, 'EXACT');
    insert into public.pricing_rules(branch_id, scope_type, material_id, price_uom_id, unit_price_vnd, version, source_type, effective_from, created_by)
      values ('20000000-0000-0000-0000-000000000001', 'DEFAULT', '72000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002', 3000000, 1, 'LIST', '2026-01-01', '10000000-0000-0000-0000-000000000001');
    update public.customers set credit_limit_vnd = 10000000 where id = '50000000-0000-0000-0000-000000000001';
    insert into public.customer_sites(id, customer_id, code, name, address_text)
      values ('73000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'SITE_A', 'Công trình A', 'Hà Nội');
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

  await database.exec("update public.customers set credit_limit_vnd = 12000000 where id = '50000000-0000-0000-0000-000000000001'");
  await database.exec("set role authenticated; select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);");
  const salesLine = JSON.stringify([{ material_id: "72000000-0000-0000-0000-000000000001", ordered_uom_id: "70000000-0000-0000-0000-000000000002", quantity: "1", conversion_numerator: "1000", conversion_denominator: "1", rounding_mode: "HALF_UP", unit_price_vnd: "3000000", pricing_rule_id: null, pricing_rule_version: 1, price_source_type: "LIST" }]);
  const [{ id: pricingRuleId }] = await queryRows("select id from public.pricing_rules where scope_type = 'DEFAULT'");
  const pricedLine = salesLine.replace('"pricing_rule_id":null', `"pricing_rule_id":"${pricingRuleId}"`);
  const createOrderSql = (operationId, lines = pricedLine) => `select public.create_sales_order_draft(
    '20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000001',
    current_date + 2, 'Giao giờ hành chính', '${lines}'::jsonb, '${operationId}') as id`;
  const [firstOrder] = await queryRows(createOrderSql("90000000-0000-0000-0000-000000000001"));
  const [replayedOrder] = await queryRows(createOrderSql("90000000-0000-0000-0000-000000000001"));
  assert.equal(replayedOrder.id, firstOrder.id, "same order operation and payload must replay one entity");
  let orderPayloadConflict = false;
  try { await queryRows(createOrderSql("90000000-0000-0000-0000-000000000001", pricedLine.replace('"quantity":"1"', '"quantity":"2"'))); } catch { orderPayloadConflict = true; }
  assert.equal(orderPayloadConflict, true, "same operation with a different payload must conflict");
  await queryRows(`select public.confirm_sales_order('${firstOrder.id}', '90000000-0000-0000-0000-000000000002')`);
  await database.exec("reset role");
  const [{ count: arAfterConfirm }] = await queryRows("select count(*)::int as count from public.receivable_obligations");
  assert.equal(arAfterConfirm, 1, "order confirmation must not create receivable obligation");
  await database.exec("set role authenticated");
  const [overflowOrder] = await queryRows(createOrderSql("90000000-0000-0000-0000-000000000003"));
  let orderCreditRejected = false;
  try { await queryRows(`select public.confirm_sales_order('${overflowOrder.id}', '90000000-0000-0000-0000-000000000004')`); } catch { orderCreditRejected = true; }
  assert.equal(orderCreditRejected, true, "order confirmation must reject exposure above the customer limit");
  await queryRows(`select public.cancel_sales_order('${firstOrder.id}', 'Khách đổi kế hoạch', '90000000-0000-0000-0000-000000000005')`);
  await database.exec("reset role");
  const [{ remaining_vnd: remainingAfterCancel }] = await queryRows(`select amount_vnd - consumed_vnd - released_vnd as remaining_vnd from public.credit_commitments where sales_order_id = '${firstOrder.id}'`);
  assert.equal(remainingAfterCancel.toString(), "0", "cancellation releases the unconsumed order commitment");
  await database.exec("set role authenticated");

  const createQuoteSql = (operationId) => `select public.create_quote_draft(
    '20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000001',
    current_date + 7, 'Giữ giá bảy ngày', '${pricedLine}'::jsonb, '${operationId}') as id`;
  const [quote] = await queryRows(createQuoteSql("91000000-0000-0000-0000-000000000001"));
  const [quoteReplay] = await queryRows(createQuoteSql("91000000-0000-0000-0000-000000000001"));
  assert.equal(quoteReplay.id, quote.id, "quote draft creation must replay idempotently");
  const [{ current_revision_id: revisionId }] = await queryRows(`select current_revision_id from public.quotations where id = '${quote.id}'`);
  await queryRows(`select public.send_quote_revision('${revisionId}', '91000000-0000-0000-0000-000000000002')`);
  let sentLineMutationRejected = false;
  try { await database.exec(`update public.quotation_lines set quantity = 2 where revision_id = '${revisionId}'`); } catch { sentLineMutationRejected = true; }
  assert.equal(sentLineMutationRejected, true, "a sent revision line must be immutable");
  await queryRows(`select public.accept_quote_revision('${revisionId}', 'PHONE', 'Chị Lan', null, '91000000-0000-0000-0000-000000000003')`);
  const [{ state: acceptedState }] = await queryRows(`select state from public.quotation_revisions where id = '${revisionId}'`);
  assert.equal(acceptedState, "ACCEPTED", "internal acceptance targets the exact sent revision");
  const [{ count: noAutomaticOrder }] = await queryRows(`select count(*)::int as count from public.sales_orders where quotation_revision_id = '${revisionId}'`);
  assert.equal(noAutomaticOrder, 0, "accepting a quotation must not auto-create an order");
  const [fromQuoteOrder] = await queryRows(`select public.create_sales_order_from_quote('${revisionId}', current_date + 3, '91000000-0000-0000-0000-000000000004') as id`);
  const [fromQuoteReplay] = await queryRows(`select public.create_sales_order_from_quote('${revisionId}', current_date + 3, '91000000-0000-0000-0000-000000000005') as id`);
  assert.equal(fromQuoteReplay.id, fromQuoteOrder.id, "one accepted revision maps to one sales order");
  const [newRevision] = await queryRows(`select public.create_quote_revision('${revisionId}', '91000000-0000-0000-0000-000000000006') as id`);
  const [{ state: oldRevisionState }] = await queryRows(`select state from public.quotation_revisions where id = '${revisionId}'`);
  assert.equal(oldRevisionState, "SUPERSEDED", "new revision supersedes the immutable source revision");
  const [{ count: copiedLines }] = await queryRows(`select count(*)::int as count from public.quotation_lines where revision_id = '${newRevision.id}'`);
  assert.equal(copiedLines, 1, "new revision copies the prior commercial snapshot");

  const [portalQuote] = await queryRows(createQuoteSql("92000000-0000-0000-0000-000000000001"));
  const [{ current_revision_id: portalRevisionId }] = await queryRows(`select current_revision_id from public.quotations where id = '${portalQuote.id}'`);
  await queryRows(`select public.send_quote_revision('${portalRevisionId}', '92000000-0000-0000-0000-000000000002')`);
  await database.exec("reset role; insert into public.customer_portal_memberships(auth_user_id, customer_id, membership_role) values ('10000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000001', 'FINANCE_CONTACT'); set role authenticated; select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', false);");
  await queryRows(`select public.accept_quote_revision('${portalRevisionId}', 'PORTAL', 'Khách A', null, '92000000-0000-0000-0000-000000000003')`);
  const [{ state: portalAcceptedState }] = await queryRows(`select state from public.quotation_revisions where id = '${portalRevisionId}'`);
  assert.equal(portalAcceptedState, "ACCEPTED", "finance customer membership can accept the exact portal revision");

  console.info("Isolated PostgreSQL checks passed: R2 access, R3 catalog/credit, and R4 quotation/order invariants.");
} finally {
  await database.close();
}
