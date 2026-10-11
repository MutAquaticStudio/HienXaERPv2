import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { realQAAuth } from "./auth.mjs";
import { argumentsForRun, openQA, salesFixture, stockFixture } from "./native-fixture.mjs";

const args = argumentsForRun(), qa = await openQA(args), { sql, rpc, fixtures: f } = qa;
const auth = await realQAAuth(args["auth-env"], { finance: "hxqa-finance-employee@example.test", warehouse: "hxqa-warehouse-dispatch@example.test" });
const report = { scope: "G15_REAL_AUTH_SAME_SAVED_INTENT_TWO_SESSIONS_THREE_COMMANDS", database: args.database,
  productionAccess: "NONE", managedQaBusinessWrites: 0, tokensRecorded: false, checks: [],
  excluded: ["PACKAGE4_G07_CONCURRENCY", "PACKAGE4_G07_SAME_INTENT_CONCURRENCY"] };
try {
  for (const kind of ["post_payment", "receive_purchase_order", "verify_supplier_fulfillment"]) {
    const docs = await sql.begin(async tx => {
      const s = await stockFixture(tx, qa, "1"), sale = await salesFixture(tx, qa, s);
      const account = await rpc(tx, "create_finance_account", [f.branch, s.prefix, "Quỹ mới kiểm tra phản hồi QA", "CASH", randomUUID()]);
      const line = { ...s.common, quantity: "1", unit_cost_vnd: "150000", purchase_price_rule_id: s.cost, purchase_price_rule_version: 1, price_source_type: "CONTRACT" };
      if (kind === "post_payment") return { customer: s.customer, account };
      const po = kind === "receive_purchase_order"
        ? await rpc(tx, "create_purchase_order_draft", [f.branch, f.supplier, f.warehouse, null, "Nhận hàng cạnh tranh ý định QA", [line], randomUUID()])
        : await rpc(tx, "create_direct_purchase_from_sales_line", [sale.line, f.supplier, "1", line, null, randomUUID()]);
      await rpc(tx, "confirm_purchase_order", [po, randomUUID()]);
      const [pol] = await tx`select id from public.purchase_order_lines where purchase_order_id=${po}`;
      return { po, line: pol.id };
    });
    const op = randomUUID(), key = randomInt(100000000, 2000000000), role = kind === "post_payment" ? "finance" : "warehouse";
    const table = kind === "post_payment" ? "payments" : kind === "receive_purchase_order" ? "purchase_receipts" : "supplier_fulfillments";
    const field = kind === "post_payment" ? "customer_id" : "purchase_order_id", source = docs.customer ?? docs.po;
    const entries = [["operationId", op], ["qaScenario", "G15_" + kind]];
    const saved = await auth.api(role, "rpc/save_command_draft", { target_operation_id: op, target_command: kind, target_branch_id: f.branch, target_entries: entries });
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    const restored = await auth.api(role, "rpc/get_command_draft", { target_operation_id: op, target_command: kind, target_branch_id: f.branch });
    assert.equal(restored.status, 200); assert.deepEqual(restored.data.entries, entries);
    const body = kind === "post_payment" ? { target_branch_id: f.branch, direction: "RECEIPT", target_customer_id: docs.customer,
      target_supplier_id: null, target_account_id: docs.account, amount_vnd: "1000", effective_at: new Date().toISOString(), method: "CASH", external_reference: "Thu mới QA", allocation_lines: [], advance_amount_vnd: "0", operation_id: op, target_employee_id: null }
      : kind === "receive_purchase_order" ? { target_purchase_order_id: docs.po, receipt_lines: [{ purchase_order_line_id: docs.line, received_quantity: "1" }], target_evidence_id: null, received_at: new Date().toISOString(), operation_id: op }
      : { target_purchase_order_id: docs.po, fulfillment_lines: [{ purchase_order_line_id: docs.line, supplier_quantity: "1" }], target_evidence_id: null, supplier_reference: "NCC QA ý định", operation_id: op };
    let held = false, trigger = false, first, second, firstResponse;
    try {
      await sql`select pg_advisory_lock(${key}::bigint)`; held = true;
      await sql.unsafe(`create or replace function pg_temp.hold_g15_commit() returns trigger language plpgsql as $$begin perform pg_advisory_xact_lock(${key}::bigint);return new;end$$;
        create trigger qa_hold_g15_commit after insert on public.${table} for each row when(new.${field}='${source}'::uuid) execute function pg_temp.hold_g15_commit();`).simple();
      trigger = true;
      first = auth.api(role, "rpc/" + kind, body).then(response => { firstResponse = response; return response; });
      let pidA, overlap;
      for (let n = 0; n < 300; n++) {
        if (firstResponse && firstResponse.status !== 200) throw new Error(JSON.stringify(firstResponse));
        const [row] = await sql`select pid from pg_locks where locktype='advisory' and not granted and objid=${key}`;
        if (row) { pidA = row.pid; break; } await delay(20);
      }
      assert.ok(pidA, "First request must have inserted its business row before holding commit");
      second = auth.api(role, "rpc/" + kind, body);
      for (let n = 0; n < 300; n++) {
        const [row] = await sql`select pid,pg_blocking_pids(pid) blockers from pg_stat_activity where datname=${args.database}
          and ${pidA}=any(pg_blocking_pids(pid)) and query like ${"%" + kind + "%"}`;
        if (row) { overlap = row; break; } await delay(20);
      }
      assert.ok(overlap, "Two requests must overlap and block on the same protected source/intent"); assert.notEqual(pidA, overlap.pid);
      await sql`select pg_advisory_unlock(${key}::bigint)`; held = false;
      const a = await first, b = await second;
      assert.equal(a.status, 200, JSON.stringify(a.data)); assert.equal(b.status, 200, JSON.stringify(b.data)); assert.equal(a.data, b.data);
      const [effects] = await sql.unsafe(`select count(*)::int n from public.${table} where ${field}=$1`, [source]);
      const [durable] = await sql`select (select count(*)::int from public.command_receipts where operation_id=${op}) receipts,
        (select count(*)::int from public.audit_events where trace_id=${op}) audits`;
      assert.equal(effects.n, 1); assert.deepEqual(durable, { receipts: 1, audits: 1 });
      const outcome = await auth.api(role, "rpc/lookup_command_outcome", { target_operation_id: op, target_command: kind, target_branch_id: f.branch });
      assert.equal(outcome.status, 200); assert.deepEqual(outcome.data, { status: "COMMITTED", result_id: a.data });
      report.checks.push({ command: kind, status: "PASS", sameActorTwoSessions: auth.accounts[role].subject, pidA, pidB: overlap.pid,
        observedBlockingPids: overlap.blockers, effects, durable, outcome: outcome.data, docs, intent: op });
    } finally {
      if (held) await sql`select pg_advisory_unlock(${key}::bigint)`;
      await Promise.allSettled([first, second].filter(Boolean));
      if (trigger) await sql.unsafe(`drop trigger qa_hold_g15_commit on public.${table}`);
    }
  }
  report.status = "PASS_REAL_AUTH_THREE_SAVED_INTENT_RACES";
  await writeFile(args.out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, advanceAllocationRacesReexecuted: false }));
} catch (error) {
  await writeFile(args.out.replace(/\.json$/, "-failure.json"), JSON.stringify({ ...report, status: "FAIL", error: error.message }, null, 2)); throw error;
} finally { await sql.end({ timeout: 3 }); }
