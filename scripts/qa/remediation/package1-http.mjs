import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { realQAAuth } from "./auth.mjs";
import { argumentsForRun, openQA } from "./native-fixture.mjs";

const args = argumentsForRun();
assert.ok(args["auth-env"]);
assert.ok(args.documents);
const documents = JSON.parse(await readFile(args.documents, "utf8")).documents;
const qa = await openQA(args);
const auth = await realQAAuth(args["auth-env"], { owner: "hxqa-owner@example.test", sales: "hxqa-sales@example.test",
  warehouse: "hxqa-warehouse-dispatch@example.test", finance: "hxqa-finance-employee@example.test", worker: "hxqa-worker@example.test" });
const { api } = auth;
const report = { scope: "REAL_MANAGED_QA_AUTH_ES256_POSTGREST_ISOLATED_NATIVE_DB", database: args.database,
  tokensRecorded: false, managedQaBusinessWrites: 0, productionAccess: "NONE", checks: [] };
const passed = (name, facts) => report.checks.push({ name, status: "PASS", ...facts });
try {
  const forged = auth.accounts.sales.token.split(".");
  forged[2] = (forged[2][0] === "a" ? "b" : "a") + forged[2].slice(1);
  assert.equal((await api("sales", "employees?select=id", undefined, forged.join("."))).status, 401);
  passed("FORGED_SIGNATURE_REJECTED", { httpStatus: 401 });
  for (const resource of [
    `delivery_verification_lines?select=inventory_cost_vnd&delivery_verification_id=eq.${documents.verification}`,
    `delivery_verification_lines?select=id&inventory_cost_vnd=gt.0`,
    `delivery_verification_lines?select=id&order=inventory_cost_vnd.desc`,
    `delivery_handoff_lines?select=inventory_value_vnd&delivery_line_id=eq.${documents.costLine}`,
    `stock_count_lines?select=adjustment_unit_cost_vnd&stock_count_id=eq.${documents.staleCount}`,
  ]) {
    const response = await api("sales", resource);
    assert.equal(response.status, 403);
    assert.equal(response.data.code, "42501");
    passed("G05_DIRECT_COST_OR_INFERENCE_DENIED", { resource: resource.split("?")[0], httpStatus: response.status });
  }
  const safe = await api("sales", `delivery_verification_line_read?select=id,accepted_base_quantity,inventory_cost_vnd,inventory_unit_cost_vnd_per_base&delivery_verification_id=eq.${documents.verification}`);
  assert.equal(safe.status, 200);
  assert.equal(safe.data.length, 1);
  assert.equal(safe.data[0].accepted_base_quantity, "15.000000");
  assert.equal(safe.data[0].inventory_cost_vnd, null);
  assert.equal(safe.data[0].inventory_unit_cost_vnd_per_base, null);
  passed("G05_AUTHENTICATED_SALES_SAFE_DELIVERY_READ", { subject: auth.accounts.sales.subject, fieldsMasked: true });
  const finance = await api("finance", `delivery_verification_line_read?select=inventory_cost_vnd&delivery_verification_id=eq.${documents.verification}`);
  assert.equal(finance.status, 200);
  assert.equal(finance.data[0].inventory_cost_vnd, "2250000");
  passed("G05_AUTHENTICATED_FINANCE_COST_ALLOWED", { subject: auth.accounts.finance.subject, costVnd: finance.data[0].inventory_cost_vnd });
  const worker = await api("worker", `delivery_verification_line_read?select=id&delivery_verification_id=eq.${documents.verification}`);
  assert.equal(worker.status, 200);
  assert.equal(worker.data.length, 0);
  passed("G05_WORKER_OUTSIDE_READER_PERMISSION", { subject: auth.accounts.worker.subject, rows: 0 });
  const denied = await api("sales", "rpc/approve_stock_count", { target_stock_count_id: documents.validCount, expected_count_version: 2, operation_id: randomUUID() });
  assert.equal(denied.status, 403);
  passed("G01_SALES_CANNOT_APPROVE_COUNT", { httpStatus: denied.status });
  const staleOperation = randomUUID();
  const stale = await api("warehouse", "rpc/approve_stock_count", { target_stock_count_id: documents.staleCount, expected_count_version: 2, operation_id: staleOperation });
  assert.equal(stale.status, 409);
  assert.equal(stale.data.message, "stock_count_basis_changed_recount_required");
  const [staleFacts] = await qa.sql`select (select state from public.stock_counts where id=${documents.staleCount}) state,
    (select count(*)::int from public.command_receipts where operation_id=${staleOperation}) receipts,
    (select count(*)::int from public.audit_events where trace_id=${staleOperation}) audit`;
  assert.deepEqual(staleFacts, { state: "OPEN", receipts: 0, audit: 0 });
  passed("G01_AUTHENTICATED_WAREHOUSE_STALE_DENIED", { subject: auth.accounts.warehouse.subject, httpStatus: stale.status, staleFacts });
  const operation = randomUUID();
  const payload = { target_stock_count_id: documents.validCount, expected_count_version: 2, operation_id: operation };
  const valid = await api("warehouse", "rpc/approve_stock_count", payload);
  assert.equal(valid.status, 200);
  assert.equal(valid.data, documents.validCount);
  assert.equal((await api("warehouse", "rpc/approve_stock_count", payload)).data, documents.validCount);
  const [committed] = await qa.sql`select (select state from public.stock_counts where id=${documents.validCount}) state,
    (select sum(base_quantity_delta)::text from public.inventory_movements where material_id=${documents.validMaterial} and warehouse_id=${documents.branch === qa.fixtures.branch ? qa.fixtures.warehouse : null}) qty,
    (select count(*)::int from public.audit_events where trace_id=${operation}) audit`;
  assert.deepEqual(committed, { state: "APPROVED", qty: "15.000000", audit: 1 });
  passed("G01_HTTP_VALID_COMMITTED_RETRY_INDEPENDENT_READBACK", { subject: auth.accounts.warehouse.subject, committed });
  report.status = "PASS_EXECUTED_AUTHENTICATED_HTTP_SCOPE";
  await writeFile(args.out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, tokensRecorded: false }));
} finally { await qa.sql.end({ timeout: 3 }); }
