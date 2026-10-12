import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { argumentsForRun, openQA, rejected, salesFixture, stockFixture } from "./native-fixture.mjs";

const args = argumentsForRun();
const qa = await openQA(args);
const { sql, fixtures: f, rpc } = qa;
const report = { scope: "NATIVE_EXACT_QUANTITY_CUMULATIVE_BILLING_VERSION_CONTRACTS", database: args.database,
  managedAuthTested: false, productionAccess: "NONE", checks: [] };
const rollback = new Error("ROLLBACK_TEST_FIXTURE");
async function scenario(name, body, options) {
  try {
    await sql.begin(async (tx) => {
      const stock = await stockFixture(tx, qa, "45", options);
      report.checks.push({ name, status: "PASS", ...await body(tx, stock) });
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
}
try {
  await scenario("G02_COMMERCIAL_AND_PURCHASE_PRECISION_BEFORE_MONEY", async (tx, s) => {
    const sale = { ...s.common, quantity: "1.0000004", unit_price_vnd: "2000000", pricing_rule_id: s.price, pricing_rule_version: 1, price_source_type: "LIST" };
    const purchase = { ...s.common, quantity: "1.0000004", unit_cost_vnd: "150000", purchase_price_rule_id: s.cost, purchase_price_rule_version: 1, price_source_type: "CONTRACT" };
    const salesError = await rejected(tx, (sp) => rpc(sp, "create_sales_order_draft", [f.branch, s.customer, s.site, null, "QA precision", [sale], randomUUID()]), "quantity_precision_exceeds_six", "22023");
    const quoteError = await rejected(tx, (sp) => rpc(sp, "create_quote_draft", [f.branch, s.customer, s.site, null, "QA precision", [sale], randomUUID()]), "quantity_precision_exceeds_six", "22023");
    const purchaseError = await rejected(tx, (sp) => rpc(sp, "create_purchase_order_draft", [f.branch, f.supplier, f.warehouse, null, "QA precision", [purchase], randomUUID()]), "quantity_precision_exceeds_six", "22023");
    for (const quantity of ["NaN", "Infinity", "-1", "1,5", "", "100000000000000"]) {
      await rejected(tx, (sp) => rpc(sp, "create_sales_order_draft", [f.branch, s.customer, s.site, null, "QA invalid quantity", [{ ...sale, quantity }], randomUUID()]), null, "22023");
    }
    const valid = await rpc(tx, "create_sales_order_draft", [f.branch, s.customer, s.site, null, "QA exact", [{ ...sale, quantity: "1.000001" }], randomUUID()]);
    const [facts] = await tx`select quantity::text qty,line_total_vnd::text amount from public.sales_order_lines where sales_order_id=${valid}`;
    assert.deepEqual(facts, { qty: "1.000001", amount: "2000002" });
    return { salesError, quoteError, purchaseError, valid: facts, invalidInputsRejected: 6 };
  }, { unitPriceVnd: "2000000" });
  await scenario("G03_FRACTIONAL_TRIPS_TOTAL_EXACT_AND_IDEMPOTENT", async (tx, s) => {
    const sales = await salesFixture(tx, qa, s);
    const allocation = await rpc(tx, "upsert_supply_allocation", [sales.line, "WAREHOUSE", null, f.warehouse, "45", null, null, randomUUID()]);
    const amounts = [];
    for (const quantity of ["15.000003", "15.000003", "14.999994"]) {
      const d = await rpc(tx, "create_delivery_from_allocations", [sales.so, [{ supply_allocation_id: allocation, planned_base_quantity: quantity }], new Date().toISOString(), randomUUID()]);
      const [line] = await tx`select id from public.delivery_lines where delivery_id=${d}`;
      await rpc(tx, "assign_delivery", [d, null, null, "Nhà xe QA", "000", 1, randomUUID()]);
      await rpc(tx, "handoff_delivery", [d, 2, new Date().toISOString(), randomUUID()]);
      await rpc(tx, "mark_delivery_arrived", [d, 3, randomUUID()]);
      const result = await rpc(tx, "submit_delivery_result", [d, "FULL", [{ delivery_line_id: line.id, actual_base_quantity: quantity }], "Người nhận QA", "", null, null, 4, randomUUID()]);
      const operation = randomUUID();
      const lines = [{ delivery_line_id: line.id, accepted_base_quantity: quantity, billable_base_quantity: quantity, billing_variance_reason: "" }];
      const verification = await rpc(tx, "verify_delivery", [result, lines, 5, operation]);
      assert.equal(await rpc(tx, "verify_delivery", [result, lines, 5, operation]), verification);
      const [amount] = await tx`select original_amount_vnd::text amount from public.receivable_obligations where delivery_verification_id=${verification}`;
      amounts.push(amount.amount);
    }
    const [facts] = await tx`select (select consumed_vnd::text from public.credit_commitments where sales_order_id=${sales.so}) consumed,
      (select sum(amount_vnd)::text from public.revenue_entries where sales_order_id=${sales.so}) revenue,
      (select count(*)::int from public.delivery_verifications where delivery_id in(select id from public.deliveries where sales_order_id=${sales.so})) verifications`;
    assert.deepEqual(amounts, ["3450001", "3450000", "3449999"]);
    assert.deepEqual(facts, { consumed: "10350000", revenue: "10350000", verifications: 3 });
    return { amounts, facts };
  });
  await scenario("G12_NULL_STALE_VALID_AND_RETRY_VERSIONS", async (tx, s) => {
    const sales = await salesFixture(tx, qa, s);
    const allocation = await rpc(tx, "upsert_supply_allocation", [sales.line, "WAREHOUSE", null, f.warehouse, "45", null, null, randomUUID()]);
    const d = await rpc(tx, "create_delivery_from_allocations", [sales.so, [{ supply_allocation_id: allocation, planned_base_quantity: "15" }], new Date().toISOString(), randomUUID()]);
    for (const version of [null, 0, 99]) await rejected(tx, (sp) => rpc(sp, "assign_delivery", [d, null, null, "Nhà xe QA", "000", version, randomUUID()]), "delivery_assignment_version_conflict", "PT409");
    const operation = randomUUID();
    await rpc(tx, "assign_delivery", [d, null, null, "Nhà xe QA", "000", 1, operation]);
    await rpc(tx, "assign_delivery", [d, null, null, "Nhà xe QA", "000", 1, operation]);
    await rejected(tx, (sp) => rpc(sp, "handoff_delivery", [d, null, new Date().toISOString(), randomUUID()]), "delivery_not_handoff_ready", "PT409");
    await rejected(tx, (sp) => rpc(sp, "upsert_supply_allocation", [sales.line, "WAREHOUSE", null, f.warehouse, "45", allocation, null, randomUUID()]), "allocation_version_conflict", "PT409");
    const [facts] = await tx`select version,(select count(*)::int from public.delivery_assignments where delivery_id=${d}) assignments from public.deliveries where id=${d}`;
    assert.deepEqual(facts, { version: 2, assignments: 1 });
    return { nullAndStaleDenied: 5, facts };
  });
  report.status = "PASS_EXECUTED_DB_SCOPE";
  report.rolledBack = true;
  await writeFile(args.out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, scenarios: report.checks.length, rolledBack: true }));
} finally { await sql.end({ timeout: 3 }); }
