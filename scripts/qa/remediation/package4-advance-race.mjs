import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { argumentsForRun, openQA } from "./native-fixture.mjs";
const args = argumentsForRun(), observer = await openQA(args), left = await openQA(args), right = await openQA(args);
const all = JSON.parse(await readFile(args.documents, "utf8")).documents;
const same = args.mode === "same-intent", doc = same ? all.sameIntent : all.race;
const finance = JSON.parse(await readFile(args.personas, "utf8")).personas.finance.subject;
const actorA = finance, actorB = same ? finance : observer.fixtures.owner;
const opA = randomUUID(), opB = same ? opA : randomUUID();
const lines = [{ obligation_id: doc.obligation, amount_vnd: "600000" }];
try {
  for (const [actor, op] of [[actorA, opA], ...(same ? [] : [[actorB, opB]])]) await observer.sql.begin(tx => observer.rpc(tx,
    "save_command_draft", [op, "allocate_payment", all.branch, [["paymentId", doc.payment], ["allocationsJson", JSON.stringify(lines)], ["operationId", op]]], actor));
  let release, ready, secondReady;
  const held = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { ready = resolve; });
  const secondStarted = new Promise(resolve => { secondReady = resolve; });
  const first = left.sql.begin(async tx => {
    const [{ pid }] = await tx`select pg_backend_pid() pid`;
    const id = await left.rpc(tx, "allocate_payment", [doc.payment, lines, opA], actorA);
    ready({ pid, id }); await held; return id;
  });
  const a = await started;
  const second = right.sql.begin(async tx => {
    const [{ pid }] = await tx`select pg_backend_pid() pid`;
    secondReady(pid);
    return right.rpc(tx, "allocate_payment", [doc.payment, lines, opB], actorB);
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
    assert.ok(blockers.includes(a.pid));
  } finally { release(); }
  await first;
  const result = await second;
  if (same) assert.equal(result.value, doc.payment);
  else assert.deepEqual(result.error, { code: "23514", message: "allocation_exceeds_outstanding" });
  const [facts] = await observer.sql`select private.current_receivable_outstanding(${doc.obligation})::text debt,
    private.advance_remaining(${doc.advance})::text advance,
    (select sum(amount_delta_vnd)::text from public.payment_allocations where payment_id=${doc.payment}) allocated,
    (select count(*)::int from public.payment_allocations where payment_id=${doc.payment}) effects,
    (select count(*)::int from public.payments where customer_id=${doc.customer}) payments`;
  assert.deepEqual(facts, { debt: "400000", advance: "400000", allocated: "600000", effects: 1, payments: 1 });
  await writeFile(args.out, JSON.stringify({ scope: "G07_REAL_NATIVE_PAYMENT_OR_DRAFT_LOCK_CONTENTION", database: args.database,
    status: "PASS_EXECUTED_ADVANCE_RACE", mode: args.mode, actorA, actorB, distinctActors: actorA !== actorB,
    pidA: a.pid, pidB: b, observedBlockingPids: blockers, result, facts, managedAuthTestedInRace: false, productionAccess: "NONE" }, null, 2));
  console.log(JSON.stringify({ status: "PASS_EXECUTED_ADVANCE_RACE", mode: args.mode, distinctPids: true, overlapObserved: true, facts }));
} finally { await left.sql.end({ timeout: 3 }); await right.sql.end({ timeout: 3 }); await observer.sql.end({ timeout: 3 }); }
