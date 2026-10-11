import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { argumentsForRun, openQA, rejected } from "./native-fixture.mjs";
import { paidReturnScenario } from "./package4-return-fixture.mjs";
const args = argumentsForRun(), qa = await openQA(args);
const finance = JSON.parse(await readFile(args.personas, "utf8")).personas.finance.subject;
const rollback = new Error("ROLLBACK_COMMISSION_CREDIT_FIXTURE");
const report = { scope: "G08_G09_CONFIGURED_AUTOMATIC_COMMISSION_PARTIAL_CREDIT", phase: args.phase,
  database: args.database, managedAuthTested: false, syntheticLocalAuthEmployeeFixture: true, cloudAccountsCreated: 0, productionAccess: "NONE" };
try {
  try {
    await qa.sql.begin(async tx => {
      const doc = await paidReturnScenario(tx, qa, finance, { configureCommission: true });
      const [earning] = await tx`select * from public.earning_events where rule_id=${doc.commissionRule}`;
      assert.equal(earning.approved_amount_vnd, "161000");
      if (args.mode === "paid") await qa.rpc(tx, "post_payment", [qa.fixtures.branch, "DISBURSEMENT", null, null, doc.account,
        "161000", new Date().toISOString(), "CASH", "Đã trả hoa hồng giả QA", [{ obligation_id: earning.payable_obligation_id, amount_vnd: "161000" }],
        "0", randomUUID(), doc.commissionEmployee], finance);
      const approval = [doc.returnCase, "230000", "Giảm1m3 nguồn230k có hoa hồng QA", randomUUID()];
      if (args.phase === "before") {
        report.reproduction = await rejected(tx, sp => qa.rpc(sp, "adjust_return_receivable", approval, finance), "invalid_commission_reversal_source", "23514");
        report.status = "REPRODUCED_COMMISSION_BLOCKS_PARTIAL_CUSTOMER_CREDIT";
      } else {
        await qa.rpc(tx, "adjust_return_receivable", approval, finance);
        await qa.rpc(tx, "adjust_return_receivable", approval, finance);
        await tx.unsafe("set local role postgres");
        const [facts] = await tx`select private.current_payable_outstanding(${earning.payable_obligation_id})::text payable,
          (select sum(approved_amount_vnd)::text from public.earning_events where rule_id=${doc.commissionRule}) commission,
          (select count(*)::int from public.earning_events where reverses_earning_event_id=${earning.id}) reversals,
          private.current_receivable_outstanding(${doc.obligation})::text debt,
          (select amount_vnd::text from public.customer_credits where return_case_id=${doc.returnCase}) credit`;
        if (args.mode === "paid") {
          assert.deepEqual(facts, { payable: "0", commission: "161000", reversals: 0, debt: "0", credit: "230000" });
          const [review] = await tx`select count(*)::int cases,sum(reduction_amount_vnd)::text reduction
            from public.commission_reconciliation_cases where original_earning_event_id=${earning.id}`;
          assert.deepEqual(review, { cases: 1, reduction: "11500" });
          report.review = review;
        } else assert.deepEqual(facts, { payable: "149500", commission: "149500", reversals: 1, debt: "0", credit: "230000" });
        await tx.unsafe("set constraints all immediate");
        report.facts = facts; report.status = "PASS_PARTIAL_CREDIT_COMMISSION_SOURCE";
      }
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  report.rolledBack = true;
  await writeFile(args.out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status }));
} finally { await qa.sql.end({ timeout: 3 }); }
