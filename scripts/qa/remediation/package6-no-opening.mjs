import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { argumentsForRun, openQA, rejected, stockFixture, salesFixture } from "./native-fixture.mjs";
import { isolatedBranchFixture } from "./isolated-branch-fixture.mjs";

const args = argumentsForRun(), qa = await openQA(args), { sql } = qa;
const personas = JSON.parse(await readFile(args.personas, "utf8")).personas;
const rollback = new Error("ROLLBACK_G11_FRESH_BRANCH");
const report = { scope: "G11_FRESH_PENDING_BRANCH_VALID_SOURCE_TRANSACTIONS_WITHOUT_OPENING", database: args.database,
  productionAccess: "NONE", managedAuthTested: false, realAccountRightsChanged: false, checks: [] };
try {
  try {
    await sql.begin(async tx => {
      const local = await isolatedBranchFixture(tx, qa, [personas.finance.subject, personas.warehouse.subject]);
      const f = local.fixtures;
      // RPC resolves from this QA, but its default owner remains the same legitimate QA actor.
      const rpc = qa.rpc;
      const [initial] = await tx`select state,version,reconciliation_id,activation_operation_id from private.branch_operational_states where branch_id=${f.branch}`;
      assert.deepEqual(initial, { state: "PENDING_OPENING", version: 0, reconciliation_id: null, activation_operation_id: null });
      if (args.phase === "before") {
        const error = await rejected(tx, sp => stockFixture(sp, local, "15"), "branch_not_operational: ordinary posting requires ACTIVE", "PT423");
        report.checks.push({ name: "FRESH_BRANCH_CANNOT_START_REAL_NEW_PURCHASE", reproduced: true, initial, error });
      } else {
        const s = await stockFixture(tx, local, "15");
        const sale = await salesFixture(tx, local, s);
        const allocation = await rpc(tx, "upsert_supply_allocation", [sale.line, "WAREHOUSE", null, f.warehouse, "15", null, null, randomUUID()]);
        const delivery = await rpc(tx, "create_delivery_from_allocations", [sale.so, [{ supply_allocation_id: allocation, planned_base_quantity: "15" }], new Date().toISOString(), randomUUID()]);
        const [line] = await tx`select id from public.delivery_lines where delivery_id=${delivery}`;
        await rpc(tx, "assign_delivery", [delivery, null, null, "Xe QA chi nhánh mới", "", 1, randomUUID()]);
        const input = [delivery, 2, new Date().toISOString(), randomUUID(), [{ delivery_line_id: line.id, loaded_base_quantity: "14" }]];
        const handoff = await rpc(tx, "handoff_delivery_actual", input, personas.warehouse.subject); assert.equal(await rpc(tx, "handoff_delivery_actual", input, personas.warehouse.subject), handoff);
        const result = await rpc(tx, "submit_delivery_result", [delivery, "PARTIAL", [{ delivery_line_id: line.id, actual_base_quantity: "14" }], "QA", "", "Nghiệp vụ mới không mở đầu kỳ", null, 3, randomUUID()], personas.warehouse.subject);
        const verified = await rpc(tx, "verify_delivery", [result, [{ delivery_line_id: line.id, accepted_base_quantity: "14", billable_base_quantity: "14", billing_variance_reason: "" }], 4, randomUUID()], personas.warehouse.subject);
        await tx.unsafe("set local role postgres");
        const [ar] = await tx`select id from public.receivable_obligations where delivery_verification_id=${verified}`;
        const account = await rpc(tx, "create_finance_account", [f.branch, s.prefix, "Quỹ mới không nhập tiền đầu kỳ", "CASH", randomUUID()]);
        const pay = [f.branch, "RECEIPT", s.customer, null, account, "1000000", new Date().toISOString(), "CASH", "Thu mới đúng nguồn", [{ obligation_id: ar.id, amount_vnd: "1000000" }], "0", randomUUID()];
        const payment = await rpc(tx, "post_payment", pay, personas.finance.subject); assert.equal(await rpc(tx, "post_payment", pay, personas.finance.subject), payment);
        await tx.unsafe("set local role postgres");
        const [ap] = await tx`select id from public.payable_obligations where purchase_receipt_id in(select id from public.purchase_receipts where purchase_order_id=${s.po})`;
        await rpc(tx, "post_payment", [f.branch, "DISBURSEMENT", null, f.supplier, account, "200000", new Date().toISOString(), "CASH", "Chi mới đúng nguồn", [{ obligation_id: ap.id, amount_vnd: "200000" }], "0", randomUUID()], personas.finance.subject);
        await tx.unsafe("set local role postgres");
        const [facts] = await tx`select (select state from private.branch_operational_states where branch_id=${f.branch}) state,
          (select version from private.branch_operational_states where branch_id=${f.branch}) stateVersion,
          (select activation_operation_id from private.branch_operational_states where branch_id=${f.branch}) activation,
          (select count(*)::int from public.inventory_opening_sources where branch_id=${f.branch}) inventoryOpening,
          (select count(*)::int from public.opening_balance_sources where branch_id=${f.branch}) financeOpening,
          (select count(*)::int from public.cash_opening_balances where branch_id=${f.branch}) cashOpening,
          (select count(*)::int from private.branch_recorded_operations where branch_id=${f.branch}) starts,
          private.current_receivable_outstanding(${ar.id})::text debt,
          (select sum(base_quantity_delta)::text from public.inventory_movements where material_id=${s.material} and location_kind='WAREHOUSE') stock,
          (select count(*)::int from public.payments where branch_id=${f.branch}) payments`;
        assert.deepEqual(facts, { state: "PENDING_OPENING", stateversion: 0, activation: null, inventoryopening: 0, financeopening: 0, cashopening: 0, starts: 1, debt: "2220000", stock: "1.000000", payments: 2 });
        const state = await rpc(tx, "operational_branch_state", [f.branch]);
        assert.equal(state.postingAllowed, true); assert.equal(state.historicalQuality, "UNRECONCILED"); assert.equal(state.canActivate, false);
        const upper = new Date(Date.now() + 86400000).toISOString();
        const snapshot = await rpc(tx, "finance_dashboard_snapshot", [f.branch, "2000-01-01T00:00:00Z", upper, upper, s.customer, null, null, "DELIVERY"]);
        assert.equal(snapshot.scope.balance_scope, "RECORDED_TRANSACTIONS"); assert.equal(snapshot.scope.historical_quality, "UNRECONCILED"); assert.equal(snapshot.scope.business_total_verified, false);
        const [revenue] = await tx`select sum(amount_vnd)::text amount from public.revenue_entries where sales_order_id=${sale.so}`;
        assert.equal(revenue.amount, "3220000");
        report.checks.push({ name: "NEW_PURCHASE_RECEIPT_SO_ACTUAL_HANDOFF_VERIFY_RECEIPT_DISBURSEMENT_WITHOUT_OPENING", status: "PASS", facts, state, scope: snapshot.scope, recordedRevenueSource: revenue.amount, postCommitReportCheck: "SEPARATE_HTTP_REQUIRED" });
        await rejected(tx, sp => rpc(sp, "handoff_delivery_actual", [delivery, null, new Date().toISOString(), randomUUID(), [{ delivery_line_id: line.id, loaded_base_quantity: "14" }]], personas.warehouse.subject), null, "PT409");
        await rejected(tx, sp => rpc(sp, "post_payment", [f.branch, "RECEIPT", s.customer, null, account, "1", new Date().toISOString(), "CASH", "Không vượt nợ và tiền", [{ obligation_id: ar.id, amount_vnd: "9999999" }], "0", randomUUID()], personas.finance.subject), null, "23514");
        await rejected(tx, sp => rpc(sp, "create_sales_order_draft", [qa.fixtures.branch, s.customer, s.site, null, "Không vượt phạm vi", [{ ...s.common, unit_price_vnd: "230000", pricing_rule_id: s.price, pricing_rule_version: 1, price_source_type: "LIST" }], randomUUID()]), null, "23503");
        report.checks.push({ name: "VERSIONS_ALLOCATION_CAPS_AND_CROSS_BRANCH_SCOPE_RETAINED", status: "PASS" });
        const close = [sale.so, "Đóng phần còn lại1 chưa giao QA", randomUUID()];
        assert.equal(await rpc(tx, "close_sales_order_remaining", close), sale.so);
        assert.equal(await rpc(tx, "close_sales_order_remaining", close), sale.so);
        await tx.unsafe("set local role postgres");
        const [closed] = await tx`select o.commercial_state,c.consumed_vnd::text consumed,c.released_vnd::text released,
          (select count(*)::int from public.audit_events where trace_id=${close[2]}) audits from public.sales_orders o join public.credit_commitments c on c.sales_order_id=o.id where o.id=${sale.so}`;
        assert.deepEqual(closed, { commercial_state: "CLOSED", consumed: "3220000", released: "230000", audits: 1 });
        report.checks.push({ name: "G03_CLOSE_ONLY_REMAINDER_WITHOUT_CHANGED_BILLED_TOTAL_RETRY_ONCE", status: "PASS", closed });
        const directSale = await salesFixture(tx, local, { ...s, common: { ...s.common, quantity: "1" } });
        const directPo = await rpc(tx, "create_direct_purchase_from_sales_line", [directSale.line, f.supplier, "1",
          { ...s.common, quantity: "1", unit_cost_vnd: "150000", purchase_price_rule_id: s.cost, purchase_price_rule_version: 1, price_source_type: "CONTRACT" }, null, randomUUID()]);
        await rpc(tx, "confirm_purchase_order", [directPo, randomUUID()]);
        const [pol] = await tx`select id from public.purchase_order_lines where purchase_order_id=${directPo}`;
        await rpc(tx, "verify_supplier_fulfillment", [directPo, [{ purchase_order_line_id: pol.id, supplier_quantity: "1" }], null, "NCC mới không kho giả", randomUUID()], personas.warehouse.subject);
        await tx.unsafe("set local role postgres");
        const [da] = await tx`select id from public.supply_allocations where purchase_order_line_id=${pol.id}`;
        const directDelivery = await rpc(tx, "create_delivery_from_allocations", [directSale.so, [{ supply_allocation_id: da.id, planned_base_quantity: "1" }], new Date().toISOString(), randomUUID()]);
        const [dl] = await tx`select id from public.delivery_lines where delivery_id=${directDelivery}`;
        await rpc(tx, "assign_delivery", [directDelivery, null, null, "Xe direct QA mới", "", 1, randomUUID()]);
        await rpc(tx, "handoff_delivery_actual", [directDelivery, 2, new Date().toISOString(), randomUUID(), [{ delivery_line_id: dl.id, loaded_base_quantity: "1" }]], personas.warehouse.subject);
        const dr = await rpc(tx, "submit_delivery_result", [directDelivery, "FULL", [{ delivery_line_id: dl.id, actual_base_quantity: "1" }], "QA", "", "Giao thẳng mới", null, 3, randomUUID()], personas.warehouse.subject);
        await rpc(tx, "verify_delivery", [dr, [{ delivery_line_id: dl.id, accepted_base_quantity: "1", billable_base_quantity: "1", billing_variance_reason: "" }], 4, randomUUID()], personas.warehouse.subject);
        await tx.unsafe("set local role postgres");
        const [direct] = await tx`select (select sum(base_quantity_delta)::text from public.inventory_movements where material_id=${s.material} and location_kind='WAREHOUSE') warehouse,
          (select count(*)::int from public.inventory_movements where delivery_id=${directDelivery} and location_kind='IN_TRANSIT') fakeTransit,
          (select sum(amount_vnd)::text from public.revenue_entries where sales_order_id=${directSale.so}) revenue,
          (select count(*)::int from private.branch_recorded_operations where branch_id=${f.branch}) starts`;
        assert.deepEqual(direct, { warehouse: "1.000000", faketransit: 0, revenue: "230000", starts: 1 });
        report.checks.push({ name: "DIRECT_SOURCE_PURCHASE_HANDOFF_VERIFY_NO_FAKE_WAREHOUSE_WITHOUT_ACTIVATION", status: "PASS", direct });
        const advancePayment = await rpc(tx, "post_payment", [f.branch, "RECEIPT", s.customer, null, account, "100000", new Date().toISOString(), "CASH", "Ứng trước mới100k QA", [], "100000", randomUUID()], personas.finance.subject);
        const allocate = [advancePayment, [{ obligation_id: ar.id, amount_vnd: "75000" }], randomUUID()];
        const allocated = await rpc(tx, "allocate_payment", allocate, personas.finance.subject); assert.equal(await rpc(tx, "allocate_payment", allocate, personas.finance.subject), allocated);
        await tx.unsafe("set local role postgres");
        const [advance] = await tx`select (select count(*)::int from public.payments where branch_id=${f.branch}) payments,
          private.payment_available(${advancePayment})::text available,
          (select sum(private.advance_remaining(id))::text from public.advances where payment_id=${advancePayment}) advance,
          (select count(*)::int from public.payment_allocations where payment_id=${advancePayment}) allocations`;
        assert.deepEqual(advance, { payments: 3, available: "25000", advance: "25000", allocations: 1 });
        report.checks.push({ name: "NEW_G07_REGRESSION100K_ALLOCATE75K_WITHOUT_NEW_CASH_NO_EXCLUDED_RACE", status: "PASS", advance });
        const historical = await rpc(tx, "finance_dashboard_snapshot", [f.branch, "2000-01-01T00:00:00Z", upper, "2000-01-02T00:00:00Z", s.customer, null, null, "DELIVERY"]);
        assert.equal(historical.scope.recorded_operations_since, null);
        report.checks.push({ name: "EARLIER_KNOWLEDGE_DOES_NOT_CLAIM_FUTURE_RECORDING_START", status: "PASS", scope: historical.scope });
        await tx.unsafe("set constraints all immediate");
      }
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  report.status = args.phase === "before" ? "REPRODUCED_MANDATORY_OPENING_GATE" : "PASS_NO_OPENING_NATIVE_SOURCE_FLOW"; report.rolledBack = true;
  await writeFile(args.out, JSON.stringify(report, null, 2)); console.log(JSON.stringify({ status: report.status, checks: report.checks.length }));
} catch (error) {
  await writeFile(args.out.replace(/\.json$/, "-failure.json"), JSON.stringify({ ...report, status: "FAIL", error: { code: error.code, message: error.message } }, null, 2)); throw error;
} finally { await sql.end({ timeout: 3 }); }
