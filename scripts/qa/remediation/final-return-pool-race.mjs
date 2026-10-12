import assert from "node:assert/strict";
import { randomUUID, randomInt } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { argumentsForRun, openQA } from "./native-fixture.mjs";
import { realQAAuth } from "./auth.mjs";

const args = argumentsForRun(), qa = await openQA(args), { sql, fixtures: f } = qa;
const d = JSON.parse(await readFile(args.documents, "utf8")).facts;
const auth = await realQAAuth(args['auth-env'], { owner: 'hxqa-owner@example.test', warehouse: 'hxqa-warehouse-dispatch@example.test' });
const key = randomInt(100000000, 2000000000);
let held = false, installed = false, first, second;
const report = { scope: 'G03_TWO_REAL_JWT_ACTORS_RETIRE_DIFFERENT_DELIVERIES_ONE_COST_POOL', productionAccess: 'NONE', tokensRecorded: false, excludedAdvanceRacesReexecuted: false };
try {
  assert.equal(d.cases.length, 3);
  await sql`select pg_advisory_lock(${key}::bigint)`; held = true;
  await sql.unsafe(`create function pg_temp.hold_return_pool() returns trigger language plpgsql as $$
    begin perform pg_advisory_xact_lock(${key}::bigint);return new;end$$;
    create trigger qa_hold_return_pool after insert on public.inventory_movements
    for each row when(new.source_return_case_id='${d.cases[0]}'::uuid) execute function pg_temp.hold_return_pool();`).simple();
  installed = true;
  const payload = id => ({ target_return_case_id: id, resolution: 'RETURNED', target_warehouse_id: f.warehouse,
    resolution_reason: 'Nhận lại nguồn QA có khóa giá trị chung', target_evidence_id: null, expected_version: 1, operation_id: randomUUID() });
  const a = payload(d.cases[0]), b = payload(d.cases[1]);
  first = auth.api('owner', 'rpc/resolve_return_case', a);
  let pidA, blocked;
  for (let n = 0; n < 300; n++) {
    const [r] = await sql`select pid from pg_locks where locktype='advisory' and not granted and objid=${key}`;
    if (r) { pidA = r.pid; break; } await delay(20);
  }
  assert.ok(pidA, 'First request must hold the source pool before its effect commits');
  second = auth.api('warehouse', 'rpc/resolve_return_case', b);
  for (let n = 0; n < 300; n++) {
    const [r] = await sql`select pid,pg_blocking_pids(pid) blockers from pg_stat_activity
      where datname=${args.database} and ${pidA}=any(pg_blocking_pids(pid)) and query like '%resolve_return_case%'`;
    if (r) { blocked = r; break; } await delay(20);
  }
  assert.ok(blocked); assert.notEqual(pidA, blocked.pid);
  await sql`select pg_advisory_unlock(${key}::bigint)`; held = false;
  const results = await Promise.all([first, second]);
  results.forEach(r => assert.equal(r.status, 200, JSON.stringify(r.data)));
  assert.equal((await auth.api('owner', 'rpc/resolve_return_case', a)).data, results[0].data);
  assert.equal((await auth.api('warehouse', 'rpc/resolve_return_case', b)).data, results[1].data);
  const [partial] = await sql`select sum(inventory_value_delta_vnd)::text value from public.inventory_movements where source_return_case_id=any(${d.cases.slice(0,2)}) and location_kind='WAREHOUSE'`;
  assert.equal(partial.value, '4500001');
  assert.equal((await auth.api('owner', 'rpc/resolve_return_case', payload(d.cases[2]))).status, 200);
  const [facts] = await sql`select (select sum(inventory_value_delta_vnd)::text from public.inventory_movements where source_return_case_id=any(${d.cases}) and location_kind='WAREHOUSE') returned_value,
    (select sum(base_quantity_delta)::text from public.inventory_movements where source_return_case_id=any(${d.cases}) and location_kind='WAREHOUSE') returned_quantity,
    (select sum(amount_delta_vnd)::text from public.direct_cost_entries where sales_order_id=${d.sale.so}) remaining_cost,
    (select count(*)::int from public.audit_events where trace_id in(${a.operation_id},${b.operation_id})) audits`;
  assert.deepEqual(facts, { returned_value: '6750000', returned_quantity: '45.000000', remaining_cost: '0', audits: 2 });
  Object.assign(report, { status: 'PASS', actors: [auth.accounts.owner.subject, auth.accounts.warehouse.subject], pidA, pidB: blocked.pid,
    observedBlockingPids: blocked.blockers, partial, facts, sources: d });
  await writeFile(args.out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: 'PASS', distinctActors: true, distinctPids: true, facts }));
} finally {
  if (held) await sql`select pg_advisory_unlock(${key}::bigint)`;
  await Promise.allSettled([first, second].filter(Boolean));
  if (installed) await sql.unsafe('drop trigger qa_hold_return_pool on public.inventory_movements');
  await sql.end({ timeout: 3 });
}
