import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { realQAAuth } from "./auth.mjs";
import { argumentsForRun, openQA } from "./native-fixture.mjs";
const args = argumentsForRun();
const auth = await realQAAuth(args["auth-env"], { finance: "hxqa-finance-employee@example.test", sales: "hxqa-sales@example.test", warehouse: "hxqa-warehouse-dispatch@example.test" });
const qa = await openQA(args);
const f = qa.fixtures;
const docs = JSON.parse(await readFile(args.documents, "utf8")).documents;
const report = { scope: "REAL_QA_JWT_POSTGREST_QUANTITY_VERSION_AND_OUTCOME_BOUNDARIES", database: args.database, productionAccess: "NONE", checks: [] };
try {
  const sale = { material_id: f.material, ordered_uom_id: f.uom, quantity: "1.0000004", conversion_numerator: "1", conversion_denominator: "1", rounding_mode: "HALF_UP", unit_price_vnd: "2000000", pricing_rule_id: f.salesPrice, pricing_rule_version: 1, price_source_type: "LIST" };
  const precision = await auth.api("sales", "rpc/create_sales_order_draft", { target_branch_id: f.branch, target_customer_id: f.customer, target_site_id: f.site,
    requested_delivery_at: null, commercial_terms: "QA quantity boundary", order_lines: [sale], operation_id: randomUUID() });
  assert.equal(precision.status, 400);
  assert.equal(precision.data.message, "quantity_precision_exceeds_six");
  report.checks.push({ name: "G02_REAL_SALES_RPC_REJECTS_PRECISION_BEFORE_PRICE_OR_WRITE", status: "PASS", httpStatus: precision.status });
  const [delivery] = await qa.sql`select id from public.deliveries where execution_state='ASSIGNED' and branch_id=${f.branch} limit 1`;
  if (delivery) {
    const nullVersion = await auth.api("warehouse", "rpc/assign_delivery", { target_delivery_id: delivery.id, target_employee_id: null, target_vehicle_id: null,
      external_carrier_name: "Nhà xe QA", external_carrier_contact: "000", expected_version: null, operation_id: randomUUID() });
    assert.equal(nullVersion.status, 409);
    assert.equal(nullVersion.data.message, "delivery_assignment_version_conflict");
    report.checks.push({ name: "G12_REAL_WAREHOUSE_NULL_VERSION_DENIED", status: "PASS", httpStatus: nullVersion.status });
  } else report.checks.push({ name: "G12_REAL_WAREHOUSE_NULL_VERSION_DENIED", status: "NOT_RUN", reason: "No ASSIGNED fixture; native null-version regression exists" });
  const [payment] = await qa.sql`select p.id,r.operation_id from public.payments p join public.command_receipts r on r.result_entity_id=p.id
    where p.customer_id=${docs.customer} and r.command_name='post_payment' order by r.created_at limit 1`;
  assert.ok(payment);
  const own = await auth.api("finance", "rpc/lookup_command_outcome", { target_operation_id: payment.operation_id, target_command: "post_payment", target_branch_id: docs.branch });
  assert.equal(own.status, 200);
  assert.equal(own.data.status, "COMMITTED");
  assert.equal(own.data.result_id, payment.id);
  const denied = await auth.api("sales", "rpc/lookup_command_outcome", { target_operation_id: payment.operation_id, target_command: "post_payment", target_branch_id: docs.branch });
  assert.equal(denied.status, 403);
  const unknown = await auth.api("finance", "rpc/lookup_command_outcome", { target_operation_id: randomUUID(), target_command: "post_payment", target_branch_id: docs.branch });
  assert.equal(unknown.status, 200);
  assert.equal(unknown.data.status, "UNKNOWN");
  report.checks.push({ name: "G15_REAL_FINANCE_DURABLE_RESULT_SALES_DENIED_ABSENT_IS_UNKNOWN", status: "PASS", resultId: payment.id, deniedStatus: denied.status });
  report.status = "PASS_EXECUTED_HTTP_SCOPE_WITH_EXPLICIT_NOT_RUN";
  await writeFile(args.out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length }));
} finally { await qa.sql.end({ timeout: 3 }); }
