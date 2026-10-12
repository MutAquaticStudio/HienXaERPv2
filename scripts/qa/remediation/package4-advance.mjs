import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { argumentsForRun, openQA, rejected, salesFixture, stockFixture } from "./native-fixture.mjs";
const args = argumentsForRun(), qa = await openQA(args), { sql, rpc, fixtures: f } = qa;
const finance = JSON.parse(await readFile(args.personas, "utf8")).personas.finance.subject;
const rollback = new Error("ROLLBACK_ADVANCE_FIXTURE");
const report = { scope: "G07_ADVANCE_SOURCE_ALLOCATION_NO_NEW_CASH", phase: args.phase, database: args.database, productionAccess: "NONE" };
try {
  try {
    await sql.begin(async tx => {
      const s = await stockFixture(tx, qa, "1", { unitPriceVnd: "1000000" });
      const account = await rpc(tx, "create_finance_account", [f.branch, s.prefix, "Quỹ giả kiểm thử ứng trước", "CASH", randomUUID()]);
      const p = await rpc(tx, "post_payment", [f.branch, "RECEIPT", s.customer, null, account, "1000000", new Date().toISOString(),
        "CASH", "Ứng trước trước khi giao hàng", [], "1000000", randomUUID()], finance);
      const so = await salesFixture(tx, qa, s);
      const allocation = await rpc(tx, "upsert_supply_allocation", [so.line, "WAREHOUSE", null, f.warehouse, "1", null, null, randomUUID()]);
      const d = await rpc(tx, "create_delivery_from_allocations", [so.so, [{ supply_allocation_id: allocation, planned_base_quantity: "1" }],
        new Date().toISOString(), randomUUID()]);
      const [l] = await tx`select id from public.delivery_lines where delivery_id=${d}`;
      await rpc(tx, "assign_delivery", [d, null, null, "Xe giả QA", "", 1, randomUUID()]);
      await rpc(tx, "handoff_delivery", [d, 2, new Date().toISOString(), randomUUID()]);
      const result = await rpc(tx, "submit_delivery_result", [d, "FULL", [{ delivery_line_id: l.id, actual_base_quantity: "1" }],
        "QA", "", "Mạng yếu", null, 3, randomUUID()]);
      const verification = await rpc(tx, "verify_delivery", [result, [{ delivery_line_id: l.id, accepted_base_quantity: "1",
        billable_base_quantity: "1", billing_variance_reason: "" }], 4, randomUUID()]);
      const [ar] = await tx`select id from public.receivable_obligations where delivery_verification_id=${verification}`;
      if (args.phase === "before") {
        report.reproduction = await rejected(tx, sp => rpc(sp, "allocate_payment", [p, [{ obligation_id: ar.id, amount_vnd: "1000000" }], randomUUID()], finance),
          "allocation_exceeds_payment_available", "23514");
      } else {
        const first = randomUUID(), second = randomUUID();
        await rpc(tx, "allocate_payment", [p, [{ obligation_id: ar.id, amount_vnd: "400000" }], first], finance);
        await rpc(tx, "allocate_payment", [p, [{ obligation_id: ar.id, amount_vnd: "400000" }], first], finance);
        await rpc(tx, "allocate_payment", [p, [{ obligation_id: ar.id, amount_vnd: "600000" }], second], finance);
        await rpc(tx, "allocate_payment", [p, [{ obligation_id: ar.id, amount_vnd: "600000" }], second], finance);
        report.excessRejected = await rejected(tx, sp => rpc(sp, "allocate_payment", [p, [{ obligation_id: ar.id, amount_vnd: "1" }], randomUUID()], finance),
          "allocation_exceeds_outstanding", "23514");
      }
      await tx.unsafe("set local role postgres");
      const [facts] = await tx`select (select count(*)::int from public.payments where customer_id=${s.customer}) payments,
        (select sum(case when direction='RECEIPT' then amount_vnd else -amount_vnd end)::text from public.payments where customer_id=${s.customer}) cash,
        (select sum(amount_delta_vnd)::text from public.payment_allocations where payment_id=${p}) allocated,
        private.current_receivable_outstanding(${ar.id})::text debt,private.payment_available(${p})::text available`;
      assert.equal(facts.payments, 1);
      assert.equal(facts.cash, "1000000");
      assert.equal(facts.debt, args.phase === "before" ? "1000000" : "0");
      if (args.phase !== "before") {
        const [advance] = await tx`select private.advance_remaining(a.id)::text remaining from public.advances a where a.payment_id=${p}`;
        assert.equal(advance.remaining, "0");
        report.advance = advance;
        const reverse = await rpc(tx, "reverse_payment", [p, "Đảo khoản thu thật trên fixture QA", randomUUID()], finance);
        assert.ok(reverse);
        await tx.unsafe("set local role postgres");
        const [afterReverse] = await tx`select private.advance_remaining(a.id)::text remaining,
          private.current_receivable_outstanding(${ar.id})::text debt from public.advances a where a.payment_id=${p}`;
        assert.deepEqual(afterReverse, { remaining: "0", debt: "1000000" });
        report.reverseRegression = afterReverse;
      }
      report.facts = facts;
      report.status = args.phase === "before" ? "REPRODUCED_G07" : "PASS_G07_CORE_AND_PARTIAL_SOURCE_ALLOCATIONS";
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  report.rolledBack = true;
  await writeFile(args.out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, facts: report.facts }));
} finally { await sql.end({ timeout: 3 }); }
