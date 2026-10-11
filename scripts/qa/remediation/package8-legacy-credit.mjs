import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { argumentsForRun, openQA, rejected } from "./native-fixture.mjs";
const args = argumentsForRun(), qa = await openQA(args), { sql, rpc } = qa;
const d = JSON.parse(await readFile(args.documents, "utf8")).documents;
const p = JSON.parse(await readFile(args.personas, "utf8")).personas;
const rollback = new Error("ROLLBACK_LEGACY_SOURCE_TEST");
const report = { scope: "G08_EXISTING_LEGACY_DECISION_FUND_RECONCILIATION_NO_SECOND_ADJUSTMENT", database: args.database, productionAccess: "NONE", managedAuthTested: false, checks: [] };
try {
  try {
    await sql.begin(async tx => {
      const [before] = await tx`select md5(to_jsonb(a)::text) hash from public.receivable_adjustments a where id=${d.adjustment}`;
      const op = randomUUID(), inputs = [d.returnCase, "230000", "Đối chiếu nguồn tiền đã thu của khoản đã giảm", op];
      await rejected(tx, sp => rpc(sp, "adjust_return_receivable", [d.returnCase, "230001", "Không được sửa giá trị quyết định cũ", randomUUID()], p.finance.subject), "legacy_return_credit_source_mismatch", "23514");
      await rejected(tx, sp => rpc(sp, "adjust_return_receivable", inputs, p.warehouse.subject), "return_not_adjustable", "42501");
      await tx.unsafe("set local role postgres");
      await tx.unsafe(`create function pg_temp.fail_legacy_fund() returns trigger language plpgsql as $$begin raise exception 'qa_legacy_fund_fault' using errcode='P0001';end$$;
        create trigger qa_fail_legacy_fund after insert on public.customer_credit_funds for each row when(new.source_payment_id='${d.payment}'::uuid) execute function pg_temp.fail_legacy_fund();`).simple();
      await rejected(tx, sp => rpc(sp, "adjust_return_receivable", inputs, p.finance.subject), "qa_legacy_fund_fault", "P0001");
      await tx.unsafe("set local role postgres");
      const [fault] = await tx`select private.current_receivable_outstanding(${d.obligation})::text debt,
        (select count(*)::int from public.customer_credits where return_case_id=${d.returnCase}) credits,
        (select count(*)::int from public.command_receipts where operation_id=${op}) receipts,
        (select count(*)::int from public.audit_events where trace_id=${op}) audits`;
      assert.deepEqual(fault, { debt: "-230000", credits: 0, receipts: 0, audits: 0 });
      await tx.unsafe("drop trigger qa_fail_legacy_fund on public.customer_credit_funds");
      assert.equal(await rpc(tx, "adjust_return_receivable", inputs, p.finance.subject), d.adjustment);
      assert.equal(await rpc(tx, "adjust_return_receivable", inputs, p.finance.subject), d.adjustment);
      await tx.unsafe("set local role postgres");
      const [credit] = await tx`select id from public.customer_credits where return_case_id=${d.returnCase}`;
      const [after] = await tx`select private.current_receivable_outstanding(${d.obligation})::text debt,
        private.customer_credit_remaining(${credit.id})::text credit,
        private.payment_available(${d.payment})::text available,
        (select sum(amount_delta_vnd)::text from public.payment_allocations where payment_id=${d.payment}) retainedAllocation,
        (select count(*)::int from public.payments where customer_id=${d.customer}) payments,
        (select count(*)::int from public.receivable_adjustments where return_case_id=${d.returnCase}) adjustments,
        (select count(*)::int from public.audit_events where trace_id=${op}) audits,
        (select md5(to_jsonb(a)::text) from public.receivable_adjustments a where id=${d.adjustment}) originalHash`;
      assert.deepEqual(after, { debt: "0", credit: "230000", available: "0", retainedallocation: "2990000", payments: 1, adjustments: 1, audits: 1, originalhash: before.hash });
      await tx.unsafe("set constraints all immediate");
      report.checks.push({ name: "SOURCE_FAULT_ROLLBACK_AND_RETRY_ONE_FUNDED_CREDIT_OLD_DECISION_UNCHANGED", status: "PASS", fault, after });
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  report.status = "PASS_LEGACY_RETURN_SOURCE_RECONCILIATION"; report.rolledBack = true;
  await writeFile(args.out, JSON.stringify(report, null, 2)); console.log(JSON.stringify({ status: report.status, checks: report.checks.length }));
} catch (error) {
  await writeFile(args.out.replace(/\.json$/, "-failure.json"), JSON.stringify({ ...report, status: "FAIL", error: { code: error.code, message: error.message } }, null, 2)); throw error;
} finally { await sql.end({ timeout: 3 }); }
