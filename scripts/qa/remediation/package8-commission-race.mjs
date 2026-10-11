import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { argumentsForRun, openQA } from "./native-fixture.mjs";
import { realQAAuth } from "./auth.mjs";
import { commissionReviewScenario } from "./commission-review-fixture.mjs";
const args = argumentsForRun(), qa = await openQA(args), { sql } = qa;
const finance = JSON.parse(await readFile(args.personas, "utf8")).personas.finance.subject;
const auth = await realQAAuth(args["auth-env"], { owner: "hxqa-owner@example.test", finance: "hxqa-finance-employee@example.test" });
const report = { scope: "G09_REAL_AUTH_RECOVERY_VS_PAYOUT_SAME_UNPAID_COMMISSION", database: args.database, productionAccess: "NONE", managedQaBusinessWrites: 0, checks: [], excludedAdvanceRacesReexecuted: false };
const key = randomInt(100000000, 2000000000);
let held = false, trigger = false, first, second;
try {
 const d = await sql.begin(tx => commissionReviewScenario(tx, qa, finance));
 await sql`select pg_advisory_lock(${key}::bigint)`; held = true;
 await sql.unsafe(`create function pg_temp.hold_commission_recovery() returns trigger language plpgsql as $$begin perform pg_advisory_xact_lock(${key}::bigint);return new;end$$;
  create trigger qa_hold_commission_recovery after insert on public.payable_adjustments for each row when(new.obligation_id='${d.targetPayable}'::uuid) execute function pg_temp.hold_commission_recovery();`).simple(); trigger = true;
 const recovery = { target_case_id: d.review, resolution_kind: "RECOVER_UNPAID_COMMISSION", target_unpaid_earning_id: d.target,
  target_adjustment_rule_id: d.adjustmentRule, expected_earning_version: d.targetVersion, resolution_reason: "Đối chiếu11500 vào nguồn chưa trả QA", operation_id: randomUUID() };
 first = auth.api("owner", "rpc/resolve_commission_reconciliation", recovery);
 let pidA, overlap;
 for (let i = 0; i < 300; i++) { const [r] = await sql`select pid from pg_locks where locktype='advisory' and not granted and objid=${key}`;
  if (r) { pidA = r.pid; break; } await delay(20); }
 assert.ok(pidA);
 const payout = { target_branch_id: qa.fixtures.branch, direction: "DISBURSEMENT", target_customer_id: null, target_supplier_id: null,
  target_employee_id: d.commissionEmployee, target_account_id: d.account, amount_vnd: "20000", effective_at: new Date().toISOString(), method: "CASH",
  external_reference: "Chi cả20k cùng lúc xử lý nguồn QA", allocation_lines: [{ obligation_id: d.targetPayable, amount_vnd: "20000" }], advance_amount_vnd: "0", operation_id: randomUUID() };
 second = auth.api("finance", "rpc/post_payment", payout);
 for (let i = 0; i < 300; i++) { const [r] = await sql`select pid,pg_blocking_pids(pid) blockers from pg_stat_activity where datname=${args.database}
   and ${pidA}=any(pg_blocking_pids(pid)) and query like '%post_payment%';`;
  if (r) { overlap = r; break; } await delay(20); }
 assert.ok(overlap); assert.notEqual(pidA, overlap.pid); assert.notEqual(auth.accounts.owner.subject, auth.accounts.finance.subject);
 await sql`select pg_advisory_unlock(${key}::bigint)`; held = false;
 const a = await first, b = await second; assert.equal(a.status, 200, JSON.stringify(a.data)); assert.equal(b.status, 400); assert.equal(b.data.message, "allocation_exceeds_outstanding");
 const [facts] = await sql`select private.current_payable_outstanding(${d.targetPayable})::text unpaid,
  (select count(*)::int from public.commission_review_resolutions where case_id=${d.review}) resolutions,
  (select count(*)::int from public.payments where employee_id=${d.commissionEmployee}) employeePayments,
  (select count(*)::int from public.command_receipts where operation_id=${payout.operation_id}) rejectedReceipts,
  (select count(*)::int from public.audit_events where trace_id=${payout.operation_id}) rejectedAudits`;
 assert.deepEqual(facts, { unpaid: "8500", resolutions: 1, employeepayments: 1, rejectedreceipts: 0, rejectedaudits: 0 });
 report.checks.push({ status: "PASS", actors: [auth.accounts.owner.subject, auth.accounts.finance.subject], pidA, pidB: overlap.pid,
  observedBlockingPids: overlap.blockers, facts, doc: d });
 report.status = "PASS_REAL_AUTH_COMMISSION_RECOVERY_PAYOUT_RACE";
 await writeFile(args.out, JSON.stringify(report, null, 2)); console.log(JSON.stringify({ status: report.status, distinctActorsAndPids: true, overlapObserved: true, facts }));
} catch (error) {
 await writeFile(args.out.replace(/\.json$/, "-failure.json"), JSON.stringify({ ...report, status: "FAIL", error: error.message }, null, 2)); throw error;
} finally {
 if (held) await sql`select pg_advisory_unlock(${key}::bigint)`;
 await Promise.allSettled([first, second].filter(Boolean));
 if (trigger) await sql.unsafe("drop trigger qa_hold_commission_recovery on public.payable_adjustments");
 await sql.end({ timeout: 3 });
}
