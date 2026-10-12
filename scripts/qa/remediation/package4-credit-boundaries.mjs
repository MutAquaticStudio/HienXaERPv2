import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { argumentsForRun, openQA, rejected } from "./native-fixture.mjs";
import { paidReturnScenario } from "./package4-return-fixture.mjs";
const args = argumentsForRun(), qa = await openQA(args), { sql, rpc, fixtures: f } = qa;
const personas = JSON.parse(await readFile(args.personas, "utf8")).personas;
const finance = personas.finance.subject, rollback = new Error("ROLLBACK_CREDIT_BOUNDARY_FIXTURE");
const report = { scope: "G08_UNFINISHED_NATIVE_BOUNDARIES", database: args.database, managedAuthTested: false, productionAccess: "NONE", checks: [] };
async function scenario(name, body) {
  try { await sql.begin(async tx => { const result = await body(tx); await tx.unsafe("set constraints all immediate");
    report.checks.push({ name, status: "PASS", deferredSourceChecksExecuted: true, ...result }); throw rollback; }); }
  catch (error) { if (error !== rollback) throw error; }
}
try {
  await scenario("UNPAID_RETURN_REDUCES_DEBT_WITHOUT_REFUND_ENTITLEMENT", async tx => {
    const doc = await paidReturnScenario(tx, qa, finance, { paid: "0" });
    await rpc(tx, "adjust_return_receivable", [doc.returnCase, "230000", "Giảm phần chưa thanh toán", randomUUID()], finance);
    await tx.unsafe("set local role postgres");
    const [credit] = await tx`select id from public.customer_credits where return_case_id=${doc.returnCase}`;
    const [facts] = await tx`select private.current_receivable_outstanding(${doc.obligation})::text debt,
      private.customer_credit_remaining(${credit.id})::text credit,
      (select count(*)::int from public.customer_credit_funds where credit_id=${credit.id}) funds,
      (select count(*)::int from public.payments where customer_id=${doc.stock.customer}) payments`;
    assert.deepEqual(facts, { debt: "2990000", credit: "0", funds: 0, payments: 0 });
    await rejected(tx, sp => rpc(sp, "refund_customer_credit", [credit.id, doc.account, "1", new Date().toISOString(), "CASH", "Không có tiền thừa", randomUUID()], finance),
      "customer_credit_settlement_exceeds_remaining", "23514");
    return { facts };
  });
  await scenario("ZERO_BILLABLE_RETURN_RECORDS_DECISION_WITHOUT_FAKE_AR_OR_MONEY", async tx => {
    const doc = await paidReturnScenario(tx, qa, finance, { billable: "0", paid: "0" });
    assert.equal(doc.obligation, null);
    const decision = await rpc(tx, "adjust_return_receivable", [doc.returnCase, "0", "Không giảm tiền đối với hàng tặng", randomUUID()], finance);
    await tx.unsafe("set local role postgres");
    const [facts] = await tx`select approved_credit_vnd::text approved,amount_vnd::text owed,obligation_id,
      (select count(*)::int from public.receivable_adjustments where return_case_id=${doc.returnCase}) adjustments,
      (select count(*)::int from public.payments where customer_id=${doc.stock.customer}) payments from public.customer_credits where id=${decision}`;
    assert.deepEqual(facts, { approved: "0", owed: "0", obligation_id: null, adjustments: 0, payments: 0 });
    return { facts };
  });
  await scenario("MULTIPLE_CASES_AND_PARTIAL_REFUNDS_SHARE_ONE_ORIGINAL_ALLOCATION_WITHOUT_REUSE", async tx => {
    const doc = await paidReturnScenario(tx, qa, finance);
    await rpc(tx, "adjust_return_receivable", [doc.returnCase, "230000", "Giảm hồ sơ thứ nhất", randomUUID()], finance);
    const second = await rpc(tx, "open_return_case", [doc.verificationLine, "CUSTOMER_RETURN", "1", "Khách trả thêm1 theo nguồn", null, randomUUID()]);
    await rpc(tx, "resolve_return_case", [second, "RETURNED", f.warehouse, "Nhận lại phần trả tiếp theo", null, 1, randomUUID()]);
    await rpc(tx, "adjust_return_receivable", [second, "230000", "Giảm hồ sơ thứ hai", randomUUID()], finance);
    await tx.unsafe("set local role postgres");
    const credits = await tx`select id,return_case_id from public.customer_credits where return_case_id in(${doc.returnCase},${second})`;
    assert.equal(credits.length, 2);
    const first = credits.find(row => row.return_case_id === doc.returnCase).id;
    const [held] = await tx`select private.current_receivable_outstanding(${doc.obligation})::text debt,
      private.payment_available(${doc.payment})::text available,
      (select sum(amount_vnd)::text from public.customer_credits where id in(${credits[0].id},${credits[1].id})) heldCredit,
      (select count(*)::int from public.payment_allocations where payment_id=${doc.payment} and amount_delta_vnd<0) releases`;
    assert.deepEqual(held, { debt: "0", available: "0", heldcredit: "460000", releases: 2 });
    for (const amount of ["100000", "130000"]) await rpc(tx, "refund_customer_credit", [first, doc.account, amount,
      new Date().toISOString(), "CASH", "Hoàn từng phần có nguồn", randomUUID()], finance);
    const other = await paidReturnScenario(tx, qa, finance, { paid: "0" });
    const scope = await rejected(tx, sp => rpc(sp, "offset_customer_credit", [credits.find(row => row.id !== first).id, other.obligation, "1", randomUUID()], finance),
      "customer_credit_offset_scope_mismatch", "42501");
    const denied = await rejected(tx, sp => rpc(sp, "refund_customer_credit", [credits.find(row => row.id !== first).id, doc.account, "1",
      new Date().toISOString(), "CASH", "Sales không được chi hoàn", randomUUID()], personas.sales.subject), "forbidden_or_customer_credit_not_found", "42501");
    await qa.actor(tx, personas.worker.subject);
    assert.equal((await tx`select id from public.customer_credits where id=${first}`).length, 0);
    await tx.unsafe("set local role postgres");
    const [after] = await tx`select private.customer_credit_remaining(${first})::text firstCredit,
      private.customer_credit_remaining(${credits.find(row => row.id !== first).id})::text secondCredit,
      private.payment_available(${doc.payment})::text available,
      (select sum(case when direction='RECEIPT' then amount_vnd else -amount_vnd end)::text from public.payments where customer_id=${doc.stock.customer}) cash,
      (select count(*)::int from public.payments where customer_id=${doc.stock.customer}) payments`;
    assert.deepEqual(after, { firstcredit: "0", secondcredit: "230000", available: "0", cash: "2990000", payments: 3 });
    return { held, after, scope, denied, workerCreditRows: 0 };
  });
  report.status = "PASS_NATIVE_CREDIT_BOUNDARIES"; report.rolledBack = true;
  await writeFile(args.out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length }));
} catch (error) {
  await writeFile(args.out.replace(/\.json$/, "-failure.json"), JSON.stringify({ ...report, status: "FAIL", error: { code: error.code, message: error.message } }, null, 2));
  throw error;
} finally { await sql.end({ timeout: 3 }); }
