import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { argumentsForRun, openQA, rejected } from "./native-fixture.mjs";
import { paidReturnScenario, nextReceivableFromReturnedStock } from "./package4-return-fixture.mjs";
const args = argumentsForRun(), qa = await openQA(args), { sql, rpc, fixtures: f } = qa;
const p = JSON.parse(await readFile(args.personas, "utf8")).personas, finance = p.finance.subject;
const rollback = new Error("ROLLBACK_COMMISSION_RESOLUTION");
const report = { scope: "G09_EXPLICIT_PAID_COMMISSION_REVIEW_RECOVER_OR_OWNER_WAIVE", database: args.database,
  productionAccess: "NONE", managedAuthTested: false, syntheticLocalEmployeeAndRules: true, realAccountOrRulesChanged: false, checks: [] };
try {
  for (const method of args.method ? [args.method] : ["RECOVER_UNPAID_COMMISSION", "WAIVE"]) {
    try {
      await sql.begin(async tx => {
        const d = await paidReturnScenario(tx, qa, finance, { configureCommission: true });
        const [original] = await tx`select * from public.earning_events where rule_id=${d.commissionRule}`;
        await rpc(tx, "post_payment", [f.branch, "DISBURSEMENT", null, null, d.account, "161000", new Date().toISOString(), "CASH", "Đã trả hoa hồng QA",
          [{ obligation_id: original.payable_obligation_id, amount_vnd: "161000" }], "0", randomUUID(), d.commissionEmployee], finance);
        await rpc(tx, "adjust_return_receivable", [d.returnCase, "230000", "Giảm1 đơn vị nguồn230k", randomUUID()], finance);
        await tx.unsafe("set local role postgres");
        const [c] = await tx`select id,reduction_amount_vnd::text reduction from public.commission_reconciliation_cases where original_earning_event_id=${original.id}`;
        assert.equal(c.reduction, "11500");
        const [before] = await tx`select md5(to_jsonb(e)::text) hash from public.earning_events e where id=${original.id}`;
        let target = null, rule = null, version = null, payable = null;
        if (method === "RECOVER_UNPAID_COMMISSION") {
          const preferred = randomUUID();
          await tx`insert into public.pricing_rules(id,branch_id,scope_type,customer_id,material_id,price_uom_id,unit_price_vnd,version,source_type,effective_from,created_by)
            values(${preferred},${f.branch},'CUSTOMER_MATERIAL',${d.stock.customer},${d.stock.material},${d.stock.uom},400000,1,'LIST','2020-01-01',${f.owner})`;
          const [employee] = await tx`select auth_user_id from public.employees where id=${d.commissionEmployee}`;
          const next = await nextReceivableFromReturnedStock(tx, qa, { ...d, stock: { ...d.stock, price: preferred, unitPriceVnd: "400000" } }, employee.auth_user_id);
          await rpc(tx, "post_payment", [f.branch, "RECEIPT", d.stock.customer, null, d.account, "400000", new Date().toISOString(), "CASH",
            "Nguồn thu mới tạo hoa hồng QA20k", [{ obligation_id: next, amount_vnd: "400000" }], "0", randomUUID()], finance);
          await tx.unsafe("set local role postgres");
          const [future] = await tx`select id,approved_amount_vnd::text amount from public.earning_events where rule_id=${d.commissionRule} and id<>${original.id}`;
          assert.equal(future.amount, "20000"); target = future.id;
          const [t] = await tx`select version,payable_obligation_id from public.earning_events where id=${target}`;
          version = t.version; payable = t.payable_obligation_id;
          rule = await rpc(tx, "create_compensation_rule", [f.branch, d.stock.prefix + "_ADJ", "Điều chỉnh hoa hồng QA theo VND", d.commissionEmployee,
            "ADJUSTMENT", "FIXED_PER_BASIS", "1", null, "OPEX", "2020-01-01", null, randomUUID()]);
          for (const expected of [null, 0, 999]) await rejected(tx, sp => rpc(sp, "resolve_commission_reconciliation", [c.id, method, target, rule, expected, "Xử lý nguồn đã trả theo khoản chưa trả", randomUUID()]), "commission_recovery_version_conflict", "PT409");
        } else await rejected(tx, sp => rpc(sp, "resolve_commission_reconciliation", [c.id, method, null, null, null, "Finance không được tự miễn thu hồi", randomUUID()], finance), null, "42501");
        const inputs = [c.id, method, target, rule, version, "Quyết định xử lý nguồn hoa hồng đã trả QA", randomUUID()];
        await tx.unsafe("set local role postgres");
        await tx.unsafe("create function pg_temp.fail_review_resolution() returns trigger language plpgsql as $$begin raise exception 'qa_review_resolution_fault' using errcode='P0001';end$$; create trigger qa_fail_review_resolution after insert on public.commission_review_resolutions for each row execute function pg_temp.fail_review_resolution();").simple();
        await rejected(tx, sp => rpc(sp, "resolve_commission_reconciliation", inputs), "qa_review_resolution_fault", "P0001");
        await tx.unsafe("set local role postgres");
        const [fault] = await tx`select count(*)::int resolutions from public.commission_review_resolutions where case_id=${c.id}`; assert.equal(fault.resolutions, 0);
        if (payable) assert.equal((await tx`select private.current_payable_outstanding(${payable})::text amount`)[0].amount, "20000");
        await tx.unsafe("drop trigger qa_fail_review_resolution on public.commission_review_resolutions");
        const resolved = await rpc(tx, "resolve_commission_reconciliation", inputs); assert.equal(await rpc(tx, "resolve_commission_reconciliation", inputs), resolved);
        await tx.unsafe("set local role postgres");
        const [facts] = await tx`select (select count(*)::int from public.commission_review_resolutions where case_id=${c.id}) resolutions,
          (select count(*)::int from public.audit_events where trace_id=${inputs[6]}) audits,
          (select md5(to_jsonb(e)::text) from public.earning_events e where id=${original.id}) originalHash,
          private.current_payable_outstanding(${original.payable_obligation_id})::text oldDebt,
          (select count(*)::int from public.payments where employee_id=${d.commissionEmployee}) employeePayments`;
        assert.deepEqual(facts, { resolutions: 1, audits: 1, originalhash: before.hash, olddebt: "0", employeepayments: 1 });
        const after = payable ? (await tx`select private.current_payable_outstanding(${payable})::text amount`)[0].amount : null;
        if (payable) assert.equal(after, "8500");
        await rejected(tx, sp => rpc(sp, "resolve_commission_reconciliation", [...inputs.slice(0, 6), randomUUID()]), "commission_case_already_resolved", "55000");
        report.checks.push({ method, status: "PASS", facts, afterUnpaid: after, faultRolledBack: true });
        throw rollback;
      });
    } catch (error) { if (error !== rollback) throw error; }
  }
  report.status = "PASS_EXPLICIT_COMMISSION_REVIEW_RESOLUTIONS"; report.rolledBack = true;
  await writeFile(args.out, JSON.stringify(report, null, 2)); console.log(JSON.stringify({ status: report.status, checks: report.checks.length }));
} catch (error) {
  await writeFile(args.out.replace(/\.json$/, "-failure.json"), JSON.stringify({ ...report, status: "FAIL", error: { code: error.code, message: error.message } }, null, 2)); throw error;
} finally { await sql.end({ timeout: 3 }); }
