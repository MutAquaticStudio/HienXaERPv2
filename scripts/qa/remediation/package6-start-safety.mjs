import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { argumentsForRun, openQA, rejected, stockFixture } from "./native-fixture.mjs";
import { isolatedBranchFixture } from "./isolated-branch-fixture.mjs";
import { realQAAuth } from "./auth.mjs";

const args = argumentsForRun(), qa = await openQA(args), { sql, rpc } = qa;
const personas = JSON.parse(await readFile(args.personas, "utf8")).personas;
const auth = await realQAAuth(args["auth-env"], { owner: "hxqa-owner@example.test", purchasing: "hxqa-purchasing@example.test" });
assert.equal(auth.accounts.purchasing.subject, personas.purchasing.subject);
const rollback = new Error("ROLLBACK_START_SAFETY");
const report = { scope: "G11_FIRST_SOURCE_FAULT_AND_REAL_AUTH_TWO_ACTORS_ONE_STABLE_START", database: args.database,
  productionAccess: "NONE", managedQaBusinessWrites: 0, cloudRolesChanged: false, checks: [], excludedAdvanceRacesReexecuted: false };
let held = false, trigger = false, first, second;
const key = randomInt(100000000, 2000000000);
try {
  try {
    await sql.begin(async tx => {
      const local = await isolatedBranchFixture(tx, qa), branch = local.fixtures.branch;
      const s = await stockFixture(tx, local, "1", { prepareOnly: true });
      await tx.unsafe("set local role postgres");
      const op = randomUUID();
      await tx.unsafe(`create function pg_temp.fail_first_source_audit() returns trigger language plpgsql as $$begin raise exception 'qa_first_source_fault' using errcode='P0001';end$$;
        create trigger qa_fail_first_source_audit after insert on public.audit_events for each row when(new.branch_id='${branch}'::uuid and new.action='purchase_order.confirm') execute function pg_temp.fail_first_source_audit();`).simple();
      await rejected(tx, sp => rpc(sp, "confirm_purchase_order", [s.po, op]), "qa_first_source_fault", "P0001");
      await tx.unsafe("set local role postgres");
      const [afterFault] = await tx`select (select count(*)::int from private.branch_recorded_operations where branch_id=${branch}) starts,
        (select count(*)::int from public.audit_events where branch_id=${branch} and action in('operations.recording_started','purchase_order.confirm')) audits,
        (select count(*)::int from public.command_receipts where operation_id=${op}) receipts,
        (select state from public.purchase_orders where id=${s.po}) po`;
      assert.deepEqual(afterFault, { starts: 0, audits: 0, receipts: 0, po: "DRAFT" });
      await tx.unsafe("drop trigger qa_fail_first_source_audit on public.audit_events");
      assert.equal(await rpc(tx, "confirm_purchase_order", [s.po, op]), s.po); assert.equal(await rpc(tx, "confirm_purchase_order", [s.po, op]), s.po);
      await tx.unsafe("set local role postgres");
      const [afterRetry] = await tx`select (select count(*)::int from private.branch_recorded_operations where branch_id=${branch}) starts,
        (select count(*)::int from public.audit_events where branch_id=${branch} and action='operations.recording_started') startAudits,
        (select count(*)::int from public.audit_events where trace_id=${op}) commandAudits,
        (select state from private.branch_operational_states where branch_id=${branch}) state,
        (select version from private.branch_operational_states where branch_id=${branch}) version`;
      assert.deepEqual(afterRetry, { starts: 1, startaudits: 1, commandaudits: 1, state: "PENDING_OPENING", version: 0 });
      await rejected(tx, sp => sp`update private.branch_recorded_operations set started_at=started_at+interval '1 day' where branch_id=${branch}`, "recording_start_immutable", "55000");
      await rejected(tx, sp => sp.unsafe("select private.require_authorized_opening($1::uuid,'INVENTORY','{}'::jsonb)", [branch]), null, "42501");
      report.checks.push({ name: "FAILED_FIRST_COMMAND_ROLLS_BACK_START_HISTORY_AND_STATE_RETRY_ONE_IMMUTABLE_START", status: "PASS", afterFault, afterRetry, openingAuthorizationStillRequired: true });
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  const doc = await sql.begin(async tx => {
    const local = await isolatedBranchFixture(tx, qa, [personas.purchasing.subject]);
    const a = await stockFixture(tx, local, "1", { prepareOnly: true }), b = await stockFixture(tx, local, "1", { prepareOnly: true });
    return { branch: local.fixtures.branch, poA: a.po, poB: b.po };
  });
  await sql`select pg_advisory_lock(${key}::bigint)`; held = true;
  await sql.unsafe(`create function pg_temp.hold_first_start() returns trigger language plpgsql as $$begin perform pg_advisory_xact_lock(${key}::bigint);return new;end$$;
    create trigger qa_hold_first_start after insert on private.branch_recorded_operations for each row when(new.branch_id='${doc.branch}'::uuid) execute function pg_temp.hold_first_start();`).simple(); trigger = true;
  const opA = randomUUID(), opB = randomUUID();
  first = auth.api("owner", "rpc/confirm_purchase_order", { target_purchase_order_id: doc.poA, operation_id: opA });
  let pidA, overlap;
  for (let i = 0; i < 300; i++) {
    const [row] = await sql`select pid from pg_locks where locktype='advisory' and not granted and objid=${key}`;
    if (row) { pidA = row.pid; break; } await delay(20);
  }
  assert.ok(pidA);
  second = auth.api("purchasing", "rpc/confirm_purchase_order", { target_purchase_order_id: doc.poB, operation_id: opB });
  for (let i = 0; i < 300; i++) {
    const [row] = await sql`select pid,pg_blocking_pids(pid) blockers from pg_stat_activity where datname=${args.database}
      and ${pidA}=any(pg_blocking_pids(pid)) and query like '%confirm_purchase_order%'`;
    if (row) { overlap = row; break; } await delay(20);
  }
  assert.ok(overlap); assert.notEqual(pidA, overlap.pid); assert.notEqual(auth.accounts.owner.subject, auth.accounts.purchasing.subject);
  await sql`select pg_advisory_unlock(${key}::bigint)`; held = false;
  const a = await first, b = await second; assert.equal(a.status, 200, JSON.stringify(a.data)); assert.equal(b.status, 200, JSON.stringify(b.data));
  const [facts] = await sql`select (select count(*)::int from private.branch_recorded_operations where branch_id=${doc.branch}) starts,
    (select count(*)::int from public.audit_events where branch_id=${doc.branch} and action='operations.recording_started') startAudits,
    (select count(*)::int from public.purchase_orders where branch_id=${doc.branch} and state='CONFIRMED') confirmed,
    (select state from private.branch_operational_states where branch_id=${doc.branch}) state,
    (select version from private.branch_operational_states where branch_id=${doc.branch}) version,
    (select count(*)::int from public.payments where branch_id=${doc.branch}) payments`;
  assert.deepEqual(facts, { starts: 1, startaudits: 1, confirmed: 2, state: "PENDING_OPENING", version: 0, payments: 0 });
  report.checks.push({ name: "TWO_ACTORS_FIRST_ORDINARY_SOURCE_COMMANDS_ONE_START_NO_ACTIVATION_OR_FAKE_MONEY", status: "PASS", facts,
    actors: [auth.accounts.owner.subject, auth.accounts.purchasing.subject], pidA, pidB: overlap.pid, observedBlockingPids: overlap.blockers, doc });
  report.status = "PASS_G11_START_ATOMICITY_AND_REAL_AUTH_CONCURRENCY";
  await writeFile(args.out, JSON.stringify(report, null, 2)); console.log(JSON.stringify({ status: report.status, checks: report.checks.length, excludedAdvanceRacesReexecuted: false }));
} catch (error) {
  await writeFile(args.out.replace(/\.json$/, "-failure.json"), JSON.stringify({ ...report, status: "FAIL", error: { code: error.code, message: error.message } }, null, 2)); throw error;
} finally {
  if (held) await sql`select pg_advisory_unlock(${key}::bigint)`;
  await Promise.allSettled([first, second].filter(Boolean));
  if (trigger) await sql.unsafe("drop trigger qa_hold_first_start on private.branch_recorded_operations");
  await sql.end({ timeout: 3 });
}
