import assert from "node:assert/strict";
import { randomUUID, randomInt } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { realQAAuth } from "./auth.mjs";
import { argumentsForRun, openQA } from "./native-fixture.mjs";
import { paidReturnScenario, nextReceivableFromReturnedStock } from "./package4-return-fixture.mjs";
const args = argumentsForRun(), qa = await openQA(args), { sql, rpc, fixtures: f } = qa;
const finance = JSON.parse(await readFile(args.personas, "utf8")).personas.finance.subject;
const auth = await realQAAuth(args["auth-env"], { finance: "hxqa-finance-employee@example.test", owner: "hxqa-owner@example.test" });
assert.equal(auth.accounts.finance.subject, finance); assert.equal(auth.accounts.owner.subject, f.owner);
const key = randomInt(100000000, 2000000000);
let held = false, trigger = false, first, second;
const report = { scope: "G08_REAL_AUTH_TWO_ACTORS_REFUND_VS_OFFSET_SAME_CREDIT", database: args.database,
  productionAccess: "NONE", managedQaBusinessWrites: 0, tokensRecorded: false };
try {
  const doc = await sql.begin(async tx => {
    const d = await paidReturnScenario(tx, qa, finance);
    d.nextObligation = await nextReceivableFromReturnedStock(tx, qa, d);
    await rpc(tx, "adjust_return_receivable", [d.returnCase, "230000", "Giảm1m3 để kiểm tra tranh chấp nguồn", randomUUID()], finance);
    await tx.unsafe("set local role postgres");
    const [c] = await tx`select id from public.customer_credits where return_case_id=${d.returnCase}`;
    const [fund] = await tx`select id from public.customer_credit_funds where credit_id=${c.id}`;
    return { ...d, credit: c.id, fund: fund.id };
  });
  await sql`select pg_advisory_lock(${key}::bigint)`; held = true;
  await sql.unsafe(`create function pg_temp.hold_credit_refund_race() returns trigger language plpgsql as $$
    begin perform pg_advisory_xact_lock(${key}::bigint);return new;end $$;
    create trigger qa_hold_credit_race after insert on public.customer_credit_settlements
     for each row when(new.credit_fund_id='${doc.fund}'::uuid) execute function pg_temp.hold_credit_refund_race();`).simple();
  trigger = true;
  const refund = { target_credit_id: doc.credit, target_account_id: doc.account, refund_amount_vnd: "230000",
    refunded_at: new Date().toISOString(), refund_method: "CASH", refund_reference: "Race hoàn230k", operation_id: randomUUID() };
  const offset = { target_credit_id: doc.credit, target_obligation_id: doc.nextObligation, offset_amount_vnd: "230000", operation_id: randomUUID() };
  first = auth.api("finance", "rpc/refund_customer_credit", refund);
  let pidA;
  for (let n = 0; n < 300; n++) {
    const [row] = await sql`select pid from pg_locks where locktype='advisory' and not granted and objid=${key}`;
    if (row) { pidA = row.pid; break; } await delay(20);
  }
  assert.ok(pidA);
  second = auth.api("owner", "rpc/offset_customer_credit", offset);
  let blocked;
  for (let n = 0; n < 300; n++) {
    const [row] = await sql`select pid,pg_blocking_pids(pid) blockers from pg_stat_activity where datname=${args.database}
      and ${pidA}=any(pg_blocking_pids(pid)) and query like '%offset_customer_credit%'`;
    if (row) { blocked = row; break; } await delay(20);
  }
  assert.ok(blocked); assert.notEqual(pidA, blocked.pid);
  await sql`select pg_advisory_unlock(${key}::bigint)`; held = false;
  const a = await first, b = await second;
  assert.equal(a.status, 200); assert.equal(b.status, 400); assert.equal(b.data.message, "customer_credit_settlement_exceeds_remaining");
  const [facts] = await sql`select private.customer_credit_remaining(${doc.credit})::text credit,
    private.current_receivable_outstanding(${doc.nextObligation})::text nextDebt,
    (select count(*)::int from public.customer_credit_settlements where credit_fund_id=${doc.fund}) settlements,
    (select count(*)::int from public.payments where customer_id=${doc.stock.customer}) payments,
    (select count(*)::int from public.command_receipts where operation_id=${offset.operation_id}) rejectedReceipts,
    (select count(*)::int from public.audit_events where trace_id=${offset.operation_id}) rejectedAudits`;
  assert.deepEqual(facts, { credit: "0", nextdebt: "230000", settlements: 1, payments: 2, rejectedreceipts: 0, rejectedaudits: 0 });
  report.status = "PASS_REAL_AUTH_REFUND_OFFSET_RACE";
  Object.assign(report, { actors: [finance, f.owner], pidA, pidB: blocked.pid, observedBlockingPids: blocked.blockers,
    refundStatus: a.status, offsetStatus: b.status, facts, doc });
  await writeFile(args.out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, distinctActors: true, distinctPids: true, overlapObserved: true, facts }));
} catch (error) {
  await writeFile(args.out.replace(/\.json$/, "-failure.json"), JSON.stringify({ ...report, status: "FAIL", error: error.message }, null, 2)); throw error;
} finally {
  if (held) await sql`select pg_advisory_unlock(${key}::bigint)`;
  await Promise.allSettled([first, second].filter(Boolean));
  if (trigger) await sql.unsafe("drop trigger qa_hold_credit_race on public.customer_credit_settlements");
  await sql.end({ timeout: 3 });
}
