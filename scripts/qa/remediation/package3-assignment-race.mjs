import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { argumentsForRun, openQA, salesFixture, stockFixture } from "./native-fixture.mjs";

const args = argumentsForRun(), observer = await openQA(args), left = await openQA(args), right = await openQA(args);
const f = observer.fixtures, personas = JSON.parse(await readFile(args.personas, "utf8")).personas;
try {
  const docs = await observer.sql.begin(async tx => {
    const [{ slot }] = await tx`select count(*)::int slot from public.deliveries`;
    const start = new Date(Date.UTC(2120, 0, 1) + slot * 7 * 86400000).toISOString();
    const end = new Date(Date.parse(start) + 4 * 3600000).toISOString();
    const stock = await stockFixture(tx, observer, "30");
    const sales = await salesFixture(tx, observer, stock);
    const allocation = await observer.rpc(tx, "upsert_supply_allocation", [sales.line, "WAREHOUSE", null, f.warehouse, "30", null, null, randomUUID()]);
    const vehicle = randomUUID();
    await observer.rpc(tx, "save_catalog_record", ["vehicles", vehicle, f.branch, { code: stock.prefix, plate_number: stock.prefix,
      capacity_quantity: "20", capacity_uom_id: stock.uom, capacity_source_note: "Hồ sơ xe giả cho race QA", active: true }, null,
      "Tạo xe giả kiểm thử khóa tài nguyên", randomUUID()]);
    const deliveries = [];
    for (let n = 0; n < 2; n++) deliveries.push(await observer.rpc(tx, "create_delivery_from_allocations", [sales.so,
      [{ supply_allocation_id: allocation, planned_base_quantity: "15" }], start, randomUUID()]));
    return { vehicle, deliveries, start, end };
  });
  let release, ready, secondReady;
  const held = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { ready = resolve; });
  const secondStarted = new Promise(resolve => { secondReady = resolve; });
  const assignArgs = id => [id, personas.worker.employee, docs.vehicle, "", "", 1, randomUUID(), docs.start, docs.end];
  const first = left.sql.begin(async tx => {
    const [{ pid }] = await tx`select pg_backend_pid() pid`;
    const id = await left.rpc(tx, "assign_delivery_scheduled", assignArgs(docs.deliveries[0]), f.owner);
    ready({ pid, id });
    await held;
    return id;
  });
  const a = await started;
  const second = right.sql.begin(async tx => {
    const [{ pid }] = await tx`select pg_backend_pid() pid`;
    secondReady(pid);
    return right.rpc(tx, "assign_delivery_scheduled", assignArgs(docs.deliveries[1]), personas.warehouse.subject);
  }).then(value => ({ value }), error => ({ error: { code: error.code, message: error.message } }));
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
    assert.ok(blockers.includes(a.pid), "Race must actually compete on a resource lock");
  } finally { release(); }
  await first;
  const result = await second;
  assert.deepEqual(result.error, { code: "23P01", message: "work_resource_schedule_collision" });
  const [facts] = await observer.sql`select count(*)::int assignments from public.delivery_assignments
    where delivery_id in(${docs.deliveries[0]},${docs.deliveries[1]}) and superseded_at is null`;
  assert.equal(facts.assignments, 1);
  await writeFile(args.out, JSON.stringify({ scope: "NATIVE_DISTINCT_ACTOR_ASSIGNMENT_RESOURCE_LOCK_RACE", database: args.database,
    status: "PASS_EXECUTED_CONCURRENT_ASSIGNMENT", actorA: f.owner, actorB: personas.warehouse.subject,
    pidA: a.pid, pidB: b, observedBlockingPids: blockers, rejected: result.error, facts,
    managedAuthTestedInRace: false, productionAccess: "NONE" }, null, 2));
  console.log(JSON.stringify({ status: "PASS_EXECUTED_CONCURRENT_ASSIGNMENT", distinctPids: true, overlapObserved: true, facts }));
} finally { await left.sql.end({ timeout: 3 }); await right.sql.end({ timeout: 3 }); await observer.sql.end({ timeout: 3 }); }
