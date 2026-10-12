import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { argumentsForRun, openQA, rejected, stockFixture } from "./native-fixture.mjs";
import { advanceScenario } from "./package4-fixture.mjs";

const args = argumentsForRun(), qa = await openQA(args);
const { sql, rpc, fixtures: f } = qa;
const personas = JSON.parse(await readFile(args.personas, "utf8")).personas;
const finance = personas.finance.subject;
const documents = JSON.parse(await readFile(args.documents, "utf8")).documents;
const report = { scope: "G07_RESUME_READBACK_AND_UNFINISHED_CHECKS", database: args.database,
  productionAccess: "NONE", completedRacesRerun: false, checks: [] };
const rollback = new Error("ROLLBACK_G07_VERIFICATION_FIXTURES");
try {
  const [{ pid: readbackPid }] = await sql`select pg_backend_pid() pid`;
  for (const [name, doc, file] of [["different-intents", documents.race, args.race], ["same-intent", documents.sameIntent, args.sameRace]]) {
    const evidence = JSON.parse(await readFile(file, "utf8"));
    assert.equal(evidence.status, "PASS_EXECUTED_ADVANCE_RACE");
    assert.equal(evidence.mode, name);
    assert.notEqual(evidence.pidA, evidence.pidB);
    assert.ok(evidence.observedBlockingPids.includes(evidence.pidA));
    assert.equal(evidence.distinctActors, name === "different-intents");
    const [facts] = await sql`select private.current_receivable_outstanding(${doc.obligation})::text debt,
      private.advance_remaining(${doc.advance})::text advance,
      (select sum(amount_delta_vnd)::text from public.payment_allocations where payment_id=${doc.payment}) allocated,
      (select count(*)::int from public.payment_allocations where payment_id=${doc.payment}) effects,
      (select count(*)::int from public.payments where customer_id=${doc.customer}) payments`;
    assert.deepEqual(facts, evidence.facts);
    const [sources] = await sql`select
      (select count(*)::int from public.command_receipts where command_name='allocate_payment' and result_entity_id=${doc.payment}) receipts,
      (select count(*)::int from public.audit_events where action='payment.allocated' and entity_id=${doc.payment}) audits,
      (select count(*)::int from public.advance_allocations where advance_id=${doc.advance}) consumptions`;
    assert.deepEqual(sources, { receipts: 1, audits: 1, consumptions: 1 });
    report.checks.push({ name: `EXISTING_${name}_INDEPENDENT_READBACK`, status: "PASS", readbackPid,
      originalPids: [evidence.pidA, evidence.pidB], facts, sources, raceReexecuted: false, managedAuthInRace: false });
  }
  try {
    await sql.begin(async tx => {
      const doc = await advanceScenario(tx, qa, finance);
      const other = await advanceScenario(tx, qa, finance);
      const op = randomUUID();
      const line = [{ obligation_id: doc.obligation, amount_vnd: "600000" }];
      await rpc(tx, "save_command_draft", [op, "allocate_payment", f.branch,
        [["paymentId", doc.payment], ["allocationsJson", JSON.stringify(line)], ["operationId", op]]], finance);
      await tx.unsafe("set local role postgres");
      await tx.unsafe(`create function pg_temp.fail_after_advance_consumption() returns trigger language plpgsql as $$
        begin raise exception 'QA_INJECTED_AFTER_ADVANCE_CONSUMPTION' using errcode='P0001'; end $$;
        create trigger qa_fail_advance_consumption after insert on public.advance_allocations
          for each row execute function pg_temp.fail_after_advance_consumption();`).simple();
      const failure = await rejected(tx, sp => rpc(sp, "allocate_payment", [doc.payment, line, op], finance),
        "QA_INJECTED_AFTER_ADVANCE_CONSUMPTION", "P0001");
      await tx.unsafe("set local role postgres");
      const [afterFault] = await tx`select
        private.current_receivable_outstanding(${doc.obligation})::text debt,
        private.advance_remaining(${doc.advance})::text advance,
        (select count(*)::int from public.payments where customer_id=${doc.customer}) payments,
        (select count(*)::int from public.payment_allocations where payment_id=${doc.payment}) allocations,
        (select count(*)::int from public.advance_allocations where advance_id=${doc.advance}) consumptions,
        (select count(*)::int from public.command_receipts where operation_id=${op}) receipts,
        (select count(*)::int from public.audit_events where trace_id=${op}) audits`;
      assert.deepEqual(afterFault, { debt: "1000000", advance: "1000000", payments: 1,
        allocations: 0, consumptions: 0, receipts: 0, audits: 0 });
      await tx.unsafe("drop trigger qa_fail_advance_consumption on public.advance_allocations");
      const retry = await rpc(tx, "allocate_payment", [doc.payment, line, op], finance);
      assert.equal(retry, doc.payment);
      const scope = await rejected(tx, sp => rpc(sp, "allocate_payment", [doc.payment,
        [{ obligation_id: other.obligation, amount_vnd: "1" }], randomUUID()], finance), "allocation_scope_mismatch", "42501");
      const duplicate = await rejected(tx, sp => rpc(sp, "allocate_payment", [doc.payment,
        [{ obligation_id: doc.obligation, amount_vnd: "1" }, { obligation_id: doc.obligation, amount_vnd: "1" }], randomUUID()], finance),
        "duplicate_allocation_target", "23505");
      const conflict = await rejected(tx, sp => rpc(sp, "allocate_payment", [doc.payment,
        [{ obligation_id: doc.obligation, amount_vnd: "1" }], op], finance), "operation_payload_conflict", "23505");
      await tx.unsafe("set local role postgres");
      const [afterRetry] = await tx`select private.current_receivable_outstanding(${doc.obligation})::text debt,
        private.advance_remaining(${doc.advance})::text advance,
        (select count(*)::int from public.payment_allocations where payment_id=${doc.payment}) allocations,
        (select count(*)::int from public.audit_events where trace_id=${op}) audits`;
      assert.deepEqual(afterRetry, { debt: "400000", advance: "400000", allocations: 1, audits: 1 });
      report.checks.push({ name: "MID_CONSUMPTION_FAILURE_ROLLS_BACK_ALL_EFFECTS_THEN_SAME_INTENT_RETRIES",
        status: "PASS", failure, afterFault, afterRetry, scope, duplicate, conflict });
      const s = await stockFixture(tx, qa, "1");
      const account = await rpc(tx, "create_finance_account", [f.branch, s.prefix, "Quỹ giả kiểm thử AP", "CASH", randomUUID()]);
      const payment = await rpc(tx, "post_payment", [f.branch, "DISBURSEMENT", null, f.supplier, account, "150000", new Date().toISOString(),
        "CASH", "Ứng trước nhà cung cấp trên QA", [], "150000", randomUUID()], finance);
      await tx.unsafe("set local role postgres");
      const [ap] = await tx`select o.id from public.payable_obligations o join public.purchase_receipts r on r.id=o.purchase_receipt_id
        where r.purchase_order_id=${s.po}`;
      await rpc(tx, "allocate_payment", [payment, [{ obligation_id: ap.id, amount_vnd: "50000" }], randomUUID()], finance);
      await rpc(tx, "allocate_payment", [payment, [{ obligation_id: ap.id, amount_vnd: "100000" }], randomUUID()], finance);
      await tx.unsafe("set local role postgres");
      const [apFacts] = await tx`select private.current_payable_outstanding(${ap.id})::text debt,
        (select sum(private.advance_remaining(id))::text from public.advances where payment_id=${payment}) advance,
        (select sum(amount_delta_vnd)::text from public.payment_allocations where payment_id=${payment}) allocated,
        (select count(*)::int from public.payments where account_id=${account}) "cashEvents"`;
      assert.deepEqual(apFacts, { debt: "0", advance: "0", allocated: "150000", cashEvents: 1 });
      await qa.actor(tx, personas.sales.subject);
      const hidden = await tx`select id from public.payment_allocation_source_read where id=${payment}`;
      const hiddenBalance = await tx`select * from public.payment_allocation_balances(${payment}::uuid)`;
      assert.equal(hidden.length, 0);
      assert.equal(hiddenBalance.length, 0);
      report.checks.push({ name: "SUPPLIER_ADVANCE_PARTIAL_ALLOCATIONS_AND_CUSTOMER_READER_SCOPE", status: "PASS", apFacts,
        salesSupplierSourceRows: hidden.length, salesSupplierBalanceRows: hiddenBalance.length });
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  const files = (await readdir(new URL("../../../supabase/migrations/", import.meta.url)))
    .filter(file => /^2026101103.*\.sql$/.test(file)).sort();
  report.migrations = await Promise.all(files.map(async file => ({ file,
    sha256: createHash("sha256").update(await readFile(new URL("../../../supabase/migrations/" + file, import.meta.url))).digest("hex") })));
  report.newFixturesRolledBack = true;
  report.status = "PASS_G07_RESUME_VERIFICATION";
  await writeFile(args.out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, completedRacesRerun: false }));
} finally { await sql.end({ timeout: 3 }); }
