import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { argumentsForRun, openQA, stockFixture } from "./native-fixture.mjs";
import { isolatedBranchFixture } from "./isolated-branch-fixture.mjs";
import { realQAAuth } from "./auth.mjs";

const args = argumentsForRun(), qa = await openQA(args), { sql } = qa;
const personas = JSON.parse(await readFile(args.personas, "utf8")).personas;
const auth = await realQAAuth(args["auth-env"], { owner: "hxqa-owner@example.test", finance: "hxqa-finance-employee@example.test", warehouse: "hxqa-warehouse-dispatch@example.test", worker: "hxqa-worker@example.test" });
const report = { scope: "G11_REAL_AUTH_FRESH_PENDING_BRANCH_POSTCOMMIT_INDEPENDENT_READ", database: args.database,
  productionAccess: "NONE", managedQaBusinessWrites: 0, cloudRolesChanged: false, tokensRecorded: false, checks: [] };
let observer;
try {
  const signatures = await sql`select p.proname name,p.proargnames names,p.pronargs,p.pronargdefaults defaults
    from pg_proc p join pg_namespace n on p.pronamespace=n.oid where n.nspname='public' and p.prokind='f'`;
  async function command(role, name, values) {
    const matches = signatures.filter(s => s.name === name && values.length <= s.pronargs && values.length >= s.pronargs - s.defaults);
    assert.equal(matches.length, 1, "Ambiguous command " + name);
    const input = Object.fromEntries(values.map((value, i) => [matches[0].names[i], value]));
    const result = await auth.api(role, "rpc/" + name, input);
    assert.equal(result.status, 200, JSON.stringify({ name, ...result }));
    return result.data;
  }
  async function createActualSource() {
  const d = await sql.begin(async tx => {
    const local = await isolatedBranchFixture(tx, qa, [personas.finance.subject, personas.warehouse.subject]);
    const stock = await stockFixture(tx, local, "15", { prepareOnly: true });
    await tx.unsafe("set local role postgres");
    const [line] = await tx`select id from public.purchase_order_lines where purchase_order_id=${stock.po}`;
    const [{ pid }] = await tx`select pg_backend_pid() pid`;
    const [before] = await tx`select state,version,(select count(*)::int from private.branch_recorded_operations where branch_id=${local.fixtures.branch}) starts from private.branch_operational_states where branch_id=${local.fixtures.branch}`;
    assert.deepEqual(before, { state: "PENDING_OPENING", version: 0, starts: 0 });
    return { stock, fixtures: local.fixtures, purchaseLine: line.id, writerPid: pid };
  });
  const f = d.fixtures, s = d.stock;
  await command("owner", "confirm_purchase_order", [s.po, randomUUID()]);
  const received = [s.po, [{ purchase_order_line_id: d.purchaseLine, received_quantity: "14" }], null, new Date().toISOString(), randomUUID()];
  const receipt = await command("warehouse", "receive_purchase_order", received); assert.equal(await command("warehouse", "receive_purchase_order", received), receipt);
  const so = await command("owner", "create_sales_order_draft", [f.branch, s.customer, s.site, null, "Đơn mới qua Auth không đầu kỳ",
    [{ ...s.common, unit_price_vnd: "230000", pricing_rule_id: s.price, pricing_rule_version: 1, price_source_type: "LIST" }], randomUUID()]);
  await command("owner", "confirm_sales_order", [so, randomUUID()]);
  const [saleLine] = await sql`select id from public.sales_order_lines where sales_order_id=${so}`;
  const allocation = await command("owner", "upsert_supply_allocation", [saleLine.id, "WAREHOUSE", null, f.warehouse, "15", null, null, randomUUID()]);
  const delivery = await command("owner", "create_delivery_from_allocations", [so, [{ supply_allocation_id: allocation, planned_base_quantity: "14" }], new Date().toISOString(), randomUUID()]);
  const [line] = await sql`select id from public.delivery_lines where delivery_id=${delivery}`;
  await command("owner", "assign_delivery", [delivery, null, null, "Xe ngoài mới qua Auth", "", 1, randomUUID()]);
  await command("warehouse", "handoff_delivery_actual", [delivery, 2, new Date().toISOString(), randomUUID(), [{ delivery_line_id: line.id, loaded_base_quantity: "14" }]]);
  const result = await command("warehouse", "submit_delivery_result", [delivery, "FULL", [{ delivery_line_id: line.id, actual_base_quantity: "14" }], "QA", "", "Nghiệp vụ nguồn mới qua Auth", null, 3, randomUUID()]);
  const verification = await command("warehouse", "verify_delivery", [result, [{ delivery_line_id: line.id, accepted_base_quantity: "14", billable_base_quantity: "14", billing_variance_reason: "" }], 4, randomUUID()]);
  const [ar] = await sql`select id from public.receivable_obligations where delivery_verification_id=${verification}`;
  const account = await command("owner", "create_finance_account", [f.branch, s.prefix, "Quỹ mới qua Auth không tiền đầu kỳ", "CASH", randomUUID()]);
  const paymentInputs = [f.branch, "RECEIPT", s.customer, null, account, "300000", new Date().toISOString(), "CASH", "Thu mới qua Auth300k", [{ obligation_id: ar.id, amount_vnd: "300000" }], "0", randomUUID()];
  const payment = await command("finance", "post_payment", paymentInputs); assert.equal(await command("finance", "post_payment", paymentInputs), payment);
  return { ...d, so, delivery, obligation: ar.id, account, payment, branch: f.branch, customer: s.customer };
  }
  const d = args.documents ? JSON.parse(await readFile(args.documents, "utf8")).documents : await createActualSource();
  const f = d.fixtures, s = d.stock, so = d.so, delivery = d.delivery, ar = { id: d.obligation }, account = d.account, payment = d.payment;
  report.documents = d;
  await writeFile(args.out.replace(/\.json$/, "-sources.json"), JSON.stringify({ documents: d, scope: "G11_COMMITTED_AUTH_SOURCE_CHECKPOINT", productionAccess: "NONE" }, null, 2));
  observer = await openQA(args);
  const [{ pid: readerPid }] = await observer.sql`select pg_backend_pid() pid`; const [{ pid: inspectorPid }] = await sql`select pg_backend_pid() pid`; assert.notEqual(readerPid, inspectorPid);
  if (d.writerPid) assert.notEqual(readerPid, d.writerPid);
  const [after] = await observer.sql`select state,version,activation_operation_id activation,
    (select count(*)::int from private.branch_recorded_operations where branch_id=${f.branch}) starts,
    (select count(*)::int from public.audit_events where branch_id=${f.branch} and action='operations.recording_started') startAudits,
    (select count(*)::int from public.payments where branch_id=${f.branch}) payments,
    private.current_receivable_outstanding(${ar.id})::text debt,
    (select count(*)::int from public.inventory_opening_sources where branch_id=${f.branch}) stockOpening,
    (select count(*)::int from public.opening_balance_sources where branch_id=${f.branch}) debtOpening,
    (select count(*)::int from public.cash_opening_balances where branch_id=${f.branch}) cashOpening
    from private.branch_operational_states where branch_id=${f.branch}`;
  assert.deepEqual(after, { state: "PENDING_OPENING", version: 0, activation: null, starts: 1, startaudits: 1, payments: 1, debt: "2920000", stockopening: 0, debtopening: 0, cashopening: 0 });
  const [{ start }] = await observer.sql`select started_at::text start from private.branch_recorded_operations where branch_id=${f.branch}`;
  const state = await command("owner", "operational_branch_state", [f.branch]);
  assert.equal(state.postingAllowed, true); assert.equal(state.historicalQuality, "UNRECONCILED");
  const upper = new Date(Date.now() + 86400000).toISOString();
  const snapshot = await command("finance", "finance_dashboard_snapshot", [f.branch, "2000-01-01T00:00:00Z", upper, upper, s.customer, null, null, "DELIVERY"]);
  assert.equal(snapshot.revenue.value_vnd, "3220000"); assert.equal(snapshot.receivable.value_vnd, "2920000"); assert.equal(snapshot.gross_profit.value_vnd, "1120000");
  assert.equal(snapshot.scope.business_total_verified, false); assert.equal(snapshot.scope.historical_quality, "UNRECONCILED");
  const denied = await auth.api("worker", "rpc/operational_branch_state", { target_branch_id: f.branch }); assert.equal(denied.status, 403);
  const deniedCost = await auth.api("warehouse", "rpc/finance_dashboard_snapshot", { target_branch_id: f.branch, from_inclusive: "2000-01-01T00:00:00Z", to_exclusive: upper, knowledge_cutoff: upper });
  assert.equal(deniedCost.status, 200); assert.equal(deniedCost.data.direct_cost.quality, "FORBIDDEN"); assert.equal(deniedCost.data.direct_cost.value_vnd, null); assert.equal(deniedCost.data.gross_profit.quality, "FORBIDDEN");
  const [later] = await observer.sql`select started_at::text start from private.branch_recorded_operations where branch_id=${f.branch}`; assert.equal(later.start, start);
  report.checks.push({ name: "ACTUAL_AUTH_NEW_RECEIPT_DELIVERY_AND_PAYMENT_NO_OPENING_OR_ACTIVATION", status: "PASS", after, state, snapshot });
  report.checks.push({ name: "RECORDING_START_STABLE_AND_UNAUTHORIZED_BRANCH_COST_DENIED", status: "PASS", start, workerStatus: denied.status, warehouseReportStatus: deniedCost.status, costQuality: deniedCost.data.direct_cost.quality });
  report.documents = { ...d, so, delivery, obligation: ar.id, account, payment, branch: f.branch, customer: s.customer }; report.readerPid = readerPid;
  report.status = "PASS_REAL_AUTH_G11_NEW_TRANSACTIONS_POSTCOMMIT";
  await writeFile(args.out, JSON.stringify(report, null, 2)); console.log(JSON.stringify({ status: report.status, checks: report.checks.length, noOpening: true, stateUnchanged: true }));
} catch (error) {
  await writeFile(args.out.replace(/\.json$/, "-failure.json"), JSON.stringify({ ...report, status: "FAIL", error: { code: error.code, message: error.message } }, null, 2)); throw error;
} finally { if (observer) await observer.sql.end({ timeout: 3 }); await sql.end({ timeout: 3 }); }
