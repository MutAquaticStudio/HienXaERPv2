import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { realQAAuth } from "./auth.mjs";
import { argumentsForRun, openQA } from "./native-fixture.mjs";
import { paidReturnScenario, nextReceivableFromReturnedStock } from "./package4-return-fixture.mjs";
const args = argumentsForRun(), qa = await openQA(args);
const finance = JSON.parse(await readFile(args.personas, "utf8")).personas.finance.subject;
const auth = await realQAAuth(args["auth-env"], { finance: "hxqa-finance-employee@example.test", sales: "hxqa-sales@example.test", worker: "hxqa-worker@example.test" });
assert.equal(auth.accounts.finance.subject, finance);
let observer;
const report = { scope: "G08_REAL_AUTH_COMMITTED_CUSTOMER_CREDIT_CORE", database: args.database, tokensRecorded: false,
  managedQaBusinessWrites: 0, productionAccess: "NONE", checks: [] };
try {
  const documents = await qa.sql.begin(async tx => {
    const [{ pid: writerPid }] = await tx`select pg_backend_pid() pid`;
    const refund = await paidReturnScenario(tx, qa, finance), offset = await paidReturnScenario(tx, qa, finance);
    offset.nextObligation = await nextReceivableFromReturnedStock(tx, qa, offset);
    return { refund, offset, writerPid };
  });
  observer = await openQA(args);
  const [{ pid: readerPid }] = await observer.sql`select pg_backend_pid() pid`;
  assert.notEqual(readerPid, documents.writerPid);
  for (const [name, doc] of Object.entries(documents).filter(([name]) => name === "refund" || name === "offset")) {
    const approval = { target_return_case_id: doc.returnCase, credit_amount_vnd: "230000", adjustment_reason: "Giảm1m3 theo nguồn230k trên QA",
      operation_id: randomUUID() };
    assert.equal((await auth.api("finance", "rpc/adjust_return_receivable", approval)).status, 200);
    assert.equal((await auth.api("finance", "rpc/adjust_return_receivable", approval)).status, 200);
    const source = await auth.api("finance", `customer_credits?select=id,amount_vnd,approved_credit_vnd&return_case_id=eq.${doc.returnCase}`);
    assert.equal(source.status, 200); assert.equal(source.data.length, 1);
    const creditId = source.data[0].id;
    assert.equal(String(source.data[0].amount_vnd), "230000");
    assert.equal((await auth.api("worker", `customer_credits?select=id&id=eq.${creditId}`)).data.length, 0);
    const denied = await auth.api("sales", "rpc/refund_customer_credit", { target_credit_id: creditId, target_account_id: doc.account,
      refund_amount_vnd: "230000", refunded_at: new Date().toISOString(), refund_method: "CASH", refund_reference: "Sales không được hoàn", operation_id: randomUUID() });
    assert.equal(denied.status, 403);
    const resource = name === "refund" ? "refund_customer_credit" : "offset_customer_credit";
    const payload = name === "refund" ? { target_credit_id: creditId, target_account_id: doc.account, refund_amount_vnd: "230000",
      refunded_at: new Date().toISOString(), refund_method: "CASH", refund_reference: "Hoàn thật trên ledger QA", operation_id: randomUUID() }
      : { target_credit_id: creditId, target_obligation_id: doc.nextObligation, offset_amount_vnd: "230000", operation_id: randomUUID() };
    const result = await auth.api("finance", "rpc/" + resource, payload);
    assert.equal(result.status, 200);
    assert.equal((await auth.api("finance", "rpc/" + resource, payload)).data, result.data);
    const extra = await auth.api("finance", "rpc/" + resource, { ...payload, operation_id: randomUUID() });
    assert.equal(extra.status, 400); assert.equal(extra.data.message, "customer_credit_settlement_exceeds_remaining");
    const [facts] = await observer.sql`select private.current_receivable_outstanding(${doc.obligation})::text originalDebt,
      private.customer_credit_remaining(${creditId})::text credit,private.payment_available(${doc.payment})::text originalAvailable,
      (select sum(case when direction='RECEIPT' then amount_vnd else -amount_vnd end)::text from public.payments where customer_id=${doc.stock.customer}) cash,
      (select count(*)::int from public.payments where customer_id=${doc.stock.customer}) payments,
      (select count(*)::int from public.command_receipts where operation_id=${payload.operation_id}) receipts,
      (select count(*)::int from public.audit_events where trace_id=${payload.operation_id}) audits`;
    assert.deepEqual(facts, { originaldebt: "0", credit: "0", originalavailable: "0", cash: name === "refund" ? "2990000" : "3220000",
      payments: name === "refund" ? 2 : 1, receipts: 1, audits: 1 });
    if (name === "offset") {
      const [debt] = await observer.sql`select private.current_receivable_outstanding(${doc.nextObligation})::text outstanding`;
      assert.equal(debt.outstanding, "0");
    }
    const balance = await auth.api("finance", `payment_allocation_source_read?select=available_amount_vnd&id=eq.${doc.payment}`);
    assert.equal(balance.status, 200); assert.equal(balance.data[0].available_amount_vnd, "0");
    report.checks.push({ name: "REAL_FINANCE_" + name.toUpperCase() + "_RETRY_ONE_EFFECT", status: "PASS", creditId, facts,
      deniedSalesStatus: denied.status, workerCreditRows: 0, excessStatus: extra.status, readerPid });
  }
  report.documents = documents; report.status = "PASS_REAL_AUTH_CUSTOMER_CREDIT_CORE";
  await writeFile(args.out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, distinctReadbackConnection: true }));
} catch (error) {
  await writeFile(args.out.replace(/\.json$/, "-failure.json"), JSON.stringify({ ...report, status: "FAIL", error: error.message }, null, 2));
  throw error;
} finally { if (observer) await observer.sql.end({ timeout: 3 }); await qa.sql.end({ timeout: 3 }); }
