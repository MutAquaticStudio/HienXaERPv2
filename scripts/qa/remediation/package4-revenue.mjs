import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { realQAAuth } from "./auth.mjs";
import { argumentsForRun, openQA } from "./native-fixture.mjs";
import { paidReturnScenario } from "./package4-return-fixture.mjs";
const args = argumentsForRun(), qa = await openQA(args);
const finance = JSON.parse(await readFile(args.personas, "utf8")).personas.finance.subject;
const auth = await realQAAuth(args["auth-env"], { finance: "hxqa-finance-employee@example.test", warehouse: "hxqa-warehouse-dispatch@example.test" });
assert.equal(auth.accounts.finance.subject, finance);
let observer;
const report = { scope: "G09_ACTUAL_AUTH_SIGNED_REVENUE_PERIOD_CUTOFF_CLASSIFICATION", database: args.database,
  productionAccess: "NONE", tokensRecorded: false, managedQaBusinessWrites: 0, checks: [] };
try {
  const docs = await qa.sql.begin(async tx => {
    const [{ pid: writerPid }] = await tx`select pg_backend_pid() pid`;
    return { paid: await paidReturnScenario(tx, qa, finance, { resolveReturn: false }), unpaid: await paidReturnScenario(tx, qa, finance, { paid: "0" }), writerPid };
  });
  observer = await openQA(args);
  const [{ pid: readerPid }] = await observer.sql`select pg_backend_pid() pid`; assert.notEqual(readerPid, docs.writerPid);
  const [{ cutoff }] = await observer.sql`select clock_timestamp()::text cutoff`;
  const upper = new Date(Date.now() + 86400000).toISOString();
  const params = (doc, from = "2000-01-01T00:00:00Z", to = upper, known = upper) => ({ target_branch_id: qa.fixtures.branch,
    from_inclusive: from, to_exclusive: to, knowledge_cutoff: known, target_customer_id: doc.stock.customer, target_activity_kind: "DELIVERY" });
  const snapshot = async input => { const r = await auth.api("finance", "rpc/finance_dashboard_snapshot", input); assert.equal(r.status, 200); return r.data; };
  const before = await snapshot(params(docs.paid));
  assert.equal(before.revenue.value_vnd, "3220000"); assert.equal(before.direct_cost.value_vnd, "2100000"); assert.equal(before.gross_profit.value_vnd, "1120000");
  const resolved = await auth.api("warehouse", "rpc/resolve_return_case", { target_return_case_id: docs.paid.returnCase, resolution: "RETURNED",
    target_warehouse_id: qa.fixtures.warehouse, resolution_reason: "Nhận1m3 về kho để đối chiếu kỳ", target_evidence_id: null, expected_version: 1, operation_id: randomUUID() });
  assert.equal(resolved.status, 200);
  const approval = { target_return_case_id: docs.paid.returnCase, credit_amount_vnd: "230000", adjustment_reason: "Giảm1m3 theo nguồn230k", operation_id: randomUUID() };
  const adjust = await auth.api("finance", "rpc/adjust_return_receivable", approval); assert.equal(adjust.status, 200);
  assert.equal((await auth.api("finance", "rpc/adjust_return_receivable", approval)).data, adjust.data);
  const [source] = await observer.sql`select count(*)::int entries,sum(amount_delta_vnd)::text delta
    from public.revenue_adjustments where receivable_adjustment_id=${adjust.data}`;
  assert.deepEqual(source, { entries: 1, delta: "-230000" });
  const net = await snapshot(params(docs.paid));
  assert.equal(net.revenue.value_vnd, "2990000"); assert.equal(net.direct_cost.value_vnd, "1950000"); assert.equal(net.gross_profit.value_vnd, "1040000");
  const oldKnowledge = await snapshot(params(docs.paid, "2000-01-01T00:00:00Z", upper, cutoff));
  assert.equal(oldKnowledge.revenue.value_vnd, "3220000"); assert.equal(oldKnowledge.direct_cost.value_vnd, "2100000");
  const earlierPeriod = await snapshot(params(docs.paid, "2000-01-01T00:00:00Z", cutoff));
  assert.equal(earlierPeriod.revenue.value_vnd, "3220000"); assert.equal(earlierPeriod.gross_profit.value_vnd, "1120000");
  const laterPeriod = await snapshot(params(docs.paid, cutoff));
  assert.equal(laterPeriod.revenue.value_vnd, "-230000"); assert.equal(laterPeriod.direct_cost.value_vnd, "-150000"); assert.equal(laterPeriod.gross_profit.value_vnd, "-80000");
  report.checks.push({ name: "RETURN_NET_ONCE_AND_CROSS_PERIOD_KNOWLEDGE_CUTOFF", status: "PASS", source, before, net, oldKnowledge, earlierPeriod, laterPeriod });
  const typed = kind => ({ target_obligation_id: docs.unpaid.obligation, amount_delta_vnd: kind === "PRICE" ? "-100000" : "-50000",
    adjustment_kind: kind, reason: "Điều chỉnh " + kind + " trên QA", target_evidence_id: null, operation_id: randomUUID() });
  for (const kind of ["PRICE", "WRITE_OFF", "OTHER"]) {
    const payload = typed(kind), result = await auth.api("finance", "rpc/record_receivable_adjustment_typed", payload);
    assert.equal(result.status, 200); assert.equal((await auth.api("finance", "rpc/record_receivable_adjustment_typed", payload)).data, result.data);
  }
  const classified = await snapshot(params(docs.unpaid));
  assert.equal(classified.revenue.value_vnd, "3120000"); // Only the price correction changes revenue.
  const [classification] = await observer.sql`select
    (select count(*)::int from public.revenue_adjustments ra join public.receivable_adjustments a on a.id=ra.receivable_adjustment_id where a.obligation_id=${docs.unpaid.obligation}) revenueRows,
    private.current_receivable_outstanding(${docs.unpaid.obligation})::text debt`;
  assert.deepEqual(classification, { revenuerows: 1, debt: "3020000" });
  report.checks.push({ name: "PRICE_CHANGES_REVENUE_WRITE_OFF_OTHER_DO_NOT", status: "PASS", classified, classification });
  report.docs = docs; report.readerPid = readerPid; report.cutoff = cutoff; report.status = "PASS_AUTHENTICATED_REVENUE_CLASSIFICATION_AND_CUTOFF";
  await writeFile(args.out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, revenue: net.revenue, cost: net.direct_cost, gross: net.gross_profit }));
} catch (error) {
  await writeFile(args.out.replace(/\.json$/, "-failure.json"), JSON.stringify({ ...report, status: "FAIL", error: error.message }, null, 2)); throw error;
} finally { if (observer) await observer.sql.end({ timeout: 3 }); await qa.sql.end({ timeout: 3 }); }
