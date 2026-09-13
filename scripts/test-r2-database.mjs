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
  assert.equal(permissionCount, 62, "action permissions must be explicit");

  await database.exec(`
    insert into auth.users(id) values
      ('10000000-0000-0000-0000-000000000001'),
      ('10000000-0000-0000-0000-000000000002'),
      ('10000000-0000-0000-0000-000000000003'),
      ('10000000-0000-0000-0000-000000000004'),
      ('10000000-0000-0000-0000-000000000005');
    insert into public.branches(id, code, name) values
      ('20000000-0000-0000-0000-000000000001', 'BRANCH_A', 'Chi nhánh A'),
      ('20000000-0000-0000-0000-000000000002', 'BRANCH_B', 'Chi nhánh B');
    insert into public.employees(id, auth_user_id, code, display_name) values
      ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'EMP_A', 'Nhân viên A'),
      ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'EMP_B', 'Nhân viên B');
    insert into public.roles(id, code, name) values
      ('40000000-0000-0000-0000-000000000001', 'sales', 'Bán hàng');
    insert into public.role_permissions(role_id, permission_code) values
      ('40000000-0000-0000-0000-000000000001', 'dashboard.read'),
      ('40000000-0000-0000-0000-000000000001', 'orders.read'),
      ('40000000-0000-0000-0000-000000000001', 'orders.create'),
      ('40000000-0000-0000-0000-000000000001', 'orders.confirm'),
      ('40000000-0000-0000-0000-000000000001', 'orders.cancel'),
      ('40000000-0000-0000-0000-000000000001', 'customers.read'),
      ('40000000-0000-0000-0000-000000000001', 'pricing.read'),
      ('40000000-0000-0000-0000-000000000001', 'quotation.read'),
      ('40000000-0000-0000-0000-000000000001', 'quotation.create'),
      ('40000000-0000-0000-0000-000000000001', 'quotation.send'),
      ('40000000-0000-0000-0000-000000000001', 'quotation.accept'),
      ('40000000-0000-0000-0000-000000000001', 'purchasing.read'),
      ('40000000-0000-0000-0000-000000000001', 'purchasing.create'),
      ('40000000-0000-0000-0000-000000000001', 'purchasing.confirm'),
      ('40000000-0000-0000-0000-000000000001', 'purchasing.cancel'),
      ('40000000-0000-0000-0000-000000000001', 'purchasing.price.read'),
      ('40000000-0000-0000-0000-000000000001', 'purchasing.price.manage'),
      ('40000000-0000-0000-0000-000000000001', 'suppliers.read'),
      ('40000000-0000-0000-0000-000000000001', 'catalog.read'),
      ('40000000-0000-0000-0000-000000000001', 'delivery.read'),
      ('40000000-0000-0000-0000-000000000001', 'finance.ar.read'),
      ('40000000-0000-0000-0000-000000000001', 'finance.ap.read'),
      ('40000000-0000-0000-0000-000000000001', 'inventory.read'),
      ('40000000-0000-0000-0000-000000000001', 'inventory.reserve'),
      ('40000000-0000-0000-0000-000000000001', 'inventory.receive'),
      ('40000000-0000-0000-0000-000000000001', 'inventory.count'),
      ('40000000-0000-0000-0000-000000000001', 'inventory.adjust'),
      ('40000000-0000-0000-0000-000000000001', 'inventory.cost.read'),
      ('40000000-0000-0000-0000-000000000001', 'delivery.create'),
      ('40000000-0000-0000-0000-000000000001', 'delivery.assign'),
      ('40000000-0000-0000-0000-000000000001', 'delivery.handoff'),
      ('40000000-0000-0000-0000-000000000001', 'delivery.submit'),
      ('40000000-0000-0000-0000-000000000001', 'delivery.verify'),
      ('40000000-0000-0000-0000-000000000001', 'delivery.billing.override'),
      ('40000000-0000-0000-0000-000000000001', 'delivery.exception'),
      ('40000000-0000-0000-0000-000000000001', 'evidence.manage'),
      ('40000000-0000-0000-0000-000000000001', 'finance.ar.adjust'),
      ('40000000-0000-0000-0000-000000000001', 'finance.account.manage'),
      ('40000000-0000-0000-0000-000000000001', 'finance.payment.post'),
      ('40000000-0000-0000-0000-000000000001', 'finance.payment_notice.review'),
      ('40000000-0000-0000-0000-000000000001', 'finance.payment.reverse'),
      ('40000000-0000-0000-0000-000000000001', 'finance.ap.adjust'),
      ('40000000-0000-0000-0000-000000000001', 'finance.expense.read'),
      ('40000000-0000-0000-0000-000000000001', 'finance.expense.manage'),
      ('40000000-0000-0000-0000-000000000001', 'finance.reconcile'),
      ('40000000-0000-0000-0000-000000000001', 'finance.profit.read'),
      ('40000000-0000-0000-0000-000000000001', 'workforce.read'),
      ('40000000-0000-0000-0000-000000000001', 'work.manage'),
      ('40000000-0000-0000-0000-000000000001', 'work.claim'),
      ('40000000-0000-0000-0000-000000000001', 'work.verify'),
      ('40000000-0000-0000-0000-000000000001', 'service.read'),
      ('40000000-0000-0000-0000-000000000001', 'service.manage'),
      ('40000000-0000-0000-0000-000000000001', 'service.verify'),
      ('40000000-0000-0000-0000-000000000001', 'compensation.read'),
      ('40000000-0000-0000-0000-000000000001', 'compensation.manage'),
      ('40000000-0000-0000-0000-000000000001', 'compensation.approve');
    insert into public.employee_branch_access(employee_id, branch_id, role_id) values
      ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001'),
      ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001');
    insert into public.customers(id, branch_id, code, display_name) values
      ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'CUS_A', 'Khách A'),
      ('50000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'CUS_B', 'Khách B');
    insert into public.customer_portal_memberships(auth_user_id, customer_id, membership_role) values
      ('10000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000001', 'RECEIVER'),
      ('10000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000001', 'OWNER'),
      ('10000000-0000-0000-0000-000000000005', '50000000-0000-0000-0000-000000000001', 'RECEIVER');
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
    insert into public.suppliers(id, branch_id, code, name, address_text)
      values ('74000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'SUP_A', 'Nhà cung cấp A', 'Hải Dương');
    insert into public.warehouses(id, branch_id, code, name, address_text)
      values ('75000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'WH_A', 'Kho trung tâm', 'Hà Nội');
    insert into public.vehicles(id, branch_id, code, plate_number)
      values ('75000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'TRUCK_A', '30A-12345');
    insert into public.purchase_price_rules(id, branch_id, supplier_id, material_id, purchase_uom_id, unit_cost_vnd, version, source_type, effective_from, created_by)
      values ('76000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '74000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002', 2500000, 1, 'CONTRACT', '2026-01-01', '10000000-0000-0000-0000-000000000001');
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

  await database.exec("select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false)");
  const purchaseLineObject = { material_id: "72000000-0000-0000-0000-000000000001", ordered_uom_id: "70000000-0000-0000-0000-000000000002", quantity: "1", conversion_numerator: "1000", conversion_denominator: "1", rounding_mode: "HALF_UP", unit_cost_vnd: "2500000", purchase_price_rule_id: "76000000-0000-0000-0000-000000000001", purchase_price_rule_version: 1, price_source_type: "CONTRACT" };
  const purchaseLine = JSON.stringify([purchaseLineObject]);
  const createPurchaseSql = (operationId) => `select public.create_purchase_order_draft(
    '20000000-0000-0000-0000-000000000001', '74000000-0000-0000-0000-000000000001',
    '75000000-0000-0000-0000-000000000001', current_date + 2, 'Giao tại kho',
    '${purchaseLine}'::jsonb, '${operationId}') as id`;
  const [warehousePurchase] = await queryRows(createPurchaseSql("93000000-0000-0000-0000-000000000001"));
  const [warehousePurchaseReplay] = await queryRows(createPurchaseSql("93000000-0000-0000-0000-000000000001"));
  assert.equal(warehousePurchaseReplay.id, warehousePurchase.id, "warehouse PO draft must replay idempotently");
  await queryRows(`select public.confirm_purchase_order('${warehousePurchase.id}', '93000000-0000-0000-0000-000000000002')`);
  await database.exec("reset role");
  const [{ count: apAfterPurchaseConfirm }] = await queryRows("select count(*)::int as count from public.payable_obligations");
  assert.equal(apAfterPurchaseConfirm, 0, "PO confirmation must not create payable obligation");
  await database.exec("set role authenticated");

  const [{ id: sourceSalesLineId }] = await queryRows(`select id from public.sales_order_lines where sales_order_id = '${overflowOrder.id}'`);
  const halfPurchaseLine = JSON.stringify({ ...purchaseLineObject, quantity: "0.5" });
  const createDirectSql = (operationId) => `select public.create_direct_purchase_from_sales_line(
    '${sourceSalesLineId}', '74000000-0000-0000-0000-000000000001', 0.5,
    '${halfPurchaseLine}'::jsonb, current_date + 2, '${operationId}') as id`;
  const [directPurchase] = await queryRows(createDirectSql("94000000-0000-0000-0000-000000000001"));
  const [directPurchaseReplay] = await queryRows(createDirectSql("94000000-0000-0000-0000-000000000001"));
  assert.equal(directPurchaseReplay.id, directPurchase.id, "direct PO retry must not create a second PO or allocation");
  const [{ count: directAllocationCount }] = await queryRows(`select count(*)::int as count from public.supply_allocations where sales_order_line_id = '${sourceSalesLineId}' and supply_mode = 'SUPPLIER_DIRECT'`);
  assert.equal(directAllocationCount, 1, "direct PO creates one explicit sales-line allocation");

  let splitOverflowRejected = false;
  try {
    await queryRows(`select public.upsert_supply_allocation('${sourceSalesLineId}', 'WAREHOUSE', null,
      '75000000-0000-0000-0000-000000000001', 600, null, null,
      '94000000-0000-0000-0000-000000000002')`);
  } catch { splitOverflowRejected = true; }
  assert.equal(splitOverflowRejected, true, "split allocations cannot exceed the sales line need");
  const [warehouseAllocation] = await queryRows(`select public.upsert_supply_allocation('${sourceSalesLineId}', 'WAREHOUSE', null,
    '75000000-0000-0000-0000-000000000001', 400, null, null,
    '94000000-0000-0000-0000-000000000003') as id`);
  await queryRows(`select public.upsert_supply_allocation('${sourceSalesLineId}', 'WAREHOUSE', null,
    '75000000-0000-0000-0000-000000000001', 450, '${warehouseAllocation.id}', 1,
    '94000000-0000-0000-0000-000000000004')`);
  let staleAllocationRejected = false;
  try {
    await queryRows(`select public.upsert_supply_allocation('${sourceSalesLineId}', 'WAREHOUSE', null,
      '75000000-0000-0000-0000-000000000001', 400, '${warehouseAllocation.id}', 1,
      '94000000-0000-0000-0000-000000000005')`);
  } catch { staleAllocationRejected = true; }
  assert.equal(staleAllocationRejected, true, "allocation update must reject a stale expected version");

  const [{ id: warehousePurchaseLineId }] = await queryRows(`select id from public.purchase_order_line_read where purchase_order_id = '${warehousePurchase.id}'`);
  const [{ id: secondSalesLineId }] = await queryRows(`select id from public.sales_order_lines where sales_order_id = '${fromQuoteOrder.id}'`);
  await queryRows(`select public.upsert_supply_allocation('${secondSalesLineId}', 'SUPPLIER_TO_WAREHOUSE',
    '${warehousePurchaseLineId}', '75000000-0000-0000-0000-000000000001', 300, null, null,
    '95000000-0000-0000-0000-000000000001')`);
  const [{ count: warehouseSupplyCount }] = await queryRows(`select count(*)::int as count from public.supply_allocations where sales_order_line_id = '${secondSalesLineId}' and supply_mode = 'SUPPLIER_TO_WAREHOUSE'`);
  assert.equal(warehouseSupplyCount, 1, "supplier-to-warehouse mode links exact PO line, warehouse, and sales line");

  const linkedPurchaseLine = JSON.stringify(purchaseLineObject);
  const linkedSalesLine = JSON.stringify(JSON.parse(pricedLine)[0]);
  const linkedDraftSql = (operationId) => `select public.create_linked_direct_drafts(
    '20000000-0000-0000-0000-000000000001', '74000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000001',
    '${linkedPurchaseLine}'::jsonb, '${linkedSalesLine}'::jsonb, current_date + 4,
    'Hai draft liên kết', '${operationId}') as id`;
  const [linkedPurchase] = await queryRows(linkedDraftSql("96000000-0000-0000-0000-000000000001"));
  const [linkedPurchaseReplay] = await queryRows(linkedDraftSql("96000000-0000-0000-0000-000000000001"));
  assert.equal(linkedPurchaseReplay.id, linkedPurchase.id, "linked SO/PO draft use-case must replay one pair");
  const [{ count: linkedPairCount }] = await queryRows(`select count(*)::int as count
    from public.purchase_orders p join public.purchase_order_line_read pl on pl.purchase_order_id = p.id
    join public.sales_order_lines sl on sl.id = pl.linked_sales_order_line_id
    where p.id = '${linkedPurchase.id}' and p.source_sales_order_id = sl.sales_order_id`);
  assert.equal(linkedPairCount, 1, "linked draft use-case keeps explicit SO, sales line, PO, and purchase line FKs");

  const [evidence] = await queryRows(`select public.create_evidence_upload(
    '20000000-0000-0000-0000-000000000001', 'inventory-evidence', 'r6/receipt-proof.jpg', 'INTERNAL',
    'a0000000-0000-0000-0000-000000000001') as id`);
  await queryRows(`select public.finalize_evidence_upload('${evidence.id}', '${"a".repeat(64)}', 1024,
    'a0000000-0000-0000-0000-000000000002')`);
  const [receipt] = await queryRows(`select public.receive_purchase_order('${warehousePurchase.id}',
    '[{"purchase_order_line_id":"${warehousePurchaseLineId}","received_quantity":"1"}]'::jsonb,
    '${evidence.id}', '2026-09-12T10:00:00Z', 'a0000000-0000-0000-0000-000000000003') as id`);
  const [receiptReplay] = await queryRows(`select public.receive_purchase_order('${warehousePurchase.id}',
    '[{"purchase_order_line_id":"${warehousePurchaseLineId}","received_quantity":"1"}]'::jsonb,
    '${evidence.id}', '2026-09-12T10:00:00Z', 'a0000000-0000-0000-0000-000000000003') as id`);
  assert.equal(receiptReplay.id, receipt.id, "purchase receipt replay must not duplicate stock or AP");
  const [receivedPosition] = await queryRows(`select on_hand_base_quantity, reserved_base_quantity, available_base_quantity,
    inventory_value_vnd from public.warehouse_inventory_read
    where warehouse_id = '75000000-0000-0000-0000-000000000001' and material_id = '72000000-0000-0000-0000-000000000001'`);
  assert.deepEqual(
    [receivedPosition.on_hand_base_quantity, receivedPosition.reserved_base_quantity, receivedPosition.available_base_quantity, receivedPosition.inventory_value_vnd],
    ["1000.000000", "0", "1000.000000", "2500000"],
    "receipt posts exact stock/value while reservations remain separate",
  );
  const [{ count: receiptPayableCount }] = await queryRows(`select count(*)::int as count from public.payable_obligations where purchase_receipt_id = '${receipt.id}'`);
  assert.equal(receiptPayableCount, 1, "verified warehouse receipt creates one source-linked payable");

  const [warehouseSalesOrder] = await queryRows(createOrderSql("a1000000-0000-0000-0000-000000000001"));
  await queryRows(`select public.confirm_sales_order('${warehouseSalesOrder.id}', 'a1000000-0000-0000-0000-000000000002')`);
  const [{ id: warehouseSalesLine }] = await queryRows(`select id from public.sales_order_lines where sales_order_id = '${warehouseSalesOrder.id}'`);
  const [deliveryAllocation] = await queryRows(`select public.upsert_supply_allocation('${warehouseSalesLine}', 'WAREHOUSE', null,
    '75000000-0000-0000-0000-000000000001', 1000, null, null,
    'a1000000-0000-0000-0000-000000000003') as id`);
  const [warehouseDelivery] = await queryRows(`select public.create_delivery_from_allocation('${deliveryAllocation.id}', 600,
    current_date + 1, 'a1000000-0000-0000-0000-000000000004') as id`);
  const [warehouseDeliveryReplay] = await queryRows(`select public.create_delivery_from_allocation('${deliveryAllocation.id}', 600,
    current_date + 1, 'a1000000-0000-0000-0000-000000000004') as id`);
  assert.equal(warehouseDeliveryReplay.id, warehouseDelivery.id, "delivery creation replays one entity and one reservation");
  let overReservationRejected = false;
  try {
    await queryRows(`select public.reserve_inventory('${warehouseSalesLine}', '75000000-0000-0000-0000-000000000001',
      500, 'a1000000-0000-0000-0000-000000000005')`);
  } catch { overReservationRejected = true; }
  assert.equal(overReservationRejected, true, "active reservations cannot oversubscribe warehouse availability");
  const [reservedPosition] = await queryRows(`select on_hand_base_quantity, reserved_base_quantity, available_base_quantity
    from public.warehouse_inventory_read where warehouse_id = '75000000-0000-0000-0000-000000000001'
      and material_id = '72000000-0000-0000-0000-000000000001'`);
  assert.deepEqual(
    [reservedPosition.on_hand_base_quantity, reservedPosition.reserved_base_quantity, reservedPosition.available_base_quantity],
    ["1000.000000", "600.000000", "400.000000"],
    "reservation reduces available but not on-hand",
  );
  const [assignment] = await queryRows(`select public.assign_delivery('${warehouseDelivery.id}',
    '30000000-0000-0000-0000-000000000001', '75000000-0000-0000-0000-000000000002', null, null, 1,
    'a1000000-0000-0000-0000-000000000006') as id`);
  const [assignmentReplay] = await queryRows(`select public.assign_delivery('${warehouseDelivery.id}',
    '30000000-0000-0000-0000-000000000001', '75000000-0000-0000-0000-000000000002', null, null, 1,
    'a1000000-0000-0000-0000-000000000006') as id`);
  assert.equal(assignmentReplay.id, assignment.id, "assignment replay survives the version change it caused");
  const [handoff] = await queryRows(`select public.handoff_delivery('${warehouseDelivery.id}', 2,
    '2026-09-12T10:30:00Z', 'a1000000-0000-0000-0000-000000000007') as id`);
  const [handoffReplay] = await queryRows(`select public.handoff_delivery('${warehouseDelivery.id}', 2,
    '2026-09-12T10:30:00Z', 'a1000000-0000-0000-0000-000000000007') as id`);
  assert.equal(handoffReplay.id, handoff.id, "handoff replay does not move stock twice");
  const [{ transit: transitAfterHandoff, warehouse: warehouseAfterHandoff }] = await queryRows(`select
    (select sum(base_quantity_delta::numeric)::text from public.inventory_movement_read where delivery_id = '${warehouseDelivery.id}') as transit,
    (select on_hand_base_quantity from public.warehouse_inventory_read where warehouse_id = '75000000-0000-0000-0000-000000000001' and material_id = '72000000-0000-0000-0000-000000000001') as warehouse`);
  assert.deepEqual([transitAfterHandoff, warehouseAfterHandoff], ["600.000000", "400.000000"], "handoff transfers custody without changing total owned quantity");
  await queryRows(`select public.mark_delivery_arrived('${warehouseDelivery.id}', 3, 'a1000000-0000-0000-0000-000000000008')`);
  const [{ id: warehouseDeliveryLine }] = await queryRows(`select id from public.delivery_lines where delivery_id = '${warehouseDelivery.id}'`);
  const [warehouseResult] = await queryRows(`select public.submit_delivery_result('${warehouseDelivery.id}', 'PARTIAL',
    '[{"delivery_line_id":"${warehouseDeliveryLine}","actual_base_quantity":"500"}]'::jsonb,
    'Chị Lan', 'Thiếu 100 kg trên xe', null, null, 4, 'a1000000-0000-0000-0000-000000000009') as id`);
  const [warehouseVerification] = await queryRows(`select public.verify_delivery('${warehouseResult.id}',
    '[{"delivery_line_id":"${warehouseDeliveryLine}","accepted_base_quantity":"480","billable_base_quantity":"470","billing_variance_reason":"Khách chỉ chấp nhận tính tiền 470 kg"}]'::jsonb,
    5, 'a1000000-0000-0000-0000-000000000010') as id`);
  const [warehouseVerificationReplay] = await queryRows(`select public.verify_delivery('${warehouseResult.id}',
    '[{"delivery_line_id":"${warehouseDeliveryLine}","accepted_base_quantity":"480","billable_base_quantity":"470","billing_variance_reason":"Khách chỉ chấp nhận tính tiền 470 kg"}]'::jsonb,
    5, 'a1000000-0000-0000-0000-000000000010') as id`);
  assert.equal(warehouseVerificationReplay.id, warehouseVerification.id, "delivery verification replay does not duplicate AR/revenue/cost");
  const [{ id: warehouseVerificationLine }] = await queryRows(`select id from public.delivery_verification_lines where delivery_verification_id = '${warehouseVerification.id}'`);
  const [{ original_amount_vnd: warehouseAr }] = await queryRows(`select original_amount_vnd from public.receivable_obligations where delivery_verification_id = '${warehouseVerification.id}'`);
  assert.equal(warehouseAr.toString(), "1410000", "billable quantity creates exact source-linked receivable");
  const [{ amount_delta_vnd: warehouseCost }] = await queryRows(`select amount_delta_vnd from public.direct_cost_entries where delivery_verification_id = '${warehouseVerification.id}'`);
  assert.equal(warehouseCost.toString(), "1200000", "accepted warehouse quantity records MWA cost once");

  const [remainderCase] = await queryRows(`select public.open_return_case('${warehouseVerificationLine}', 'TRANSIT_REMAINDER', 100,
    'Phần còn lại trả kho', null, 'a2000000-0000-0000-0000-000000000001') as id`);
  await queryRows(`select public.resolve_return_case('${remainderCase.id}', 'RETURNED',
    '75000000-0000-0000-0000-000000000001', 'Kho đã kiểm nhận phần còn lại', null, 1,
    'a2000000-0000-0000-0000-000000000002')`);
  const [lossCase] = await queryRows(`select public.open_return_case('${warehouseVerificationLine}', 'TRANSIT_LOSS', 20,
    'Hao hụt có biên bản', null, 'a2000000-0000-0000-0000-000000000003') as id`);
  await queryRows(`select public.resolve_return_case('${lossCase.id}', 'LOSS_APPROVED', null,
    'Quản lý duyệt biên bản hao hụt', null, 1, 'a2000000-0000-0000-0000-000000000004')`);
  const [{ transit: transitAfterResolution }] = await queryRows(`select coalesce(sum(base_quantity_delta), 0)::text as transit
    from (select base_quantity_delta::numeric as base_quantity_delta from public.inventory_movement_read where delivery_id = '${warehouseDelivery.id}') movement`);
  assert.equal(transitAfterResolution, "0.000000", "verified, returned, and lost quantities fully reconcile transit custody");

  const [stockCount] = await queryRows(`select public.open_stock_count('20000000-0000-0000-0000-000000000001',
    '75000000-0000-0000-0000-000000000001', now(), 'a3000000-0000-0000-0000-000000000001') as id`);
  const [countLine] = await queryRows(`select public.record_stock_count_line('${stockCount.id}',
    '72000000-0000-0000-0000-000000000001', 490, 2500, 'Thiếu 10 kg theo biên bản', null, 1,
    'a3000000-0000-0000-0000-000000000002') as id`);
  const [countLineReplay] = await queryRows(`select public.record_stock_count_line('${stockCount.id}',
    '72000000-0000-0000-0000-000000000001', 490, 2500, 'Thiếu 10 kg theo biên bản', null, 1,
    'a3000000-0000-0000-0000-000000000002') as id`);
  assert.equal(countLineReplay.id, countLine.id, "count line replay survives count version increment");
  await queryRows(`select public.approve_stock_count('${stockCount.id}', 2, 'a3000000-0000-0000-0000-000000000003')`);
  const [{ on_hand_base_quantity: countedOnHand }] = await queryRows(`select on_hand_base_quantity from public.warehouse_inventory_read
    where warehouse_id = '75000000-0000-0000-0000-000000000001' and material_id = '72000000-0000-0000-0000-000000000001'`);
  assert.equal(countedOnHand, "490.000000", "stock count approval appends the exact variance movement");

  await database.exec("reset role; update public.customers set credit_limit_vnd = 30000000 where id = '50000000-0000-0000-0000-000000000001'; set role authenticated");
  await queryRows(`select public.confirm_sales_order('${overflowOrder.id}', 'a4000000-0000-0000-0000-000000000001')`);
  await queryRows(`select public.confirm_purchase_order('${directPurchase.id}', 'a4000000-0000-0000-0000-000000000002')`);
  const [{ count: movementCountBeforeDirect }] = await queryRows("select count(*)::int as count from public.inventory_movement_read");
  const [supplierFulfillment] = await queryRows(`select public.verify_supplier_fulfillment('${directPurchase.id}',
    '[{"purchase_order_line_id":"${(await queryRows(`select id from public.purchase_order_line_read where purchase_order_id = '${directPurchase.id}'`))[0].id}","supplier_quantity":"0.5"}]'::jsonb,
    null, 'NCC-GIAO-001', 'a4000000-0000-0000-0000-000000000003') as id`);
  const [supplierFulfillmentReplay] = await queryRows(`select public.verify_supplier_fulfillment('${directPurchase.id}',
    '[{"purchase_order_line_id":"${(await queryRows(`select id from public.purchase_order_line_read where purchase_order_id = '${directPurchase.id}'`))[0].id}","supplier_quantity":"0.5"}]'::jsonb,
    null, 'NCC-GIAO-001', 'a4000000-0000-0000-0000-000000000003') as id`);
  assert.equal(supplierFulfillmentReplay.id, supplierFulfillment.id, "supplier fulfillment replay does not duplicate AP or direct cost");
  const [{ id: directAllocation }] = await queryRows(`select id from public.supply_allocations where purchase_order_line_id in
    (select id from public.purchase_order_line_read where purchase_order_id = '${directPurchase.id}') and supply_mode = 'SUPPLIER_DIRECT'`);
  const [directDelivery] = await queryRows(`select public.create_delivery_from_allocation('${directAllocation}', 500,
    current_date + 1, 'a4000000-0000-0000-0000-000000000004') as id`);
  await queryRows(`select public.assign_delivery('${directDelivery.id}', null, null, 'Xe nhà cung cấp', '0900000000', 1,
    'a4000000-0000-0000-0000-000000000005')`);
  await queryRows(`select public.handoff_delivery('${directDelivery.id}', 2, '2026-09-12T11:00:00Z',
    'a4000000-0000-0000-0000-000000000006')`);
  await queryRows(`select public.mark_delivery_arrived('${directDelivery.id}', 3,
    'a4000000-0000-0000-0000-000000000007')`);
  const [{ id: directDeliveryLine }] = await queryRows(`select id from public.delivery_lines where delivery_id = '${directDelivery.id}'`);
  const [directResult] = await queryRows(`select public.submit_delivery_result('${directDelivery.id}', 'PARTIAL',
    '[{"delivery_line_id":"${directDeliveryLine}","actual_base_quantity":"450"}]'::jsonb,
    'Anh Minh', 'Khách nhận 450 kg', null, null, 4, 'a4000000-0000-0000-0000-000000000008') as id`);
  const [directVerification] = await queryRows(`select public.verify_delivery('${directResult.id}',
    '[{"delivery_line_id":"${directDeliveryLine}","accepted_base_quantity":"430","billable_base_quantity":"420","billing_variance_reason":"Khách duyệt tính tiền 420 kg"}]'::jsonb,
    5, 'a4000000-0000-0000-0000-000000000009') as id`);
  const [{ count: movementCountAfterDirect }] = await queryRows("select count(*)::int as count from public.inventory_movement_read");
  assert.equal(movementCountAfterDirect, movementCountBeforeDirect, "supplier-direct fulfillment and delivery create no fake inventory movement");
  const [directFacts] = await queryRows(`select
    (select original_amount_vnd from public.payable_obligations where supplier_fulfillment_id = '${supplierFulfillment.id}') as supplier_payable,
    (select original_amount_vnd from public.receivable_obligations where delivery_verification_id = '${directVerification.id}') as customer_receivable`);
  assert.deepEqual([directFacts.supplier_payable.toString(), directFacts.customer_receivable.toString()], ["1250000", "1260000"], "supplier and customer verified quantities remain independent facts");

  const [financeAccount] = await queryRows(`select public.create_finance_account(
    '20000000-0000-0000-0000-000000000001', 'CASH_MAIN', 'Quỹ tiền mặt chính', 'CASH',
    'b7000000-0000-0000-0000-000000000001') as id`);
  const receivablesBefore = await queryRows(`select id, outstanding_amount_vnd
    from public.receivable_read
    where branch_id = '20000000-0000-0000-0000-000000000001'
      and customer_id = '50000000-0000-0000-0000-000000000001'
      and outstanding_amount_vnd >= 500000
    order by recorded_at
    limit 2`);
  assert.equal(receivablesBefore.length, 2, "finance fixture must expose two customer obligations for multi-allocation");
  const allocationPayload = JSON.stringify(receivablesBefore.map((item) => ({ obligation_id: item.id, amount_vnd: 500000 })));
  const revenueBeforePayment = (await queryRows("select coalesce(sum(amount_vnd), 0)::bigint as amount from public.revenue_entries"))[0].amount;
  const [postedReceipt] = await queryRows(`select public.post_payment(
    '20000000-0000-0000-0000-000000000001', 'RECEIPT',
    '50000000-0000-0000-0000-000000000001', null, '${financeAccount.id}', 2000000,
    '2026-09-12T12:00:00Z', 'CASH', 'THU-MULTI-001', '${allocationPayload}'::jsonb, 250000,
    'b7000000-0000-0000-0000-000000000002') as id`);
  const [postedReceiptReplay] = await queryRows(`select public.post_payment(
    '20000000-0000-0000-0000-000000000001', 'RECEIPT',
    '50000000-0000-0000-0000-000000000001', null, '${financeAccount.id}', 2000000,
    '2026-09-12T12:00:00Z', 'CASH', 'THU-MULTI-001', '${allocationPayload}'::jsonb, 250000,
    'b7000000-0000-0000-0000-000000000002') as id`);
  assert.equal(postedReceiptReplay.id, postedReceipt.id, "payment replay returns the committed payment");
  const [receiptPosition] = await queryRows(`select allocated_amount_vnd, advance_amount_vnd, unallocated_amount_vnd
    from public.payment_read where id = '${postedReceipt.id}'`);
  assert.deepEqual(
    [receiptPosition.allocated_amount_vnd.toString(), receiptPosition.advance_amount_vnd.toString(), receiptPosition.unallocated_amount_vnd.toString()],
    ["1000000", "250000", "750000"],
    "payment allocation, advance, and unallocated positions remain distinct",
  );
  const receivablesAfterPayment = await queryRows(`select id, outstanding_amount_vnd from public.receivable_read
    where id = any(array['${receivablesBefore[0].id}'::uuid, '${receivablesBefore[1].id}'::uuid]) order by id`);
  const beforeOutstanding = receivablesBefore.reduce((total, item) => total + BigInt(item.outstanding_amount_vnd), 0n);
  const afterOutstanding = receivablesAfterPayment.reduce((total, item) => total + BigInt(item.outstanding_amount_vnd), 0n);
  assert.equal(beforeOutstanding - afterOutstanding, 1000000n, "multi-allocation reduces exact target outstanding only");
  const revenueAfterPayment = (await queryRows("select coalesce(sum(amount_vnd), 0)::bigint as amount from public.revenue_entries"))[0].amount;
  assert.equal(revenueAfterPayment.toString(), revenueBeforePayment.toString(), "receipt changes cash and AR, never revenue");

  let paymentPayloadConflictRejected = false;
  try {
    await queryRows(`select public.post_payment(
      '20000000-0000-0000-0000-000000000001', 'RECEIPT',
      '50000000-0000-0000-0000-000000000001', null, '${financeAccount.id}', 2000001,
      '2026-09-12T12:00:00Z', 'CASH', 'THU-MULTI-001', '${allocationPayload}'::jsonb, 250000,
      'b7000000-0000-0000-0000-000000000002')`);
  } catch { paymentPayloadConflictRejected = true; }
  assert.equal(paymentPayloadConflictRejected, true, "same payment operation rejects a different payload");

  const [reversal] = await queryRows(`select public.reverse_payment('${postedReceipt.id}', 'Khách yêu cầu hoàn tác phiếu thu sai',
    'b7000000-0000-0000-0000-000000000003') as id`);
  const [reversalFacts] = await queryRows(`select
    (select sum(cash_delta_vnd)::bigint from public.payment_read where id = any(array['${postedReceipt.id}'::uuid, '${reversal.id}'::uuid])) as cash_effect,
    (select posting_state from public.payment_read where id = '${postedReceipt.id}') as original_state,
    (select sum(outstanding_amount_vnd)::bigint from public.receivable_read where id = any(array['${receivablesBefore[0].id}'::uuid, '${receivablesBefore[1].id}'::uuid])) as restored_outstanding`);
  assert.deepEqual(
    [reversalFacts.cash_effect.toString(), reversalFacts.original_state, reversalFacts.restored_outstanding.toString()],
    ["0", "REVERSED", beforeOutstanding.toString()],
    "reversal appends inverse cash/allocation effects and restores outstanding",
  );

  const [supplierForExpense] = await queryRows(`select supplier_id from public.payable_read
    where branch_id = '20000000-0000-0000-0000-000000000001' limit 1`);
  const [expenseCategory] = await queryRows(`select public.create_expense_category(
    '20000000-0000-0000-0000-000000000001', 'ADMIN', 'Chi phí hành chính',
    'b7000000-0000-0000-0000-000000000004') as id`);
  const [expense] = await queryRows(`select public.create_expense(
    '20000000-0000-0000-0000-000000000001', '${expenseCategory.id}', '${supplierForExpense.supplier_id}',
    300000, '2026-09-12T12:30:00Z', '2026-09-20', 'Văn phòng phẩm tháng 9', 'ADMIN', null, null,
    'b7000000-0000-0000-0000-000000000005') as id`);
  const paymentsBeforeExpenseApproval = (await queryRows("select count(*)::int as count from public.payments"))[0].count;
  await queryRows(`select public.approve_expense('${expense.id}', 1, 'b7000000-0000-0000-0000-000000000006')`);
  await queryRows(`select public.approve_expense('${expense.id}', 1, 'b7000000-0000-0000-0000-000000000006')`);
  const [expenseFacts] = await queryRows(`select
    (select count(*)::int from public.payable_obligations where expense_id = '${expense.id}') as payable_count,
    (select count(*)::int from public.payments) as payment_count,
    (select approval_state from public.expenses where id = '${expense.id}') as approval_state`);
  assert.deepEqual(
    [expenseFacts.payable_count, expenseFacts.payment_count, expenseFacts.approval_state],
    [1, paymentsBeforeExpenseApproval, "APPROVED"],
    "expense approval creates one AP source and does not post cash",
  );

  const [supplierPayment] = await queryRows(`select public.post_payment(
    '20000000-0000-0000-0000-000000000001', 'DISBURSEMENT', null, '${supplierForExpense.supplier_id}',
    '${financeAccount.id}', 200000, '2026-09-12T13:00:00Z', 'BANK_TRANSFER', 'CHI-DOISOAT-001', '[]'::jsonb, 0,
    'b7000000-0000-0000-0000-000000000007') as id`);
  const cashBeforeReconciliation = (await queryRows("select sum(cash_delta_vnd)::bigint as amount from public.payment_read"))[0].amount;
  await queryRows(`select public.record_payment_reconciliation('${supplierPayment.id}', 100000,
    '2026-09-12T13:05:00Z', 'BANK-LINE-001', 'b7000000-0000-0000-0000-000000000008')`);
  const [reconciledPayment] = await queryRows(`select reconciliation_state, reconciliation_difference_vnd from public.payment_read where id = '${supplierPayment.id}'`);
  const cashAfterReconciliation = (await queryRows("select sum(cash_delta_vnd)::bigint as amount from public.payment_read"))[0].amount;
  assert.deepEqual(
    [reconciledPayment.reconciliation_state, reconciledPayment.reconciliation_difference_vnd.toString(), cashAfterReconciliation.toString()],
    ["PARTIAL", "100000", cashBeforeReconciliation.toString()],
    "reconciliation records matching state without posting money again",
  );

  const dashboardStarted = performance.now();
  const [dashboard] = await queryRows(`select public.finance_dashboard_snapshot(
    '20000000-0000-0000-0000-000000000001', '2026-09-01T00:00:00+07:00', '2026-10-01T00:00:00+07:00', now(),
    null, null, null, null) as snapshot`);
  const dashboardDurationMs = performance.now() - dashboardStarted;
  const dashboardPayloadBytes = Buffer.byteLength(JSON.stringify(dashboard.snapshot));
  assert.equal(dashboard.snapshot.revenue.value_vnd.toString(), revenueBeforePayment.toString(), "dashboard revenue remains sourced from verified business facts");
  assert.equal(dashboard.snapshot.operating_expense.value_vnd.toString(), "300000", "dashboard reads approved Opex once");

  const [{ id: serviceSiteId }] = await queryRows(`select id from public.customer_sites
    where customer_id = '50000000-0000-0000-0000-000000000001' limit 1`);
  const createService = (operationId, start, end) => `select public.create_service_job(
    '20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '${serviceSiteId}',
    'Vận hành máy', 'Vận hành máy theo ca đã chốt', '${start}', '${end}', 10, 'giờ',
    null, null, null, '${operationId}') as id`;
  const [serviceJob] = await queryRows(createService('c8000000-0000-0000-0000-000000000001', '2026-09-13T01:00:00Z', '2026-09-13T05:00:00Z'));
  const [serviceJobReplay] = await queryRows(createService('c8000000-0000-0000-0000-000000000001', '2026-09-13T01:00:00Z', '2026-09-13T05:00:00Z'));
  assert.equal(serviceJobReplay.id, serviceJob.id, "service creation replay returns one source job");
  const [collisionJob] = await queryRows(createService('c8000000-0000-0000-0000-000000000002', '2026-09-13T02:00:00Z', '2026-09-13T06:00:00Z'));
  const [workItem] = await queryRows(`select public.publish_work_item(
    '20000000-0000-0000-0000-000000000001', 'SERVICE_JOB', '${serviceJob.id}', 'POOL_CLAIM', null,
    'c8000000-0000-0000-0000-000000000003') as id`);
  const [collisionWork] = await queryRows(`select public.publish_work_item(
    '20000000-0000-0000-0000-000000000001', 'SERVICE_JOB', '${collisionJob.id}', 'POOL_CLAIM', null,
    'c8000000-0000-0000-0000-000000000004') as id`);
  const [claim] = await queryRows(`select public.claim_work_item('${workItem.id}', 1,
    'c8000000-0000-0000-0000-000000000005') as id`);
  const [claimReplay] = await queryRows(`select public.claim_work_item('${workItem.id}', 1,
    'c8000000-0000-0000-0000-000000000005') as id`);
  assert.equal(claimReplay.id, claim.id, "claim replay survives the state/version change it caused");
  let collisionRejected = false;
  try {
    await queryRows(`select public.claim_work_item('${collisionWork.id}', 1,
      'c8000000-0000-0000-0000-000000000006')`);
  } catch { collisionRejected = true; }
  assert.equal(collisionRejected, true, "overlapping work for the same employee is rejected under resource lock");

  await queryRows(`select public.start_work_item('${workItem.id}', 2,
    'c8000000-0000-0000-0000-000000000007')`);
  await queryRows(`select public.heartbeat_work_item('${workItem.id}', 'Vẫn đang làm, tiến độ bình thường',
    'c8000000-0000-0000-0000-000000000008')`);
  const arBeforeWorkerResult = (await queryRows("select count(*)::int as count from public.receivable_obligations"))[0].count;
  const [workResult] = await queryRows(`select public.submit_work_result('${workItem.id}', 10,
    'Đã hoàn thành theo log hiện trường', 'Khách A', null, 3,
    'c8000000-0000-0000-0000-000000000009') as id`);
  const arAfterWorkerResult = (await queryRows("select count(*)::int as count from public.receivable_obligations"))[0].count;
  assert.equal(arAfterWorkerResult, arBeforeWorkerResult, "worker DONE/result does not verify source or create AR");
  let staleResultRejected = false;
  try {
    await queryRows(`select public.submit_work_result('${workItem.id}', 10,
      'Offline payload cũ', 'Khách A', null, 3,
      'c8000000-0000-0000-0000-000000000010')`);
  } catch { staleResultRejected = true; }
  assert.equal(staleResultRejected, true, "offline stale result is rejected by expected version");

  const [serviceVerification] = await queryRows(`select public.verify_service_job('${serviceJob.id}', 8, 9,
    800000, '2026-09-20', 'Billable 8, compensable 9 theo biên bản', 3, 4,
    'c8000000-0000-0000-0000-000000000011') as id`);
  const [serviceVerificationReplay] = await queryRows(`select public.verify_service_job('${serviceJob.id}', 8, 9,
    800000, '2026-09-20', 'Billable 8, compensable 9 theo biên bản', 3, 4,
    'c8000000-0000-0000-0000-000000000011') as id`);
  assert.equal(serviceVerificationReplay.id, serviceVerification.id, "service verification replay creates one AR fact");
  const [serviceFacts] = await queryRows(`select
    (select original_amount_vnd from public.receivable_obligations where service_verification_id = '${serviceVerification.id}') as ar,
    (select actual_quantity from public.service_verifications where id = '${serviceVerification.id}') as actual,
    (select billable_quantity from public.service_verifications where id = '${serviceVerification.id}') as billable,
    (select compensable_quantity from public.service_verifications where id = '${serviceVerification.id}') as compensable`);
  assert.deepEqual([serviceFacts.ar.toString(), serviceFacts.actual, serviceFacts.billable, serviceFacts.compensable], ["800000", "10.000000", "8.000000", "9.000000"], "service actual, billable, compensable, and AR remain separate exact facts");

  const [compRule] = await queryRows(`select public.create_compensation_rule(
    '20000000-0000-0000-0000-000000000001', 'SERVICE_UNIT', 'Công dịch vụ theo đơn vị', null,
    'PER_UNIT', 'FIXED_PER_BASIS', 50000, null, 'DIRECT_LABOR', '2026-01-01', null,
    'c8000000-0000-0000-0000-000000000012') as id`);
  const [earning] = await queryRows(`select public.calculate_earning_event('${compRule.id}',
    'SERVICE_VERIFICATION', '${serviceVerification.id}', 'c8000000-0000-0000-0000-000000000013') as id`);
  const [earningReplay] = await queryRows(`select public.calculate_earning_event('${compRule.id}',
    'SERVICE_VERIFICATION', '${serviceVerification.id}', 'c8000000-0000-0000-0000-000000000013') as id`);
  assert.equal(earningReplay.id, earning.id, "earning calculation replay keeps one source/rule event");
  await queryRows(`select public.approve_earning_event('${earning.id}', 450000, '2026-09-20', 1,
    'c8000000-0000-0000-0000-000000000014')`);
  const [{ id: earningPayable }] = await queryRows(`select id from public.payable_obligations where earning_event_id = '${earning.id}'`);
  const [employeePayment] = await queryRows(`select public.post_payment(
    '20000000-0000-0000-0000-000000000001', 'DISBURSEMENT', null, null, '${financeAccount.id}', 200000,
    '2026-09-13T06:00:00Z', 'BANK_TRANSFER', 'PAYROLL-SERVICE-001',
    '[{"obligation_id":"${earningPayable}","amount_vnd":200000}]'::jsonb, 0,
    'c8000000-0000-0000-0000-000000000015', '30000000-0000-0000-0000-000000000001') as id`);
  const [earningPaymentFacts] = await queryRows(`select
    (select outstanding_amount_vnd from public.payable_read where id = '${earningPayable}') as outstanding,
    (select employee_id from public.payment_read where id = '${employeePayment.id}') as employee_id,
    (select calculated_amount_vnd from public.earning_events where id = '${earning.id}') as calculated`);
  assert.deepEqual([earningPaymentFacts.outstanding.toString(), earningPaymentFacts.employee_id, earningPaymentFacts.calculated.toString()], ["250000", "30000000-0000-0000-0000-000000000001", "450000"], "approved earning creates employee AP and payment only settles the allocated amount");

  const [serviceDashboard] = await queryRows(`select public.finance_dashboard_snapshot(
    '20000000-0000-0000-0000-000000000001', '2026-09-01T00:00:00+07:00', '2026-10-01T00:00:00+07:00', now(),
    null, null, null, 'SERVICE') as snapshot`);
  const [peopleDashboard] = await queryRows(`select public.finance_dashboard_snapshot(
    '20000000-0000-0000-0000-000000000001', '2026-09-01T00:00:00+07:00', '2026-10-01T00:00:00+07:00', now(),
    null, null, null, null) as snapshot`);
  assert.deepEqual([serviceDashboard.snapshot.revenue.value_vnd.toString(), peopleDashboard.snapshot.salary_payable.value_vnd.toString(), peopleDashboard.snapshot.commission_payable.value_vnd.toString()], ["800000", "250000", "0"], "dashboard reads verified service revenue and approved outstanding compensation without ad hoc commission");
  let resultMutationRejected = false;
  try { await queryRows(`update public.work_item_results set actual_quantity = 11 where id = '${workResult.id}'`); }
  catch { resultMutationRejected = true; }
  assert.equal(resultMutationRejected, true, "submitted worker result is append-only");

  const [workerJobPayload] = await queryRows(
    "select public.worker_portal_job('" + workItem.id + "') as job",
  );
  assert.deepEqual(
    [workerJobPayload.job.id, workerJobPayload.job.number, workerJobPayload.job.customer_name],
    [workItem.id, workerJobPayload.job.number, "Khách A"],
    "worker portal exposes only an authorized safe job payload",
  );
  await database.exec(
    "select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', false);",
  );
  let crossWorkerJobRejected = false;
  try {
    await queryRows("select public.worker_portal_job('" + workItem.id + "')");
  } catch {
    crossWorkerJobRejected = true;
  }
  assert.equal(crossWorkerJobRejected, true, "worker portal denies another branch job by direct RPC");

  await database.exec([
    "reset role;",
    "update public.employee_branch_access set active = false, revoked_at = now()",
    "where employee_id = '30000000-0000-0000-0000-000000000001'",
    "and branch_id = '20000000-0000-0000-0000-000000000001';",
    "set role authenticated;",
    "select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);",
  ].join("\n"));
  let revokedWorkerRejected = false;
  try {
    await queryRows("select public.worker_portal_snapshot()");
  } catch {
    revokedWorkerRejected = true;
  }
  assert.equal(revokedWorkerRejected, true, "revoked branch access blocks the next worker portal request");

  await database.exec([
    "reset role;",
    "update public.employee_branch_access set active = true, revoked_at = null",
    "where employee_id = '30000000-0000-0000-0000-000000000001'",
    "and branch_id = '20000000-0000-0000-0000-000000000001';",
    "set role authenticated;",
    "select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', false);",
  ].join("\n"));
  const [receiverPortal] = await queryRows("select public.customer_portal_snapshot(null) as snapshot");
  assert.deepEqual(
    [receiverPortal.snapshot.membership_role, receiverPortal.snapshot.can_view_debt, receiverPortal.snapshot.debt],
    ["RECEIVER", false, null],
    "receiver gets delivery context without finance data",
  );

  await database.exec(
    "select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', false);",
  );
  const [ownerPortal] = await queryRows("select public.customer_portal_snapshot(null) as snapshot");
  assert.equal(ownerPortal.snapshot.can_view_debt, true, "owner can read its own debt snapshot");
  let crossCustomerPortalRejected = false;
  try {
    await queryRows("select public.customer_portal_snapshot('50000000-0000-0000-0000-000000000002')");
  } catch {
    crossCustomerPortalRejected = true;
  }
  assert.equal(crossCustomerPortalRejected, true, "client customer id cannot cross membership scope");

  const [portalEvidence] = await queryRows([
    "select public.create_portal_evidence(",
    "'PAYMENT_NOTICE', null, '50000000-0000-0000-0000-000000000001',",
    "'application/pdf', 1024, 'd9000000-0000-0000-0000-000000000001') as evidence",
  ].join("\n"));
  await queryRows([
    "select public.finalize_portal_evidence(",
    "'" + portalEvidence.evidence.id + "', '" + "a".repeat(64) + "', 1024,",
    "'d9000000-0000-0000-0000-000000000002')",
  ].join("\n"));
  await database.exec("reset role;");
  const paymentCountBeforeNotice = (
    await queryRows("select count(*)::int as count from public.payments")
  )[0].count;
  const outstandingQuery = [
    "select coalesce(sum((to_jsonb(r)->>'outstanding_amount_vnd')::bigint),0)::bigint as amount",
    "from public.receivable_read r",
    "where to_jsonb(r)->>'customer_id' = '50000000-0000-0000-0000-000000000001'",
  ].join("\n");
  const outstandingBeforeNotice = (await queryRows(outstandingQuery))[0].amount;
  await database.exec([
    "set role authenticated;",
    "select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', false);",
  ].join("\n"));
  const paymentNoticeSql = [
    "select public.submit_payment_notice(",
    "'50000000-0000-0000-0000-000000000001', '" + portalEvidence.evidence.id + "',",
    "500000, '2026-09-13', 'BANK-PORTAL-001',",
    "'Khách đã chuyển khoản và gửi để đối soát',",
    "'d9000000-0000-0000-0000-000000000003') as id",
  ].join("\n");
  const [paymentNotice] = await queryRows(paymentNoticeSql);
  const [paymentNoticeReplay] = await queryRows(paymentNoticeSql);
  assert.equal(paymentNoticeReplay.id, paymentNotice.id, "payment notice retry is idempotent");
  const [signableEvidence] = await queryRows(
    "select public.get_portal_evidence_for_signing('" + portalEvidence.evidence.id + "') as evidence",
  );
  assert.equal(
    signableEvidence.evidence.object_path,
    portalEvidence.evidence.object_path,
    "active member can request the private object path for short signing",
  );
  await database.exec("reset role;");
  const paymentCountAfterNotice = (
    await queryRows("select count(*)::int as count from public.payments")
  )[0].count;
  const outstandingAfterNotice = (await queryRows(outstandingQuery))[0].amount;
  assert.deepEqual(
    [paymentCountAfterNotice, outstandingAfterNotice.toString()],
    [paymentCountBeforeNotice, outstandingBeforeNotice.toString()],
    "payment notice neither posts cash nor reduces receivable outstanding",
  );
  await database.exec([
    "set role authenticated;",
    "select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', false);",
  ].join("\n"));

  const [r9PortalQuote] = await queryRows([
    "select current_revision_id from public.quotations",
    "where customer_id = '50000000-0000-0000-0000-000000000001'",
    "and current_revision_id is not null limit 1",
  ].join("\n"));
  const changeRequestSql = [
    "select public.request_quotation_change(",
    "'" + r9PortalQuote.current_revision_id + "',",
    "'Vui lòng điều chỉnh lại thời gian giao hàng',",
    "'d9000000-0000-0000-0000-000000000004') as id",
  ].join("\n");
  const [changeRequest] = await queryRows(changeRequestSql);
  const [changeRequestReplay] = await queryRows(changeRequestSql);
  assert.equal(
    changeRequestReplay.id,
    changeRequest.id,
    "quote change request binds and replays the exact current revision",
  );

  await database.exec(
    "select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);",
  );
  await queryRows([
    "select public.review_payment_notice('" + paymentNotice.id + "', 'ACCEPTED',",
    "'Chứng từ hợp lệ, chờ quy trình phiếu thu riêng', 1,",
    "'d9000000-0000-0000-0000-000000000005')",
  ].join("\n"));
  const [noticeReviewFacts] = await queryRows([
    "select",
    "(select review_state from public.payment_notices where id = '" + paymentNotice.id + "') as state,",
    "(select count(*)::int from public.payments) as payment_count,",
    "(" + outstandingQuery + ") as outstanding",
  ].join("\n"));
  assert.deepEqual(
    [noticeReviewFacts.state, noticeReviewFacts.payment_count, noticeReviewFacts.outstanding.toString()],
    ["ACCEPTED", paymentCountBeforeNotice, outstandingBeforeNotice.toString()],
    "notice review changes only review state and never financial ledgers",
  );

  await database.exec([
    "reset role;",
    "update public.customer_portal_memberships set active = false, revoked_at = now()",
    "where auth_user_id = '10000000-0000-0000-0000-000000000004'",
    "and customer_id = '50000000-0000-0000-0000-000000000001';",
    "set role authenticated;",
    "select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', false);",
  ].join("\n"));
  let revokedCustomerRejected = false;
  try {
    await queryRows("select public.customer_portal_snapshot(null)");
  } catch {
    revokedCustomerRejected = true;
  }
  assert.equal(revokedCustomerRejected, true, "revoked membership blocks the next portal request");
  let revokedEvidenceRejected = false;
  try {
    await queryRows(
      "select public.get_portal_evidence_for_signing('" + portalEvidence.evidence.id + "')",
    );
  } catch {
    revokedEvidenceRejected = true;
  }
  assert.equal(revokedEvidenceRejected, true, "revoked membership cannot mint another signed evidence URL");
  await database.exec([
    "reset role;",
    "update public.customer_portal_memberships set active = true, revoked_at = null",
    "where auth_user_id = '10000000-0000-0000-0000-000000000004'",
    "and customer_id = '50000000-0000-0000-0000-000000000001';",
    "set role authenticated;",
    "select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);",
  ].join("\n"));

  await database.exec(`reset role;
    update public.finance_accounts set active = false where id = '${financeAccount.id}';
    update public.expense_categories set active = false where id = '${expenseCategory.id}';
    set role authenticated;
    select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);`);
  const [receiptAfterAccountDeactivation] = await queryRows(`select public.post_payment(
    '20000000-0000-0000-0000-000000000001', 'RECEIPT',
    '50000000-0000-0000-0000-000000000001', null, '${financeAccount.id}', 2000000,
    '2026-09-12T12:00:00Z', 'CASH', 'THU-MULTI-001', '${allocationPayload}'::jsonb, 250000,
    'b7000000-0000-0000-0000-000000000002') as id`);
  const [expenseAfterCategoryDeactivation] = await queryRows(`select public.create_expense(
    '20000000-0000-0000-0000-000000000001', '${expenseCategory.id}', '${supplierForExpense.supplier_id}',
    300000, '2026-09-12T12:30:00Z', '2026-09-20', 'Văn phòng phẩm tháng 9', 'ADMIN', null, null,
    'b7000000-0000-0000-0000-000000000005') as id`);
  assert.deepEqual(
    [receiptAfterAccountDeactivation.id, expenseAfterCategoryDeactivation.id],
    [postedReceipt.id, expense.id],
    "committed command replay remains stable after referenced master data is deactivated",
  );

  let movementMutationRejected = false;
  try { await database.exec("reset role; update public.inventory_movements set base_quantity_delta = 1 where movement_type = 'PURCHASE_RECEIPT'"); } catch { movementMutationRejected = true; }
  assert.equal(movementMutationRejected, true, "inventory movement ledger is append-only");

  console.info(`R7 dashboard local sample: ${dashboardDurationMs.toFixed(2)} ms, ${dashboardPayloadBytes} bytes.`);
  console.info("Isolated PostgreSQL checks passed: R2 access through R9 worker/customer portal and payment-notice invariants.");
} finally {
  await database.close();
}
