import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { argumentsForRun, openQA, stockFixture, salesFixture } from "./native-fixture.mjs";

const args = argumentsForRun();
const personas = JSON.parse(await readFile(args.personas, "utf8"));
const observer = await openQA(args), left = await openQA(args), right = await openQA(args);
const f = observer.fixtures;
try {
  const context = await observer.sql.begin(async (tx) => {
    const stock = await stockFixture(tx, observer);
    const sales = await salesFixture(tx, observer, stock);
    const allocation = await observer.rpc(tx, "upsert_supply_allocation", [sales.line, "WAREHOUSE", null, f.warehouse, "45", null, null, randomUUID()]);
    const results = [];
    for (let i = 0; i < 2; i++) {
      const d = await observer.rpc(tx, "create_delivery_from_allocations", [sales.so, [{ supply_allocation_id: allocation, planned_base_quantity: "15.000003" }], new Date().toISOString(), randomUUID()]);
      const [line] = await tx`select id from public.delivery_lines where delivery_id=${d}`;
      await observer.rpc(tx, "assign_delivery", [d, null, null, "Nhà xe QA", "000", 1, randomUUID()]);
      await observer.rpc(tx, "handoff_delivery", [d, 2, new Date().toISOString(), randomUUID()]);
      await observer.rpc(tx, "mark_delivery_arrived", [d, 3, randomUUID()]);
      const result = await observer.rpc(tx, "submit_delivery_result", [d, "FULL", [{ delivery_line_id: line.id, actual_base_quantity: "15.000003" }], "Người nhận QA", "", null, null, 4, randomUUID()]);
      results.push({ result, lines: [{ delivery_line_id: line.id, accepted_base_quantity: "15.000003", billable_base_quantity: "15.000003", billing_variance_reason: "" }] });
    }
    return { sales, results };
  });
  let release, ready, secondReady;
  const held = new Promise((resolve) => { release = resolve; });
  const started = new Promise((resolve) => { ready = resolve; });
  const secondStarted = new Promise((resolve) => { secondReady = resolve; });
  const first = left.sql.begin(async (tx) => {
    const [{ pid }] = await tx`select pg_backend_pid() pid`;
    const id = await left.rpc(tx, "verify_delivery", [context.results[0].result, context.results[0].lines, 5, randomUUID()], f.owner);
    ready({ pid, id });
    await held;
    return id;
  });
  const a = await started;
  const second = right.sql.begin(async (tx) => {
    const [{ pid }] = await tx`select pg_backend_pid() pid`;
    secondReady(pid);
    return right.rpc(tx, "verify_delivery", [context.results[1].result, context.results[1].lines, 5, randomUUID()], personas.personas.warehouse.subject);
  });
  const b = await secondStarted;
  assert.notEqual(a.pid, b);
  let blockers = [];
  try {
    for (let n = 0; n < 250; n++) {
      const [row] = await observer.sql`select pg_blocking_pids(${b}) blockers`;
      blockers = row.blockers;
      if (blockers.includes(a.pid)) break;
      await delay(20);
    }
    assert.ok(blockers.includes(a.pid));
  } finally { release(); }
  const ids = await Promise.all([first, second]);
  const amounts = await observer.sql`select original_amount_vnd::text amount from public.receivable_obligations where delivery_verification_id in(${ids[0]},${ids[1]}) order by original_amount_vnd`;
  assert.deepEqual(amounts.map((row) => row.amount), ["3450000", "3450001"]);
  const [facts] = await observer.sql`select sum(amount_vnd)::text revenue,count(*)::int effects from public.revenue_entries where sales_order_id=${context.sales.so}`;
  assert.deepEqual(facts, { revenue: "6900001", effects: 2 });
  await writeFile(args.out, JSON.stringify({ scope: "REAL_NATIVE_SOURCE_LINE_LOCK_RACE", database: args.database,
    status: "PASS_EXECUTED_CONCURRENT_BILLING", actorA: f.owner, actorB: personas.personas.warehouse.subject,
    pidA: a.pid, pidB: b, observedBlockingPids: blockers, amounts, facts,
    managedAuthTestedInRace: false, productionAccess: "NONE" }, null, 2));
  console.log(JSON.stringify({ status: "PASS_EXECUTED_CONCURRENT_BILLING", distinctPids: true, overlapObserved: true, facts }));
} finally { await left.sql.end({ timeout: 3 }); await right.sql.end({ timeout: 3 }); await observer.sql.end({ timeout: 3 }); }
