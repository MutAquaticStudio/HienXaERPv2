import assert from "node:assert/strict";
import { randomUUID, randomInt } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { realQAAuth } from "./auth.mjs";
import { argumentsForRun, openQA, stockFixture, salesFixture } from "./native-fixture.mjs";

const args = argumentsForRun(), qa = await openQA(args), { sql, rpc, fixtures: f } = qa;
const personas = JSON.parse(await readFile(args.personas, "utf8")).personas;
const auth = await realQAAuth(args["auth-env"], { owner: "hxqa-owner@example.test", warehouse: "hxqa-warehouse-dispatch@example.test" });
assert.equal(auth.accounts.owner.subject, f.owner);
assert.equal(auth.accounts.warehouse.subject, personas.warehouse.subject);
const key = randomInt(100000000, 2000000000);
let triggerInstalled = false, held = false, first, second;
const report = { scope: "G13_REAL_QA_AUTH_HTTP_VEHICLE_MUTEX_RACE", database: args.database,
  productionAccess: "NONE", managedQaBusinessWrites: 0, tokensRecorded: false };
try {
  const documents = await sql.begin(async tx => {
    const stock = await stockFixture(tx, qa, "60");
    const directSale = await salesFixture(tx, qa, stock), warehouseSale = await salesFixture(tx, qa, stock);
    const directPo = await rpc(tx, "create_direct_purchase_from_sales_line", [directSale.line, f.supplier, "60",
      { ...stock.common, unit_cost_vnd: "150000", purchase_price_rule_id: stock.cost,
        purchase_price_rule_version: 1, price_source_type: "CONTRACT" }, null, randomUUID()]);
    await rpc(tx, "confirm_purchase_order", [directPo, randomUUID()]);
    const [pol] = await tx`select id from public.purchase_order_lines where purchase_order_id=${directPo}`;
    await rpc(tx, "verify_supplier_fulfillment", [directPo, [{ purchase_order_line_id: pol.id, supplier_quantity: "60" }], null,
      "QA cargo race source", randomUUID()]);
    const [directAllocation] = await tx`select id from public.supply_allocations where purchase_order_line_id=${pol.id}`;
    const warehouseAllocation = await rpc(tx, "upsert_supply_allocation", [warehouseSale.line, "WAREHOUSE", null,
      f.warehouse, "60", null, null, randomUUID()]);
    const vehicle = randomUUID();
    await rpc(tx, "save_catalog_record", ["vehicles", vehicle, f.branch, { code: stock.prefix, plate_number: stock.prefix,
      capacity_quantity: "20", capacity_uom_id: stock.uom, capacity_source_note: "Hồ sơ sức chứa xe QA race", active: true }, null,
      "Xe riêng để kiểm tra hai actor có JWT thật", randomUUID()]);
    const [{ id: ownerEmployee }] = await tx`select id from public.employees where auth_user_id=${f.owner} and active`;
    const [{ slot }] = await tx`select count(*)::int slot from public.deliveries`;
    const docs = { branch: f.branch, vehicle, material: stock.material };
    for (const [name, sale, source, employee, offset] of [["first", directSale, directAllocation.id, personas.worker.employee, 0],
      ["second", warehouseSale, warehouseAllocation, ownerEmployee, 1]]) {
      const start = new Date(Date.UTC(2195, 0, 1) + (slot + offset) * 86400000).toISOString();
      const end = new Date(Date.parse(start) + 4 * 3600000).toISOString();
      const id = await rpc(tx, "create_delivery_from_allocations", [sale.so,
        [{ supply_allocation_id: source, planned_base_quantity: "15" }], start, randomUUID()]);
      const [line] = await tx`select id from public.delivery_lines where delivery_id=${id}`;
      await rpc(tx, "assign_delivery_scheduled", [id, employee, vehicle, "", "", 1, randomUUID(), start, end], personas.warehouse.subject);
      docs[name] = { delivery: id, line: line.id, employee, allocation: source, start, end };
    }
    return docs;
  });
  assert.notEqual(documents.first.employee, documents.second.employee);
  assert.notEqual(documents.first.allocation, documents.second.allocation);
  await sql`select pg_advisory_lock(${key}::bigint)`; held = true;
  await sql.unsafe(`create function pg_temp.hold_qa_cargo_race() returns trigger language plpgsql as $$
    begin perform pg_advisory_xact_lock(${key}::bigint);return new;end $$;
    create trigger qa_hold_cargo_race after insert on public.delivery_handoffs
     for each row when(new.delivery_id='${documents.first.delivery}'::uuid) execute function pg_temp.hold_qa_cargo_race();`).simple();
  triggerInstalled = true;
  const payload = d => ({ target_delivery_id: d.delivery, expected_version: 2, handed_off_at: new Date().toISOString(),
    operation_id: randomUUID(), loaded_lines: [{ delivery_line_id: d.line, loaded_base_quantity: "15" }] });
  const aPayload = payload(documents.first), bPayload = payload(documents.second);
  first = auth.api("owner", "rpc/handoff_delivery_actual", aPayload);
  let pidA;
  for (let n = 0; n < 300; n++) {
    const [row] = await sql`select pid from pg_locks where locktype='advisory' and not granted and objid=${key}`;
    if (row) { pidA = row.pid; break; }
    await delay(20);
  }
  assert.ok(pidA, "First real HTTP request must hold the vehicle and wait at the test latch");
  second = auth.api("warehouse", "rpc/handoff_delivery_actual", bPayload);
  let blocked;
  for (let n = 0; n < 300; n++) {
    const [row] = await sql`select pid,pg_blocking_pids(pid) blockers from pg_stat_activity
      where datname=${args.database} and ${pidA} = any(pg_blocking_pids(pid)) and query like '%handoff_delivery_actual%'`;
    if (row) { blocked = row; break; }
    await delay(20);
  }
  assert.ok(blocked, "Second actor must contend on the same vehicle, not a shared employee/source/warehouse");
  assert.notEqual(pidA, blocked.pid);
  await sql`select pg_advisory_unlock(${key}::bigint)`; held = false;
  const aResult = await first, bResult = await second;
  assert.equal(aResult.status, 200);
  assert.equal(bResult.status, 400);
  assert.equal(bResult.data.message, "vehicle_actual_cargo_capacity_exceeded");
  const [facts] = await sql`select
    (select count(*)::int from public.delivery_handoffs where delivery_id in(${documents.first.delivery},${documents.second.delivery})) handoffs,
    (select sum(h.moved_base_quantity)::text from public.delivery_handoff_lines h join public.delivery_lines l on l.id=h.delivery_line_id
      where l.delivery_id in(${documents.first.delivery},${documents.second.delivery})) loaded,
    (select count(*)::int from public.inventory_movements where delivery_id=${documents.first.delivery}) directSyntheticMovements,
    (select execution_state from public.deliveries where id=${documents.second.delivery}) rejectedState,
    (select count(*)::int from public.command_receipts where operation_id=${bPayload.operation_id}) rejectedReceipts,
    (select count(*)::int from public.audit_events where trace_id=${bPayload.operation_id}) rejectedAudits`;
  assert.deepEqual(facts, { handoffs: 1, loaded: "15.000000", directsyntheticmovements: 0,
    rejectedstate: "ASSIGNED", rejectedreceipts: 0, rejectedaudits: 0 });
  report.status = "PASS_REAL_AUTH_CARGO_RACE";
  Object.assign(report, { documents, actors: [auth.accounts.owner.subject, auth.accounts.warehouse.subject],
    pidA, pidB: blocked.pid, observedBlockingPids: blocked.blockers, firstStatus: aResult.status,
    secondStatus: bResult.status, secondError: bResult.data.message, facts });
  await writeFile(args.out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, distinctActors: true, distinctPids: true, overlapObserved: true, facts }));
} catch (error) {
  await writeFile(args.out.replace(/\.json$/, "-failure.json"), JSON.stringify({ ...report, status: "FAIL", error: error.message }, null, 2));
  throw error;
} finally {
  if (held) await sql`select pg_advisory_unlock(${key}::bigint)`;
  await Promise.allSettled([first, second].filter(Boolean));
  if (triggerInstalled) await sql.unsafe("drop trigger qa_hold_cargo_race on public.delivery_handoffs");
  await sql.end({ timeout: 3 });
}
