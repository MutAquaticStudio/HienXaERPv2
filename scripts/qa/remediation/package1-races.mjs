import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { argumentsForRun, openQA, salesFixture, stockFixture } from "./native-fixture.mjs";

const args = argumentsForRun();
assert.ok(args.personas);
const personas = JSON.parse(await readFile(args.personas, "utf8"));
const observer = await openQA(args), left = await openQA(args), right = await openQA(args);
const f = observer.fixtures;
const report = { scope: "NATIVE_DISTINCT_ACTORS_BACKENDS_OBSERVED_LOCK_OVERLAP", database: args.database,
  productionAccess: "NONE", managedAuthTestedInRace: false, checks: [] };
async function contend(name, first, second, expectedError, inspect) {
  let signalReady, release, signalSecond;
  const ready = new Promise((resolve) => { signalReady = resolve; });
  const hold = new Promise((resolve) => { release = resolve; });
  const secondReady = new Promise((resolve) => { signalSecond = resolve; });
  const firstTask = left.sql.begin(async (tx) => {
    const [{ pid }] = await tx`select pg_backend_pid() pid`;
    const value = await first(tx);
    signalReady({ pid, value });
    await hold;
    return value;
  });
  const firstState = await ready;
  const secondTask = right.sql.begin(async (tx) => {
    const [{ pid }] = await tx`select pg_backend_pid() pid`;
    signalSecond(pid);
    return second(tx);
  });
  const settled = Promise.allSettled([firstTask, secondTask]);
  const secondPid = await secondReady;
  assert.notEqual(firstState.pid, secondPid);
  let blockers = [];
  try {
    for (let attempt = 0; attempt < 250; attempt++) {
      const [row] = await observer.sql`select pg_blocking_pids(${secondPid}) blockers`;
      blockers = row.blockers;
      if (blockers.includes(firstState.pid)) break;
      await delay(20);
    }
    assert.ok(blockers.includes(firstState.pid), "Race must demonstrate real lock overlap");
  } finally { release(); }
  const results = await settled;
  assert.equal(results[0].status, "fulfilled");
  assert.equal(results[1].status, "rejected");
  assert.equal(results[1].reason.message, expectedError);
  const facts = await inspect();
  report.checks.push({ name, status: "PASS", actorA: f.owner, actorB: personas.personas.warehouse.subject,
    pidA: firstState.pid, pidB: secondPid, observedBlockingPids: blockers,
    secondError: { code: results[1].reason.code, message: results[1].reason.message }, facts });
}
try {
  const double = await observer.sql.begin(async (tx) => {
    const stock = await stockFixture(tx, observer);
    const count = await observer.rpc(tx, "open_stock_count", [f.branch, f.warehouse, stock.cutoff, randomUUID()]);
    const line = await observer.rpc(tx, "record_stock_count_line", [count, stock.material, "15", "150000", "QA kiểm kê cạnh tranh", null, 1, randomUUID()]);
    return { stock, count, line };
  });
  const operationA = randomUUID(), operationB = randomUUID();
  await contend("T28_TWO_DISTINCT_APPROVERS", (tx) => left.rpc(tx, "approve_stock_count", [double.count, 2, operationA], f.owner),
    (tx) => right.rpc(tx, "approve_stock_count", [double.count, 2, operationB], personas.personas.warehouse.subject),
    "stock_count_not_approvable", async () => {
      const [facts] = await observer.sql`select (select count(*)::int from public.inventory_movements where source_stock_count_line_id=${double.line}) adjustments,
        (select sum(base_quantity_delta)::text from public.inventory_movements where material_id=${double.stock.material} and warehouse_id=${f.warehouse}) qty,
        (select count(*)::int from public.audit_events where trace_id in(${operationA},${operationB})) audit`;
      assert.deepEqual(facts, { adjustments: 1, qty: "15.000000", audit: 1 });
      return facts;
    });
  const handoff = await observer.sql.begin(async (tx) => {
    const stock = await stockFixture(tx, observer);
    const count = await observer.rpc(tx, "open_stock_count", [f.branch, f.warehouse, stock.cutoff, randomUUID()]);
    const line = await observer.rpc(tx, "record_stock_count_line", [count, stock.material, "15", "150000", "QA kiểm kê trước xuất", null, 1, randomUUID()]);
    const sales = await salesFixture(tx, observer, stock);
    const allocation = await observer.rpc(tx, "upsert_supply_allocation", [sales.line, "WAREHOUSE", null, f.warehouse, "45", null, null, randomUUID()]);
    const delivery = await observer.rpc(tx, "create_delivery_from_allocations", [sales.so, [{ supply_allocation_id: allocation, planned_base_quantity: "45" }], new Date().toISOString(), randomUUID()]);
    await observer.rpc(tx, "assign_delivery", [delivery, null, null, "Nhà xe QA", "000", 1, randomUUID()]);
    return { stock, count, line, delivery };
  });
  await contend("T28_COUNT_APPROVAL_OVERLAPS_WAREHOUSE_HANDOFF", (tx) => left.rpc(tx, "handoff_delivery", [handoff.delivery, 2, new Date().toISOString(), randomUUID()], f.owner),
    (tx) => right.rpc(tx, "approve_stock_count", [handoff.count, 2, randomUUID()], personas.personas.warehouse.subject),
    "stock_count_basis_changed_recount_required", async () => {
      const [facts] = await observer.sql`select (select state from public.stock_counts where id=${handoff.count}) state,
        (select count(*)::int from public.inventory_movements where source_stock_count_line_id=${handoff.line}) adjustments,
        (select sum(base_quantity_delta)::text from public.inventory_movements where material_id=${handoff.stock.material} and warehouse_id=${f.warehouse}) qty,
        (select sum(base_quantity_delta)::text from public.inventory_movements where material_id=${handoff.stock.material} and delivery_id=${handoff.delivery} and location_kind='IN_TRANSIT') transit`;
      assert.deepEqual(facts, { state: "OPEN", adjustments: 0, qty: "0.000000", transit: "45.000000" });
      return facts;
    });
  report.status = "PASS_EXECUTED_TRUE_CONCURRENCY_SCOPE";
  await writeFile(args.out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, races: report.checks.length, distinctPids: true, blockingObserved: true }));
} finally { await left.sql.end({ timeout: 3 }); await right.sql.end({ timeout: 3 }); await observer.sql.end({ timeout: 3 }); }
