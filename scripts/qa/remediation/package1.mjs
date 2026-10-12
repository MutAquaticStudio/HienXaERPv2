import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { argumentsForRun, openQA, rejected, salesFixture, stockFixture } from "./native-fixture.mjs";

const args = argumentsForRun();
const qa = await openQA(args);
const { sql, fixtures: f, rpc } = qa;
const report = { scope: "NATIVE_CANONICAL_RPC_SQL_AUTH_FIXTURE", database: args.database,
  productionAccess: "NONE", managedAuthTested: false, checks: [] };
const rollback = new Error("ROLLBACK_TEST_FIXTURE");
async function caseInTransaction(name, test) {
  let prefix;
  try {
    await sql.begin(async (tx) => {
      const stock = await stockFixture(tx, qa);
      prefix = stock.prefix;
      const details = await test(tx, stock);
      report.checks.push({ name, status: "PASS", ...details });
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  const [remaining] = await sql`select count(*)::int n from public.materials where code=${prefix}`;
  assert.equal(remaining.n, 0);
}
async function countFor(tx, stock, quantity = "15") {
  const count = await rpc(tx, "open_stock_count", [f.branch, f.warehouse, stock.cutoff, randomUUID()]);
  const line = await rpc(tx, "record_stock_count_line", [count, stock.material, quantity, "150000", "QA đối chiếu thực đếm", null, 1, randomUUID()]);
  return { count, line };
}
try {
  await caseInTransaction("G01_STALE_COUNT_AFTER_HANDOFF", async (tx, stock) => {
    const { count } = await countFor(tx, stock);
    const sales = await salesFixture(tx, qa, stock);
    const allocation = await rpc(tx, "upsert_supply_allocation", [sales.line, "WAREHOUSE", null, f.warehouse, "45", null, null, randomUUID()]);
    const delivery = await rpc(tx, "create_delivery_from_allocations", [sales.so, [{ supply_allocation_id: allocation, planned_base_quantity: "45" }], new Date().toISOString(), randomUUID()]);
    await rpc(tx, "assign_delivery", [delivery, null, null, "Nhà xe QA", "000", 1, randomUUID()]);
    await rpc(tx, "handoff_delivery", [delivery, 2, new Date().toISOString(), randomUUID()]);
    const operation = randomUUID();
    const denial = await rejected(tx, (sp) => rpc(sp, "approve_stock_count", [count, 2, operation]), "stock_count_basis_changed_recount_required", "PT409");
    await tx.unsafe("set local role postgres");
    const [facts] = await tx`select sum(base_quantity_delta)::text qty,sum(inventory_value_delta_vnd)::text value
      from public.inventory_movements where material_id=${stock.material} and warehouse_id=${f.warehouse}`;
    const [state] = await tx`select state from public.stock_counts where id=${count}`;
    const [effects] = await tx`select (select count(*)::int from public.command_receipts where operation_id=${operation}) receipts,
      (select count(*)::int from public.audit_events where trace_id=${operation}) audit,
      (select count(*)::int from public.inventory_movements where source_stock_count_line_id in(select id from public.stock_count_lines where stock_count_id=${count})) movements`;
    assert.deepEqual(facts, { qty: "0.000000", value: "0" });
    assert.equal(state.state, "OPEN");
    assert.deepEqual(effects, { receipts: 0, audit: 0, movements: 0 });
    return { denial, facts, state: state.state, effects };
  });
  await caseInTransaction("G01_RECORDED_REVISIONS_VALID_APPROVAL_RETRY", async (tx, stock) => {
    const { count, line } = await countFor(tx, stock);
    const observationOperation = randomUUID();
    assert.equal(await rpc(tx, "record_stock_count_line", [count, stock.material, "20", "150000", "QA đếm lại phạm vi", null, 2, observationOperation]), line);
    assert.equal(await rpc(tx, "record_stock_count_line", [count, stock.material, "20", "150000", "QA đếm lại phạm vi", null, 2, observationOperation]), line);
    const operation = randomUUID();
    await rpc(tx, "approve_stock_count", [count, 3, operation]);
    await rpc(tx, "approve_stock_count", [count, 3, operation]);
    await tx.unsafe("set local role postgres");
    const observations = await tx`select counted_base_quantity::text qty from public.stock_count_observations where stock_count_line_id=${line} order by count_version`;
    assert.deepEqual(observations.map((row) => row.qty), ["15.000000", "20.000000"]);
    await rejected(tx, (sp) => sp`delete from public.stock_count_observations where stock_count_line_id=${line}`, null, "55000");
    const [facts] = await tx`select sum(base_quantity_delta)::text qty,sum(inventory_value_delta_vnd)::text value
      from public.inventory_movements where material_id=${stock.material} and warehouse_id=${f.warehouse}`;
    assert.deepEqual(facts, { qty: "20.000000", value: "3000000" });
    const [effects] = await tx`select (select count(*)::int from public.audit_events where trace_id=${operation}) audit,
      (select count(*)::int from public.inventory_movements where source_stock_count_line_id=${line}) movements`;
    assert.deepEqual(effects, { audit: 1, movements: 1 });
    return { observations, facts, effects };
  });
  await caseInTransaction("G01_RESERVED_QUANTITY_AND_FAILURE_ATOMICITY", async (tx, stock) => {
    const { count } = await countFor(tx, stock);
    const sales = await salesFixture(tx, qa, stock);
    const reservation = await rpc(tx, "reserve_inventory", [sales.line, f.warehouse, "30", randomUUID()]);
    const denial = await rejected(tx, (sp) => rpc(sp, "approve_stock_count", [count, 2, randomUUID()]), "stock_count_adjustment_below_reserved_or_on_hand", "23514");
    await rpc(tx, "release_inventory_reservation", [reservation, 1, "QA hết nhu cầu giữ", randomUUID()]);
    await rpc(tx, "approve_stock_count", [count, 2, randomUUID()]);
    return { denial, afterRelease: "APPROVED" };
  });
  await caseInTransaction("G01_G21_FAULT_AFTER_LEDGER_INSERT_ROLLS_BACK", async (tx, stock) => {
    const { count, line } = await countFor(tx, stock);
    await tx.unsafe("set local role postgres");
    // QA-only transactional trigger: proves the inserted row was visible before
    // the deliberate failure. Outer rollback removes both trigger and function.
    await tx.unsafe(`create function pg_temp.remediation_count_fault() returns trigger language plpgsql as $$
      begin
        if new.source_stock_count_line_id is not null then
          if not exists(select 1 from public.inventory_movements where id=new.id) then
            raise exception 'qa_fault_oracle_invalid';
          end if;
          raise exception 'qa_injected_stock_post_failure';
        end if;
        return new;
      end $$;
      create trigger remediation_count_test_fault after insert on public.inventory_movements
        for each row execute function pg_temp.remediation_count_fault();`).simple();
    const operation = randomUUID();
    const failure = await rejected(tx, (sp) => rpc(sp, "approve_stock_count", [count, 2, operation]), "qa_injected_stock_post_failure", "P0001");
    await tx.unsafe("set local role postgres");
    const [facts] = await tx`select (select state from public.stock_counts where id=${count}) state,
      (select count(*)::int from public.inventory_movements where source_stock_count_line_id=${line}) adjustments,
      (select count(*)::int from public.audit_events where trace_id=${operation}) audit,
      (select count(*)::int from public.command_receipts where operation_id=${operation}) receipts`;
    assert.deepEqual(facts, { state: "OPEN", adjustments: 0, audit: 0, receipts: 0 });
    return { failure, facts, faultInjectionScope: "TEMPORARY_QA_TRANSACTION_ONLY" };
  });
  await caseInTransaction("G05_RAW_COST_DENIED_SAFE_READER_AND_AUTHORIZED_COST", async (tx, stock) => {
    const sales = await salesFixture(tx, qa, stock);
    const allocation = await rpc(tx, "upsert_supply_allocation", [sales.line, "WAREHOUSE", null, f.warehouse, "45", null, null, randomUUID()]);
    const delivery = await rpc(tx, "create_delivery_from_allocations", [sales.so, [{ supply_allocation_id: allocation, planned_base_quantity: "15" }], new Date().toISOString(), randomUUID()]);
    const [line] = await tx`select id from public.delivery_lines where delivery_id=${delivery}`;
    await rpc(tx, "assign_delivery", [delivery, null, null, "Nhà xe QA", "000", 1, randomUUID()]);
    await rpc(tx, "handoff_delivery", [delivery, 2, new Date().toISOString(), randomUUID()]);
    await rpc(tx, "mark_delivery_arrived", [delivery, 3, randomUUID()]);
    const result = await rpc(tx, "submit_delivery_result", [delivery, "FULL", [{ delivery_line_id: line.id, actual_base_quantity: "15" }], "Người nhận QA", "", null, null, 4, randomUUID()]);
    const verification = await rpc(tx, "verify_delivery", [result, [{ delivery_line_id: line.id, accepted_base_quantity: "15", billable_base_quantity: "15", billing_variance_reason: "" }], 5, randomUUID()]);
    // Isolated SQL persona uses a real QA Auth subject. This grant is rolled back;
    // it does not change managed QA or Production permissions.
    await tx.unsafe("set local role postgres");
    const [readerRole] = await tx`select a.role_id from public.employee_branch_access a
      join public.employees e on e.id=a.employee_id where e.auth_user_id=${f.confirmer} and a.branch_id=${f.branch} and a.active`;
    await tx`insert into public.role_permissions(role_id,permission_code) values(${readerRole.role_id},'delivery.read') on conflict do nothing`;
    await qa.actor(tx, f.confirmer);
    const [permission] = await tx.unsafe("select private.has_permission($1,'delivery.read') delivery,private.has_permission($1,'inventory.cost.read') cost", [f.branch]);
    assert.equal(permission.delivery, true);
    assert.equal(permission.cost, false);
    await rejected(tx, (sp) => sp`select inventory_cost_vnd from public.delivery_verification_lines where delivery_verification_id=${verification}`, null, "42501");
    await rejected(tx, (sp) => sp`select inventory_value_vnd from public.delivery_handoff_lines where delivery_line_id=${line.id}`, null, "42501");
    const [safe] = await tx`select accepted_base_quantity,inventory_cost_vnd,inventory_unit_cost_vnd_per_base from public.delivery_verification_line_read where delivery_verification_id=${verification}`;
    assert.equal(safe.accepted_base_quantity, "15.000000");
    assert.equal(safe.inventory_cost_vnd, null);
    assert.equal(safe.inventory_unit_cost_vnd_per_base, null);
    await qa.actor(tx, f.owner);
    const [authorized] = await tx`select inventory_cost_vnd from public.delivery_verification_line_read where delivery_verification_id=${verification}`;
    assert.equal(authorized.inventory_cost_vnd, "2250000");
    return { readerSubject: f.confirmer, readerCostPermission: false, rawCostDenied: true, safe, authorizedCostVnd: authorized.inventory_cost_vnd };
  });
  report.status = "PASS_EXECUTED_DB_SCOPE";
  report.rolledBack = true;
  await writeFile(args.out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, rolledBack: true, managedAuthTested: false }));
} finally { await sql.end({ timeout: 3 }); }
