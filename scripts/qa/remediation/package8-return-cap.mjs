import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { argumentsForRun, openQA, rejected } from "./native-fixture.mjs";
import { paidReturnScenario } from "./package4-return-fixture.mjs";
const args = argumentsForRun(), qa = await openQA(args), { sql, rpc, fixtures: f } = qa;
const finance = JSON.parse(await readFile(args.personas, "utf8")).personas.finance.subject;
const rollback = new Error("ROLLBACK_RETURN_CASE_CAP");
const report = { scope: "G03_G08_PARTIAL_APPROVAL_DOES_NOT_INFLATE_NEXT_CASE_SOURCE_VALUE", database: args.database, productionAccess: "NONE", managedAuthTested: false };
try {
  try {
    await sql.begin(async tx => {
      const d = await paidReturnScenario(tx, qa, finance);
      await rpc(tx, "adjust_return_receivable", [d.returnCase, "200000", "Đợt đầu giữ lại phí30k theo quyết định QA", randomUUID()], finance);
      const second = await rpc(tx, "open_return_case", [d.verificationLine, "CUSTOMER_RETURN", "1", "Trả đơn vị thứ hai theo nguồn", null, randomUUID()]);
      await rpc(tx, "resolve_return_case", [second, "RETURNED", f.warehouse, "Nhận lại đơn vị thứ hai", null, 1, randomUUID()]);
      if (args.phase === "before") {
        await rpc(tx, "adjust_return_receivable", [second, "260000", "Không được lấy phí cũ để tăng giá đơn vị mới", randomUUID()], finance);
        report.status = "REPRODUCED_NEXT_CASE_CAP_INCLUDES_UNAPPROVED_PRIOR_VALUE";
      } else {
        await rejected(tx, sp => rpc(sp, "adjust_return_receivable", [second, "260000", "Không vượt đơn vị giá230k", randomUUID()], finance), "return_credit_exceeds_source", "23514");
        await rpc(tx, "adjust_return_receivable", [second, "230000", "Đơn vị mới đúng nguồn230k", randomUUID()], finance);
        report.status = "PASS_NEXT_RETURN_CASE_CAPPED_BY_ITS_CUMULATIVE_PRICE_DELTA";
      }
      await tx.unsafe("set local role postgres");
      const [fact] = await tx`select approved_credit_vnd::text approved from public.customer_credits where return_case_id=${second}`;
      assert.equal(fact.approved, args.phase === "before" ? "260000" : "230000"); report.fact = fact;
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  report.rolledBack = true; await writeFile(args.out, JSON.stringify(report, null, 2)); console.log(JSON.stringify({ status: report.status, fact: report.fact }));
} finally { await sql.end({ timeout: 3 }); }
