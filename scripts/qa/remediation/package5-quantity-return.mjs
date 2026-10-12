import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { argumentsForRun, openQA, rejected, salesFixture, stockFixture } from "./native-fixture.mjs";

const args = argumentsForRun(), qa = await openQA(args), { sql, rpc, fixtures: f } = qa;
const rollback = new Error("ROLLBACK_PACKAGE5_QUANTITY");
const report = { scope: "G02_ALL_QUANTITY_SEAMS_G03_SPLIT_RETURN_CUMULATIVE", database: args.database,
  productionAccess: "NONE", managedAuthTested: false, checks: [], excludedAdvanceRaces: true };
try {
  try {
    await sql.begin(async tx => {
      const [employee] = await tx`select id from public.employees where auth_user_id=${f.owner}`;
      const basisArgs = [f.branch, employee.id, "PER_DAY", "1.0000004", "2026-01-01", "2026-01-01", "Căn cứ lượng QA", null, null, randomUUID()];
      if (args.phase === "before") {
        const id = await rpc(tx, "record_compensation_basis", basisArgs);
        const [fact] = await tx`select basis_quantity::text quantity from public.compensation_manual_bases where id=${id}`;
        assert.equal(fact.quantity, "1.000000");
        report.checks.push({ name: "COMPENSATION_INPUT_PRECISION_SILENTLY_LOST", reproduced: true, input: "1.0000004", stored: fact.quantity });
      } else {
        await rejected(tx, sp => rpc(sp, "record_compensation_basis", basisArgs), "quantity_precision_exceeds_six", "22023");
        report.checks.push({ name: "COMPENSATION_INPUT_PRECISION_REJECTED", status: "PASS" });
      }
      const s = await stockFixture(tx, qa, "45"), sale = await salesFixture(tx, qa, s);
      const allocation = await rpc(tx, "upsert_supply_allocation", [sale.line, "WAREHOUSE", null, f.warehouse, "45", null, null, randomUUID()]);
      const amounts = [], verified = [];
      for (const quantity of ["15.000003", "15.000003", "14.999994"]) {
        const d = await rpc(tx, "create_delivery_from_allocations", [sale.so, [{ supply_allocation_id: allocation, planned_base_quantity: quantity }], new Date().toISOString(), randomUUID()]);
        const [line] = await tx`select id from public.delivery_lines where delivery_id=${d}`;
        await rpc(tx, "assign_delivery", [d, null, null, "Xe QA lũy kế", "", 1, randomUUID()]);
        await rpc(tx, "handoff_delivery_actual", [d, 2, new Date().toISOString(), randomUUID(), [{ delivery_line_id: line.id, loaded_base_quantity: quantity }]]);
        const result = await rpc(tx, "submit_delivery_result", [d, "FULL", [{ delivery_line_id: line.id, actual_base_quantity: quantity }], "QA", "", "Ghi nhận QA", null, 3, randomUUID()]);
        const intent = randomUUID(), inputs = [result, [{ delivery_line_id: line.id, accepted_base_quantity: quantity, billable_base_quantity: quantity, billing_variance_reason: "" }], 4, intent];
        const v = await rpc(tx, "verify_delivery", inputs);
        assert.equal(await rpc(tx, "verify_delivery", inputs), v);
        const [ar] = await tx`select original_amount_vnd::text amount from public.receivable_obligations where delivery_verification_id=${v}`;
        const [vl] = await tx`select id from public.delivery_verification_lines where delivery_verification_id=${v}`;
        amounts.push(ar.amount); verified.push(vl.id);
      }
      assert.deepEqual(amounts, ["3450001", "3450000", "3449999"]);
      report.checks.push({ name: "THREE_DELIVERIES_AND_EXACT_RETRIES", status: "PASS", amounts, total: amounts.reduce((n, v) => n + BigInt(v), 0n).toString() });
      const credits = [];
      for (const [i, quantity] of ["7.500001", "7.500002"].entries()) {
        const rc = await rpc(tx, "open_return_case", [verified[0], "CUSTOMER_RETURN", quantity, "Trả chia hai đợt QA", null, randomUUID()]);
        await rpc(tx, "resolve_return_case", [rc, "RETURNED", f.warehouse, "Nhận thực tế trả hàng QA", null, 1, randomUUID()]);
        const amount = i === 0 ? "1725000" : "1725001", intent = randomUUID();
        if (i === 1 && args.phase === "before") {
          const error = await rejected(tx, sp => rpc(sp, "adjust_return_receivable", [rc, amount, "Giá trị lũy kế đúng nguồn", intent]), "return_credit_exceeds_source", "23514");
          report.checks.push({ name: "FINAL_SPLIT_RETURN_BLOCKED_BY_INDEPENDENT_ROUNDING", reproduced: true, error });
        } else {
          const inputs = [rc, amount, "Giá trị lũy kế đúng nguồn", intent], id = await rpc(tx, "adjust_return_receivable", inputs);
          assert.equal(await rpc(tx, "adjust_return_receivable", inputs), id); credits.push(amount);
        }
      }
      if (args.phase !== "before") {
        assert.deepEqual(credits, ["1725000", "1725001"]);
        await rejected(tx, sp => rpc(sp, "open_return_case", [verified[0], "CUSTOMER_RETURN", "0.000001", "Không vượt nguồn đã trả", null, randomUUID()]), "return_quantity_exceeds_source", "23514");
        const [facts] = await tx`select sum(a.amount_delta_vnd)::text adjustments,(select count(*)::int from public.customer_credits c join public.return_cases r on r.id=c.return_case_id where r.delivery_verification_line_id=${verified[0]}) decisions
          from public.receivable_adjustments a join public.return_cases r on r.id=a.return_case_id where r.delivery_verification_line_id=${verified[0]}`;
        assert.deepEqual(facts, { adjustments: "-3450001", decisions: 2 });
        report.checks.push({ name: "SPLIT_RETURN_CUMULATIVE_EXACT_AND_RETRY_NO_DUPLICATE", status: "PASS", credits, facts });
      }
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  report.status = args.phase === "before" ? "REPRODUCED_TWO_REMAINING_GAPS" : "PASS_EXECUTED_DB_SCOPE";
  report.rolledBack = true;
  await writeFile(args.out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, rolledBack: true }));
} finally { await sql.end({ timeout: 3 }); }
