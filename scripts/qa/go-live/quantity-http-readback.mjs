import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { chromium } from "@playwright/test";
import { argumentsForRun, openQA } from "../remediation/native-fixture.mjs";
const a = argumentsForRun(), q = await openQA(a);
assert.equal(a.database, "hx_remediation_go_live_browser175");
const source = JSON.parse(await readFile(a.standard, "utf8")).documents;
const env = parseEnv(await readFile(a["auth-env"], "utf8"));
const origin = "http://127.0.0.1:3112", browser = await chromium.launch({ headless: true });
const c = await browser.newContext(), p = await c.newPage();
await c.addCookies([{ name: "hx_branch_id", value: source.branch, url: origin }]);
try {
  const tables = await q.sql`select c.relname name from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by 1`;
  async function snapshot() {
    const result = [];
    for (const table of tables) {
      assert.match(table.name, /^[a-z_]+$/);
      const [row] = await q.sql.unsafe(`select count(*)::int n,md5(coalesce(string_agg(md5(to_jsonb(x)::text),',' order by to_jsonb(x)::text),'')) hash from public.${table.name} x`);
      result.push({ table: table.name, ...row });
    }
    return result;
  }
  const before = await snapshot();
  const [result] = await q.sql`select r.id,r.source_work_item_result_id,r.receiver_name,r.note,r.missing_arrival_reason,
    w.version work_version,d.version delivery_version,a.assignment_version,c.operation_id,c.payload_hash
    from public.delivery_results r join public.deliveries d on d.id=r.delivery_id
    join public.work_items w on w.delivery_id=d.id
    join public.delivery_assignments a on a.delivery_id=d.id and a.superseded_at is null
    join public.command_receipts c on c.result_entity_id=r.source_work_item_result_id and c.command_name='submit_portal_delivery_result'
    where r.delivery_id=${source.delivery}`;
  const lines = await q.sql`select delivery_line_id,actual_base_quantity::text quantity from public.delivery_result_lines where delivery_result_id=${result.id} order by delivery_line_id`;
  const payload = { workItemId: source.work, operationId: result.operation_id, expectedVersion: 1,
    expectedDeliveryVersion: 1, expectedAssignmentVersion: result.assignment_version,
    receiverName: result.receiver_name, note: result.note, evidenceId: null,
    missingArrivalReason: result.missing_arrival_reason,
    deliveryLines: lines.map(x => ({ deliveryLineId: x.delivery_line_id, actualQuantity: x.quantity.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1") })) };
  let found = false;
  for (let w = 1; w <= result.work_version && !found; w++) for (let d = 1; d <= result.delivery_version && !found; d++) {
    const original = { work: payload.workItemId, lines: payload.deliveryLines.map(x => ({ delivery_line_id: x.deliveryLineId, actual_base_quantity: x.actualQuantity })), receiver: payload.receiverName, note: payload.note, evidence: null, arrival_reason: payload.missingArrivalReason, work_version: w, delivery_version: d, assignment_version: payload.expectedAssignmentVersion };
    const [hash] = await q.sql`select private.command_payload_hash(${q.sql.json(original)}) value`;
    if (hash.value === result.payload_hash) { payload.expectedVersion = w; payload.expectedDeliveryVersion = d; found = true; }
  }
  assert.equal(found, true, "Only retry the exact original payload already committed");
  await p.goto(origin + "/work/login"); await p.getByLabel("Thư điện tử").fill("hxqa-worker@example.test");
  await p.getByLabel("Mật khẩu", { exact: true }).fill(env.HX_QA_PASSWORD);
  await p.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await p.waitForURL(u => u.pathname === "/work");
  const checks = [];
  for (const literal of ["99999999999999.0000001", "99999999999999.123456"]) {
    const raw = JSON.stringify({ workItemId: source.work, operationId: randomUUID(), expectedVersion: 1, actualQuantity: "DECIMAL_LITERAL" }).replace('"DECIMAL_LITERAL"', literal);
    const response = await p.request.post(origin + "/api/portal/work-results", { headers: { "content-type": "application/json" }, data: raw });
    assert.equal(response.status(), 409);
    assert.match((await response.json()).error, /Kết quả công việc không hợp lệ/);
    checks.push({ name: "NUMERIC_JSON_PRECISION_REJECTED_BEFORE_WRITER", literal, status: "PASS", http: response.status() });
  }
  const retry = await p.request.post(origin + "/api/portal/work-results", { data: payload });
  assert.equal(retry.status(), 200); assert.equal((await retry.json()).resultId, result.source_work_item_result_id);
  checks.push({ name: "EXACT_DECIMAL_TEXT_ORIGINAL_INTENT_STILL_RETURNS_COMMITTED_RESULT", status: "PASS", http: retry.status() });
  const after = await snapshot(); assert.deepEqual(after, before);
  await writeFile(a.out, JSON.stringify({ status: "PASS_REAL_AUTH_HTTP_NO_NEW_BUSINESS_EFFECT", checkedAt: new Date().toISOString(), source, checks, publicTablesUnchanged: after.length, sourceStateAndVersionKept: true, newFinancialOrStockWrites: 0, productionAccess: "NONE" }, null, 2));
  console.log(JSON.stringify({ status: "PASS", checks: checks.length, unchangedTables: after.length }));
} finally { await c.close(); await browser.close(); await q.sql.end({ timeout: 3 }); }
