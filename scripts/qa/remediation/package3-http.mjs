import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { realQAAuth } from "./auth.mjs";
import { argumentsForRun, openQA } from "./native-fixture.mjs";

const args = argumentsForRun(), qa = await openQA(args);
const docs = JSON.parse(await readFile(args.documents, "utf8")).documents;
const auth = await realQAAuth(args["auth-env"], { sales: "hxqa-sales@example.test", warehouse: "hxqa-warehouse-dispatch@example.test" });
const report = { scope: "REAL_AUTHENTICATED_ASSIGNMENT_AND_ACTUAL_LOADING_HTTP", database: args.database,
  managedQaBusinessWrites: 0, tokensRecorded: false, productionAccess: "NONE", checks: [] };
try {
  const payload = { target_delivery_id: docs.http.delivery, target_employee_id: docs.worker, target_vehicle_id: docs.vehicle,
    external_carrier_name: "", external_carrier_phone: "", expected_version: 1, operation_id: randomUUID(),
    scheduled_start: new Date(Date.parse(docs.nextStart) + 86400000).toISOString(),
    scheduled_end: new Date(Date.parse(docs.nextEnd) + 86400000).toISOString() };
  const forbidden = await auth.api("sales", "rpc/assign_delivery_scheduled", payload);
  assert.equal(forbidden.status, 403);
  const nullVersion = await auth.api("warehouse", "rpc/assign_delivery_scheduled", { ...payload, expected_version: null });
  assert.equal(nullVersion.status, 409);
  const valid = await auth.api("warehouse", "rpc/assign_delivery_scheduled", payload);
  assert.equal(valid.status, 200);
  const retry = await auth.api("warehouse", "rpc/assign_delivery_scheduled", payload);
  assert.equal(retry.data, valid.data);
  report.checks.push({ name: "G06_G12_G13_ASSIGN_PERMISSION_VERSION_VALID_AND_RETRY", status: "PASS",
    forbidden: forbidden.status, nullVersion: nullVersion.status, positive: valid.status, actor: auth.accounts.warehouse.subject });
  const handoff = { target_delivery_id: docs.http.delivery, expected_version: 2, handed_off_at: new Date().toISOString(),
    operation_id: randomUUID(), loaded_lines: [{ delivery_line_id: docs.http.line, loaded_base_quantity: "14" }] };
  const precision = await auth.api("warehouse", "rpc/handoff_delivery_actual", { ...handoff,
    loaded_lines: [{ delivery_line_id: docs.http.line, loaded_base_quantity: "14.0000004" }] });
  assert.equal(precision.status, 400);
  const missing = await auth.api("warehouse", "rpc/handoff_delivery_actual", { ...handoff, loaded_lines: [] });
  assert.equal(missing.status, 400);
  const receipt = await auth.api("warehouse", "rpc/handoff_delivery_actual", handoff);
  assert.equal(receipt.status, 200);
  assert.equal((await auth.api("warehouse", "rpc/handoff_delivery_actual", handoff)).data, receipt.data);
  const [facts] = await qa.sql`select d.execution_state,l.planned_base_quantity::text planned,h.moved_base_quantity::text loaded,
    (select sum(base_quantity_delta)::text from public.inventory_movements where delivery_id=d.id and location_kind='IN_TRANSIT') transit,
    (select count(*)::int from public.audit_events where trace_id=${handoff.operation_id}) audit
    from public.deliveries d join public.delivery_lines l on l.delivery_id=d.id join public.delivery_handoff_lines h on h.delivery_line_id=l.id
    where d.id=${docs.http.delivery}`;
  assert.deepEqual(facts, { execution_state: "DISPATCHED", planned: "15.000000", loaded: "14.000000", transit: "14.000000", audit: 1 });
  const safe = await auth.api("sales", `delivery_line_read?select=id,loaded_base_quantity&delivery_id=eq.${docs.http.delivery}`);
  assert.equal(safe.status, 200);
  assert.equal(safe.data[0].loaded_base_quantity, "14.000000");
  const noAccessAuth = await realQAAuth(args["auth-env"], { worker: "hxqa-worker@example.test" });
  const noAccess = await noAccessAuth.api("worker", `delivery_line_read?select=id,loaded_base_quantity&delivery_id=eq.${docs.http.delivery}`);
  assert.equal(noAccess.status, 200);
  assert.equal(noAccess.data.length, 0);
  const sourceFields = await auth.api("warehouse", `delivery_line_read?select=id,material_name_snapshot,planned_base_quantity,loaded_base_quantity&delivery_id=eq.${docs.load.delivery}`);
  assert.equal(sourceFields.status, 200);
  assert.equal(sourceFields.data.length, 1);
  report.checks.push({ name: "G02_G14_ACTUAL14_AUTHENTICATED_COMMIT_RETRY_SAFE_READ", status: "PASS",
    precisionRejected: precision.status, missingRejected: missing.status, independentNativeReadback: facts, salesLoadedRead: safe.data[0],
    warehouseSourceRead: sourceFields.data[0], unauthorizedWorkerRows: noAccess.data.length });
  report.status = "PASS_EXECUTED_AUTHENTICATED_HTTP_SCOPE";
  await writeFile(args.out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length }));
} catch (error) {
  await writeFile(args.out.replace(/\.json$/, "-failure.json"), JSON.stringify({ ...report, status: "FAIL", error: error.message }, null, 2));
  throw error;
} finally { await qa.sql.end({ timeout: 3 }); }
