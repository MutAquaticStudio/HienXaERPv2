import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { argumentsForRun, openQA, rejected } from "./native-fixture.mjs";
import { paidReturnScenario, nextReceivableFromReturnedStock } from "./package4-return-fixture.mjs";
const args = argumentsForRun(), qa = await openQA(args), { sql, rpc } = qa;
const finance = JSON.parse(await readFile(args.personas, "utf8")).personas.finance.subject;
const rollback = new Error("ROLLBACK_G08_CREDIT_FIXTURE");
const report = { scope: "G08_CUSTOMER_CREDIT_NATIVE_SOURCE_CORE", database: args.database,
  managedAuthTested: false, productionAccess: "NONE", checks: [] };
try {
  try {
    await sql.begin(async tx => {
      const doc = await paidReturnScenario(tx, qa, finance);
      const approval = randomUUID();
      const tooMuch = await rejected(tx, sp => rpc(sp, "adjust_return_receivable", [doc.returnCase, "230001", "Giảm vượt lượng nguồn", randomUUID()], finance),
        "return_credit_exceeds_source", "23514");
      await tx.unsafe("set local role postgres");
      await tx.unsafe(`create function pg_temp.fail_credit_funding() returns trigger language plpgsql as $$
        begin raise exception 'QA_AFTER_CREDIT_FUNDING' using errcode='P0001';end $$;
        create trigger qa_fail_credit_funding after insert on public.customer_credit_funds for each row execute function pg_temp.fail_credit_funding();`).simple();
      const approvalFault = await rejected(tx, sp => rpc(sp, "adjust_return_receivable", [doc.returnCase, "230000", "Giảm1m3 theo snapshot", approval], finance),
        "QA_AFTER_CREDIT_FUNDING", "P0001");
      await tx.unsafe("set local role postgres");
      const [approvalRollback] = await tx`select private.current_receivable_outstanding(${doc.obligation})::text debt,
        (select count(*)::int from public.customer_credits where return_case_id=${doc.returnCase}) credits,
        (select count(*)::int from public.receivable_adjustments where return_case_id=${doc.returnCase}) adjustments,
        (select count(*)::int from public.command_receipts where operation_id=${approval}) receipts,
        (select count(*)::int from public.audit_events where trace_id=${approval}) audits`;
      assert.deepEqual(approvalRollback, { debt: "0", credits: 0, adjustments: 0, receipts: 0, audits: 0 });
      await tx.unsafe("drop trigger qa_fail_credit_funding on public.customer_credit_funds");
      const adjusted = await rpc(tx, "adjust_return_receivable", [doc.returnCase, "230000", "Giảm1m3 theo snapshot", approval], finance);
      assert.equal(await rpc(tx, "adjust_return_receivable", [doc.returnCase, "230000", "Giảm1m3 theo snapshot", approval], finance), adjusted);
      await tx.unsafe("set local role postgres");
      const [credit] = await tx`select id from public.customer_credits where return_case_id=${doc.returnCase}`;
      const [held] = await tx`select private.current_receivable_outstanding(${doc.obligation})::text debt,
        private.customer_credit_remaining(${credit.id})::text credit,private.payment_available(${doc.payment})::text receiptAvailable`;
      assert.deepEqual(held, { debt: "0", credit: "230000", receiptavailable: "0" });
      const duplicate = await rejected(tx, sp => rpc(sp, "adjust_return_receivable", [doc.returnCase, "230000", "Không được giảm lần nữa", randomUUID()], finance),
        "return_credit_already_decided", "55000");
      const originalReverse = await rejected(tx, sp => rpc(sp, "reverse_payment", [doc.payment, "Không đảo toàn phiếu thu để hoàn230k", randomUUID()], finance),
        "payment_funds_customer_credit_use_source_workflow", "55000");
      const next = await nextReceivableFromReturnedStock(tx, qa, doc);
      const generalReuse = await rejected(tx, sp => rpc(sp, "allocate_payment", [doc.payment, [{ obligation_id: next, amount_vnd: "1" }], randomUUID()], finance),
        "allocation_exceeds_payment_available", "23514");
      const refundOp = randomUUID(), refundAt = new Date().toISOString();
      await tx.unsafe("set local role postgres");
      await tx.unsafe(`create function pg_temp.fail_credit_refund() returns trigger language plpgsql as $$
        begin raise exception 'QA_AFTER_CREDIT_SETTLEMENT' using errcode='P0001';end $$;
        create trigger qa_fail_credit_refund after insert on public.customer_credit_settlements for each row execute function pg_temp.fail_credit_refund();`).simple();
      const refundArgs = [credit.id, doc.account, "230000", refundAt, "CASH", "Hoàn phần hàng trả QA", refundOp];
      const refundFault = await rejected(tx, sp => rpc(sp, "refund_customer_credit", refundArgs, finance), "QA_AFTER_CREDIT_SETTLEMENT", "P0001");
      await tx.unsafe("set local role postgres");
      const [refundRollback] = await tx`select private.customer_credit_remaining(${credit.id})::text credit,
        (select count(*)::int from public.payments where customer_id=${doc.stock.customer}) payments,
        (select count(*)::int from public.command_receipts where operation_id=${refundOp}) receipts,
        (select count(*)::int from public.audit_events where trace_id=${refundOp}) audits`;
      assert.deepEqual(refundRollback, { credit: "230000", payments: 1, receipts: 0, audits: 0 });
      await tx.unsafe("drop trigger qa_fail_credit_refund on public.customer_credit_settlements");
      const refund = await rpc(tx, "refund_customer_credit", refundArgs, finance);
      assert.equal(await rpc(tx, "refund_customer_credit", refundArgs, finance), refund);
      await rejected(tx, sp => rpc(sp, "refund_customer_credit", [credit.id, doc.account, "1", refundAt, "CASH", "Không hoàn lần hai", randomUUID()], finance),
        "customer_credit_settlement_exceeds_remaining", "23514");
      await tx.unsafe("set local role postgres");
      const [refunded] = await tx`select private.current_receivable_outstanding(${doc.obligation})::text debt,
        private.customer_credit_remaining(${credit.id})::text credit,private.payment_available(${doc.payment})::text receiptAvailable,
        (select sum(case when direction='RECEIPT' then amount_vnd else -amount_vnd end)::text from public.payments where customer_id=${doc.stock.customer}) cash,
        (select count(*)::int from public.payments where customer_id=${doc.stock.customer}) payments`;
      assert.deepEqual(refunded, { debt: "0", credit: "0", receiptavailable: "0", cash: "2990000", payments: 2 });
      await rpc(tx, "reverse_payment", [refund, "Đảo phiếu hoàn QA thực để kiểm tra nguồn", randomUUID()], finance);
      const offsetOp = randomUUID();
      await rpc(tx, "offset_customer_credit", [credit.id, next, "230000", offsetOp], finance);
      assert.equal(await rpc(tx, "offset_customer_credit", [credit.id, next, "230000", offsetOp], finance), credit.id);
      const reverseOffset = randomUUID();
      await rpc(tx, "reverse_customer_credit_offset", [offsetOp, "Đảo bù trừ QA theo nguồn", reverseOffset], finance);
      await rpc(tx, "reverse_customer_credit_offset", [offsetOp, "Đảo bù trừ QA theo nguồn", reverseOffset], finance);
      await tx.unsafe("set local role postgres");
      const [restored] = await tx`select private.customer_credit_remaining(${credit.id})::text credit,
        private.current_receivable_outstanding(${next})::text nextDebt,private.payment_available(${doc.payment})::text receiptAvailable,
        (select sum(case when direction='RECEIPT' then amount_vnd else -amount_vnd end)::text from public.payments where customer_id=${doc.stock.customer}) cash`;
      assert.deepEqual(restored, { credit: "230000", nextdebt: "230000", receiptavailable: "0", cash: "3220000" });
      await tx.unsafe("set constraints all immediate");
      report.checks.push({ name: "PAID_RETURN_HELD_REFUND_ONCE_REVERSE_REFUND_OFFSET_REVERSE_OFFSET", status: "PASS", tooMuch, duplicate,
        approvalFault, approvalRollback, refundFault, refundRollback, held, refunded, restored, originalReverse, generalReuse });
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  report.status = "PASS_NATIVE_CUSTOMER_CREDIT_CORE"; report.rolledBack = true;
  await writeFile(args.out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length }));
} catch (error) {
  await writeFile(args.out.replace(/\.json$/, "-failure.json"), JSON.stringify({ ...report, status: "FAIL", error: { code: error.code, message: error.message } }, null, 2));
  throw error;
} finally { await sql.end({ timeout: 3 }); }
