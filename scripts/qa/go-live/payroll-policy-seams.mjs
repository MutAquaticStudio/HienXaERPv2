import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { argumentsForRun, openQA, rejected } from "../remediation/native-fixture.mjs";
const a = argumentsForRun(), q = await openQA(a), d = JSON.parse(await readFile(a.documents, "utf8")).documents;
const r = { scope: "T37_MANUAL_POLICIES_T40_ATOMIC_AUDIT", productionAccess: "NONE", schema: 179, checks: [], auditGaps: [], rolledBack: false };
const [schema] = await q.sql`select count(*)::int count,max(version) latest from supabase_migrations.schema_migrations`; r.schema = schema;
const rollback = new Error("ROLLBACK_PAYROLL_ACCEPTANCE");
const call = (tx, name, args, uid = d.fixtures.owner) => q.rpc(tx, name, args, uid);
const record = (name, facts = {}) => r.checks.push({ name, status: "PASS", facts });
try {
  try { await q.sql.begin(async tx => {
    const worker = d.personas.worker.employee, branch = d.branch;
    const ruleArgs = (type, op, rate = "100000") => [branch, "G" + randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase(), "QA quy tắc " + type, worker, type, "FIXED_PER_BASIS", rate, null, "OPEX", "2020-01-01", null, op];
    const rules = {};
    for (const type of ["FIXED_MONTHLY", "PER_SHIFT", "PER_DAY", "BONUS"]) {
      const op = randomUUID(), args = ruleArgs(type, op), rule = await call(tx, "create_compensation_rule", args);
      assert.equal(await call(tx, "create_compensation_rule", args), rule); rules[type] = rule;
      await rejected(tx, sp => call(sp, "create_compensation_rule", ruleArgs(type, randomUUID()), d.personas.worker.subject), null, "42501");
      await tx.unsafe("set local role postgres");
      const [audit] = await tx`select count(*)::int n from public.audit_events where trace_id=${op}`;
      if (audit.n !== 1) r.auditGaps.push({ command: "create_compensation_rule", actualAudits: audit.n, expected: 1 });
      const basisArgs = [branch, worker, type, "1.234567", "2026-10-01", "2026-10-12", "QA căn cứ theo nguồn " + type, null, null, randomUUID()];
      const basis = await call(tx, "record_compensation_basis", basisArgs); assert.equal(await call(tx, "record_compensation_basis", basisArgs), basis);
      const bad = [...basisArgs]; bad[3] = "1.2345671"; bad[9] = randomUUID();
      await rejected(tx, sp => call(sp, "record_compensation_basis", bad));
      await rejected(tx, sp => call(sp, "record_compensation_basis", [...basisArgs.slice(0, 9), randomUUID()], d.personas.worker.subject), null, "42501");
      const calculate = [rule, "MANUAL_BASIS", basis, randomUUID()], earning = await call(tx, "calculate_earning_event", calculate);
      assert.equal(await call(tx, "calculate_earning_event", calculate), earning);
      await tx.unsafe("set local role postgres");
      const [e] = await tx`select basis_quantity::text qty,calculated_amount_vnd::text amount,version from public.earning_events where id=${earning}`;
      assert.equal(e.qty, "1.234567"); assert.equal(e.amount, "123457");
      const approve = [earning, "123457", "2026-10-12", e.version, randomUUID()];
      await rejected(tx, sp => call(sp, "approve_earning_event", [...approve.slice(0, 3), null, randomUUID()]), null, "PT409");
      await rejected(tx, sp => call(sp, "approve_earning_event", approve, d.personas.worker.subject), null, "42501");
      assert.equal(await call(tx, "approve_earning_event", approve), earning); assert.equal(await call(tx, "approve_earning_event", approve), earning);
      await tx.unsafe("set local role postgres");
      const [ap] = await tx`select id,original_amount_vnd::text amount from public.payable_obligations where earning_event_id=${earning}`;
      assert.equal(ap.amount, "123457");
      const payment = [branch, "DISBURSEMENT", null, null, d.account, "23457", new Date().toISOString(), "CASH", "QA trả một phần theo căn cứ", [{ obligation_id: ap.id, amount_vnd: "23457" }], "0", randomUUID(), worker];
      const pay = await call(tx, "post_payment", payment, d.personas.finance.subject);
      assert.equal(await call(tx, "post_payment", payment, d.personas.finance.subject), pay);
      await tx.unsafe("set local role postgres");
      const [debt] = await tx`select private.current_payable_outstanding(${ap.id})::text value`; assert.equal(debt.value, "100000");
      if (type === "FIXED_MONTHLY") r.adjusts = { earning, ap: ap.id };
      record(type + "_MANUAL_SOURCE_CALCULATE_APPROVE_PARTIAL_PAY_RETRY", { quantity: e.qty, amount: e.amount, outstanding: debt.value, workerWriteDenied: true, nullableVersionDenied: true });
    }
    const adjustmentRule = await call(tx, "create_compensation_rule", ruleArgs("ADJUSTMENT", randomUUID(), "1"));
    const basis = await call(tx, "record_compensation_basis", [branch, worker, "ADJUSTMENT", "-50000", "2026-10-01", "2026-10-12", "QA điều chỉnh có nguồn thu nhập còn nợ", r.adjusts.earning, null, randomUUID()]);
    const earning = await call(tx, "calculate_earning_event", [adjustmentRule, "MANUAL_BASIS", basis, randomUUID()]);
    const [e] = await tx`select version,calculated_amount_vnd::text amount from public.earning_events where id=${earning}`;
    assert.equal(e.amount, "-50000"); await call(tx, "approve_earning_event", [earning, "-50000", "2026-10-12", e.version, randomUUID()]);
    await tx.unsafe("set local role postgres");
    const [adjusted] = await tx`select private.current_payable_outstanding(${r.adjusts.ap})::text value`; assert.equal(adjusted.value, "50000");
    record("ADJUSTMENT_SOURCE_REDUCES_ONLY_UNPAID_AP_WITHOUT_CHANGING_CASH", adjusted);
    const badBasis = await call(tx, "record_compensation_basis", [branch, worker, "ADJUSTMENT", "-50001", "2026-10-01", "2026-10-12", "QA vượt phần nợ còn lại", r.adjusts.earning, null, randomUUID()]);
    const badEarning = await call(tx, "calculate_earning_event", [adjustmentRule, "MANUAL_BASIS", badBasis, randomUUID()]);
    await rejected(tx, sp => call(sp, "approve_earning_event", [badEarning, "-50001", "2026-10-12", 1, randomUUID()]), null, "23514");
    record("ADJUSTMENT_CANNOT_RECOVER_PAID_AMOUNT");
    const categoryOp = randomUUID();
    const sig = await tx`select pg_get_function_arguments(oid) args from pg_proc where pronamespace='public'::regnamespace and proname='create_expense_category'`;
    r.expenseCategorySignature = sig[0].args;
    const categoryArgs = [branch, "G" + randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase(), "QA danh mục nhật ký", categoryOp];
    await call(tx, "create_expense_category", categoryArgs);
    await tx.unsafe("set local role postgres");
    const [audit] = await tx`select count(*)::int n from public.audit_events where trace_id=${categoryOp}`;
    if (audit.n !== 1) r.auditGaps.push({ command: "create_expense_category", actualAudits: audit.n, expected: 1 });
    throw rollback;
  }); } catch (error) { if (error !== rollback) throw error; r.rolledBack = true; }
  r.status = r.auditGaps.length ? "REPRODUCED_MISSING_ATOMIC_MASTER_AUDIT" : "PASS";
  r.checkedAt = new Date().toISOString(); await writeFile(a.out, JSON.stringify(r, null, 2));
  console.log(JSON.stringify({ status: r.status, checks: r.checks.length, auditGaps: r.auditGaps, rolledBack: r.rolledBack }));
} catch (error) { r.status = "FAIL"; r.error = error.message; await writeFile(a.out, JSON.stringify(r, null, 2)); throw error; }
finally { await q.sql.end({ timeout: 3 }); }
