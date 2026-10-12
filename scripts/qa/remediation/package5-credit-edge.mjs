import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { argumentsForRun, openQA, rejected } from "./native-fixture.mjs";
import { paidReturnScenario, nextReceivableFromReturnedStock } from "./package4-return-fixture.mjs";

const args = argumentsForRun(), qa = await openQA(args), { sql, rpc, fixtures: f } = qa;
const finance = JSON.parse(await readFile(args.personas, "utf8")).personas.finance.subject;
const rollback = new Error("ROLLBACK_PACKAGE5_CREDIT_EDGE");
const report = { scope: "G08_PARTIAL_REFUND_AND_OFFSET_SHARED_CREDIT_G09_MANUAL_NET_PROFIT_COMMISSION", database: args.database,
  managedAuthTested: false, productionAccess: "NONE", checks: [] };
try {
  try {
    await sql.begin(async tx => {
      const doc = await paidReturnScenario(tx, qa, finance);
      await rpc(tx, "adjust_return_receivable", [doc.returnCase, "230000", "Giảm trả hàng có nguồn QA", randomUUID()], finance);
      await tx.unsafe("set local role postgres");
      const [credit] = await tx`select id from public.customer_credits where return_case_id=${doc.returnCase}`;
      const [kept] = await tx`select sum(amount_delta_vnd)::text allocated from public.payment_allocations where payment_id=${doc.payment} and receivable_obligation_id=${doc.obligation}`;
      assert.equal(kept.allocated, "2990000");
      const next = await nextReceivableFromReturnedStock(tx, qa, doc);
      const refund = [credit.id, doc.account, "100000", new Date().toISOString(), "CASH", "Hoàn một phần QA", randomUUID()];
      const refunded = await rpc(tx, "refund_customer_credit", refund, finance); assert.equal(await rpc(tx, "refund_customer_credit", refund, finance), refunded);
      const offset = [credit.id, next, "130000", randomUUID()];
      const offsetId = await rpc(tx, "offset_customer_credit", offset, finance); assert.equal(await rpc(tx, "offset_customer_credit", offset, finance), offsetId);
      await rejected(tx, sp => rpc(sp, "refund_customer_credit", [credit.id, doc.account, "1", new Date().toISOString(), "CASH", "Không vượt phần còn", randomUUID()], finance), "customer_credit_settlement_exceeds_remaining", "23514");
      await rejected(tx, sp => rpc(sp, "offset_customer_credit", [credit.id, next, "1", randomUUID()], finance), "customer_credit_settlement_exceeds_remaining", "23514");
      await tx.unsafe("set local role postgres");
      const [facts] = await tx`select private.customer_credit_remaining(${credit.id})::text remaining,
        private.payment_available(${doc.payment})::text reusableReceipt,
        private.current_receivable_outstanding(${next})::text nextDebt,
        (select count(*)::int from public.payments where customer_id=${doc.stock.customer}) payments,
        (select sum(s.amount_delta_vnd)::text from public.customer_credit_settlements s join public.customer_credit_funds x on x.id=s.credit_fund_id where x.credit_id=${credit.id}) settled`;
      assert.deepEqual(facts, { remaining: "0", reusablereceipt: "0", nextdebt: "100000", payments: 2, settled: "230000" });
      report.checks.push({ name: "PARTIAL_REFUND100K_OFFSET130K_RETRY_ONE_CREDIT_AND_KEPT_GOODS_RECEIPT", status: "PASS", facts, originalRetainedAllocation: kept.allocated });
      const [sale] = await tx`select sales_owner_employee_id from public.sales_orders where id=${doc.sale.so}`;
      const rule = await rpc(tx, "create_compensation_rule", [f.branch, doc.stock.prefix + "_NET", "Hoa hồng5% lợi nhuận thuần QA", sale.sales_owner_employee_id,
        "SALES_COMMISSION", "PERCENT_BPS", null, 500, "SALES_COMMISSION", "2020-01-01", null, randomUUID()]);
      const inputs = [rule, "SALES_ORDER", doc.sale.so, randomUUID()];
      const event = await rpc(tx, "calculate_earning_event", inputs); assert.equal(await rpc(tx, "calculate_earning_event", inputs), event);
      const [commission] = await tx`select basis_amount_vnd::text basis,calculated_amount_vnd::text amount,
        (select count(*)::int from public.earning_events where rule_id=${rule}) events,
        (select count(*)::int from public.audit_events where trace_id=${inputs[3]}) audits from public.earning_events where id=${event}`;
      assert.deepEqual(commission, { basis: "1040000", amount: "52000", events: 1, audits: 1 });
      report.checks.push({ name: "MANUAL_PROFIT_COMMISSION_USES_NET1040K_AFTER_RETURN_AND_RETRY_ONCE", status: "PASS", commission });
      await tx.unsafe("set constraints all immediate");
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  report.status = "PASS_EXECUTED_CREDIT_AND_MANUAL_COMMISSION"; report.rolledBack = true;
  await writeFile(args.out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length }));
} catch (error) {
  await writeFile(args.out.replace(/\.json$/, "-failure.json"), JSON.stringify({ ...report, status: "FAIL", error: { code: error.code, message: error.message } }, null, 2)); throw error;
} finally { await sql.end({ timeout: 3 }); }
