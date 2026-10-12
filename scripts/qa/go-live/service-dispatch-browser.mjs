import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { stockFixture, salesFixture } from "../remediation/native-fixture.mjs";
import { browserQA } from "./browser-kit.mjs";

// Run only against the owned browser clone, serially. No standard/service-pool IDs
// are imported, and browserQA refuses a report already marked PASS.
const scope = "NEW_SERVICE_ASSIGN_HEARTBEAT_CANCEL_AND_DISPATCH_CONTACT_CANCEL";
const b = await browserQA(scope), { qa, d, report: r, origin } = b;
const repository = fileURLToPath(new URL("../../../", import.meta.url));
const sourcePaths = ["src", "supabase/migrations", "scripts/qa/go-live/service-dispatch-browser.mjs"];
const rpcOrigin = b.args["rpc-origin"] ?? "http://127.0.0.1:3113";
assert.equal(rpcOrigin, "http://127.0.0.1:3113", "Use the browser clone gateway, never the original 3108 gateway");
const env = parseEnv(await readFile(b.args["auth-env"], "utf8"));
const scopedQA = { ...qa, fixtures: d.fixtures };
const done = name => r.checks.some(check => check.name === name && check.status === "PASS");

async function provenance() {
  const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repository, encoding: "utf8" }).trim();
  const diff = execFileSync("git", ["diff", "--binary", "HEAD", "--", ...sourcePaths], { cwd: repository });
  const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard", "-z", "--", ...sourcePaths], { cwd: repository, encoding: "utf8" }).split("\0").filter(Boolean).sort();
  const hash = createHash("sha256").update(diff);
  for (const path of untracked) hash.update("\0" + path + "\0").update(await readFile(new URL(path, new URL("../../../", import.meta.url))));
  const [schema] = await qa.sql`select count(*)::int count,max(version) latest from supabase_migrations.schema_migrations`;
  return { sourceCommit, workingDiffSha256: hash.digest("hex"), workingDiffScope: sourcePaths, untrackedSourceFiles: untracked, schema };
}
async function record(name, layer, facts = {}) {
  const trace = await provenance();
  await b.record(name, { layer, ...facts, sourceCommit: trace.sourceCommit, workingDiffSha256: trace.workingDiffSha256 });
}
async function operation(key) {
  r.documents.operations ??= {};
  if (!r.documents.operations[key]) { r.documents.operations[key] = randomUUID(); await b.save(); }
  return r.documents.operations[key];
}
async function setHidden(form, name, value) {
  await form.locator(`input[name="${name}"]`).evaluate((input, next) => { input.value = next; }, String(value));
}
async function receiptFacts(intent) {
  const [facts] = await qa.sql`select
    (select count(*)::int from public.command_receipts where operation_id=${intent}) receipts,
    (select count(*)::int from public.audit_events where trace_id=${intent}) audits`;
  return facts;
}

// Read the actual session issued by the app login. Never mint an actor JWT,
// grant a worker extra rights, or log a token/password/cookie value.
async function browserRpc(page, subject, name, payload) {
  assert.match(name, /^[a-z_]+$/);
  const cookies = await page.context().cookies(origin);
  const bases = [...new Set(cookies.filter(cookie => /^sb-.+-auth-token(?:\.\d+)?$/.test(cookie.name)).map(cookie => cookie.name.replace(/\.\d+$/, "")))];
  let token;
  for (const base of bases) {
    const whole = cookies.find(cookie => cookie.name === base);
    const chunks = cookies.filter(cookie => cookie.name.startsWith(base + ".")).sort((a, z) => Number(a.name.slice(base.length + 1)) - Number(z.name.slice(base.length + 1)));
    if (!whole) chunks.forEach((cookie, index) => assert.equal(cookie.name, `${base}.${index}`, "Session cookie chunks must be contiguous"));
    const value = whole?.value ?? chunks.map(cookie => cookie.value).join("");
    let session;
    try { session = JSON.parse(value.startsWith("base64-") ? Buffer.from(value.slice(7), "base64url").toString("utf8") : value); } catch { continue; }
    if (!session?.access_token) continue;
    const claims = JSON.parse(Buffer.from(session.access_token.split(".")[1], "base64url").toString("utf8"));
    if (claims.sub !== subject) continue;
    assert.equal(claims.role, "authenticated");
    assert.equal(claims.iss, "https://ffrwiglcrlumfvhubaxg.supabase.co/auth/v1");
    assert.ok(claims.exp * 1000 > Date.now(), "Browser session must still be current");
    token = session.access_token;
  }
  assert.ok(token, "Expected real QA Auth subject in the signed-in browser session; credentials are not recorded");
  const response = await page.request.post(`${rpcOrigin}/rest/v1/rpc/${name}`, {
    headers: { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, authorization: "Bearer " + token, "content-type": "application/json" }, data: payload, timeout: 30000,
  });
  return { status: response.status(), data: await response.json() };
}

async function createService(owner, key, label, localDate) {
  const source = r.documents[key] ??= { intent: await operation(key + "Create"), title: `${r.documents.marker} ${label}`, localDate };
  await b.save();
  if (!source.job) {
    const [committed] = await qa.sql`select result_entity_id from public.command_receipts where operation_id=${source.intent} and command_name='create_service_job'`;
    if (committed) { source.job = committed.result_entity_id; await b.save(); }
  }
  if (!source.job) {
    await owner.goto(origin + "/admin/service-jobs");
    await owner.getByText("Lập lịch công việc dịch vụ", { exact: true }).click();
    const form = owner.locator("form").filter({ has: owner.getByRole("button", { name: "Lập lịch dịch vụ", exact: true }) });
    await form.locator("select[name=customerId]").selectOption(d.customer);
    await form.locator(`select[name=siteId] option[value="${d.site}"]`).waitFor({ state: "attached" });
    await form.locator("select[name=siteId]").selectOption(d.site);
    await form.locator("input[name=serviceType]").fill(source.title);
    await form.locator("textarea[name=description]").fill(`${r.documents.marker} Nguồn QA riêng cho giao việc/hủy lịch; không ghi kết quả hay thu tiền.`);
    await form.locator("input[name=scheduledStart]").fill(source.localDate + "T07:00");
    await form.locator("input[name=scheduledEnd]").fill(source.localDate + "T08:00");
    await form.locator("input[name=plannedQuantity]").fill("1");
    await form.locator("input[name=unitLabel]").fill("giờ");
    await setHidden(form, "operationId", source.intent);
    await form.getByRole("button", { name: "Lập lịch dịch vụ", exact: true }).click();
    await owner.waitForURL(url => /^\/admin\/service-jobs\/[a-f0-9-]{36}$/.test(url.pathname));
    source.job = new URL(owner.url()).pathname.split("/").at(-1); await b.save();
  }
  const [job] = await qa.sql`select id,branch_id,customer_id,service_type,description,execution_state,version from public.service_jobs where id=${source.job}`;
  assert.ok(job); assert.equal(job.branch_id, d.branch); assert.equal(job.customer_id, d.customer); assert.equal(job.service_type, source.title); assert.ok(job.description.startsWith(r.documents.marker));
  return source;
}
async function serviceState(job) {
  const [state] = await qa.sql`select id,execution_state,version from public.service_jobs where id=${job}`;
  assert.ok(state); return state;
}

try {
  assert.equal(r.scope, scope, "Do not reuse another acceptance report");
  delete r.baselineCommit; // browser-kit's legacy default does not cover dirty source.
  r.sourceProvenance = await provenance(); r.schema = r.sourceProvenance.schema;
  r.layers = { browserUI: "Manager/dispatch controls and worker start", directRpc: "Actual browser-issued Auth session through clone gateway; heartbeat has no worker UI control", setup: "Marked new native QA fixture only" };
  r.documents.marker ??= "QA-SD-" + randomUUID().slice(0, 8).toUpperCase();
  const day = parseInt(createHash("sha256").update(r.documents.marker).digest("hex").slice(0, 6), 16) % 20000;
  r.documents.serviceDate ??= new Date(Date.UTC(2300, 0, 1) + day * 86400000).toISOString().slice(0, 10);
  r.documents.dispatchDate ??= new Date(Date.parse(r.documents.serviceDate + "T00:00:00Z") + 86400000).toISOString().slice(0, 10);
  await b.save();
  const owner = await b.login("owner"), worker = await b.login("worker", "work"), dispatch = await b.login("warehouse-dispatch");
  const cancel = await createService(owner, "cancelService", "lịch chưa thực hiện", r.documents.serviceDate);
  if (!done("UNSTARTED_SERVICE_CURRENT_RIGHTS_DENY_WITHOUT_MUTATION")) {
    const before = await serviceState(cancel.job), intent = await operation("serviceCancelDenied");
    const response = await browserRpc(worker, d.personas.worker.subject, "cancel_scheduled_service_job", { target_service_job_id: cancel.job, expected_version: before.version, cancellation_reason: r.documents.marker + " thợ không có quyền hủy", operation_id: intent });
    assert.equal(response.status, 403); assert.equal(response.data.code, "42501");
    assert.deepEqual(await serviceState(cancel.job), before); assert.deepEqual(await receiptFacts(intent), { receipts: 0, audits: 0 });
    await record("UNSTARTED_SERVICE_CURRENT_RIGHTS_DENY_WITHOUT_MUTATION", "DIRECT_RPC_BROWSER_SESSION", { http: response.status, code: response.data.code, job: cancel.job, before });
  }
  if (!done("UNSTARTED_SERVICE_STALE_VERSION_UI_REJECTS_WITHOUT_MUTATION")) {
    const before = await serviceState(cancel.job); assert.equal(before.execution_state, "SCHEDULED");
    await owner.goto(origin + "/admin/service-jobs/" + cancel.job);
    const form = owner.locator("form").filter({ has: owner.getByRole("button", { name: "Hủy lịch dịch vụ", exact: true }) });
    const intent = await operation("serviceCancelStale");
    await form.locator("input[name=reason]").fill(r.documents.marker + " phiên bản cũ cần tải lại");
    await setHidden(form, "version", before.version + 1); await setHidden(form, "operationId", intent);
    await form.getByRole("button", { name: "Hủy lịch dịch vụ", exact: true }).click();
    await owner.waitForURL(url => url.searchParams.has("error"));
    await owner.getByRole("alert").filter({ hasText: /đã thay đổi|tải lại/i }).waitFor();
    assert.deepEqual(await serviceState(cancel.job), before); assert.deepEqual(await receiptFacts(intent), { receipts: 0, audits: 0 });
    await record("UNSTARTED_SERVICE_STALE_VERSION_UI_REJECTS_WITHOUT_MUTATION", "BROWSER_UI", { job: cancel.job, actualVersion: before.version, submittedVersion: before.version + 1, versionInputFaultInjected: true });
  }
  if (!done("MANAGER_CANCELS_UNSTARTED_SERVICE_ONCE_WITHOUT_WORK_OR_AR")) {
    let state = await serviceState(cancel.job);
    if (state.execution_state === "SCHEDULED") {
      await owner.goto(origin + "/admin/service-jobs/" + cancel.job);
      const form = owner.locator("form").filter({ has: owner.getByRole("button", { name: "Hủy lịch dịch vụ", exact: true }) });
      await form.locator("input[name=reason]").fill(r.documents.marker + " hủy lịch chưa phát hành");
      await setHidden(form, "operationId", await operation("serviceCancel"));
      await form.getByRole("button", { name: "Hủy lịch dịch vụ", exact: true }).click();
      await b.wait(async () => (await serviceState(cancel.job)).execution_state === "CANCELLED");
    }
    await owner.goto(origin + "/admin/service-jobs/" + cancel.job);
    await owner.getByText("Lịch dịch vụ đã hủy trước khi phát hành phiếu việc.", { exact: false }).waitFor();
    const [facts] = await qa.sql`select j.execution_state,(select count(*)::int from public.work_items where service_job_id=j.id) work,(select count(*)::int from public.service_verifications where service_job_id=j.id) verifications from public.service_jobs j where id=${cancel.job}`;
    assert.deepEqual(facts, { execution_state: "CANCELLED", work: 0, verifications: 0 });
    assert.deepEqual(await receiptFacts(await operation("serviceCancel")), { receipts: 1, audits: 1 });
    await record("MANAGER_CANCELS_UNSTARTED_SERVICE_ONCE_WITHOUT_WORK_OR_AR", "BROWSER_UI", { job: cancel.job, facts });
  }

  const service = await createService(owner, "assignedService", "giao trực tiếp và heartbeat", r.documents.serviceDate);
  if (!service.work) {
    const [existing] = await qa.sql`select id from public.work_items where service_job_id=${service.job}`;
    if (existing) { service.work = existing.id; await b.save(); }
    else {
      await owner.goto(origin + "/admin/service-jobs/" + service.job);
      const form = owner.locator("form").filter({ has: owner.getByRole("button", { name: "Phát hành phiếu việc", exact: true }) });
      await form.locator("select[name=assignmentMode]").selectOption("POOL_CLAIM"); await form.locator("select[name=employeeId]").selectOption("");
      await setHidden(form, "operationId", await operation("servicePublish"));
      await form.getByRole("button", { name: "Phát hành phiếu việc", exact: true }).click();
      await b.wait(async () => !!(await qa.sql`select id from public.work_items where service_job_id=${service.job}`)[0]);
      service.work = (await qa.sql`select id from public.work_items where service_job_id=${service.job}`)[0].id; await b.save();
    }
  }
  if (!done("MANAGER_UI_ASSIGN_WORK_ITEM_CURRENT_WORKER_SOURCE_ONE_AUDIT")) {
    const [work] = await qa.sql`select execution_state from public.work_items where id=${service.work}`;
    if (work.execution_state === "AVAILABLE") {
      await owner.goto(origin + "/admin/service-jobs/" + service.job);
      const form = owner.locator("form").filter({ has: owner.getByRole("button", { name: "Giao trực tiếp", exact: true }) });
      await form.locator("select[name=employeeId]").selectOption(d.personas.worker.employee);
      await setHidden(form, "operationId", await operation("serviceAssign"));
      await form.getByRole("button", { name: "Giao trực tiếp", exact: true }).click();
      await b.wait(async () => (await qa.sql`select execution_state from public.work_items where id=${service.work}`)[0].execution_state === "CLAIMED");
    }
    const rows = await qa.sql`select a.id,a.employee_id,a.assignment_kind,w.execution_state,w.service_job_id from public.work_item_assignments a join public.work_items w on w.id=a.work_item_id where a.work_item_id=${service.work} and a.superseded_at is null`;
    assert.equal(rows.length, 1); assert.equal(rows[0].employee_id, d.personas.worker.employee); assert.equal(rows[0].assignment_kind, "DIRECT"); assert.equal(rows[0].execution_state, "CLAIMED"); assert.equal(rows[0].service_job_id, service.job);
    assert.deepEqual(await receiptFacts(await operation("serviceAssign")), { receipts: 1, audits: 1 });
    await record("MANAGER_UI_ASSIGN_WORK_ITEM_CURRENT_WORKER_SOURCE_ONE_AUDIT", "BROWSER_UI", { job: service.job, work: service.work, assignment: rows[0] });
  }
  if (!done("ASSIGNED_WORKER_STARTS_SERVICE_THROUGH_PORTAL_UI")) {
    const [work] = await qa.sql`select execution_state from public.work_items where id=${service.work}`;
    if (work.execution_state === "CLAIMED") {
      await worker.goto(origin + "/work/jobs/" + service.work);
      await worker.getByRole("button", { name: /Bắt đầu/ }).click();
      await b.wait(async () => (await serviceState(service.job)).execution_state === "IN_PROGRESS");
    }
    await worker.goto(origin + "/work/jobs/" + service.work); await worker.getByLabel("Số lượng thực tế", { exact: true }).waitFor();
    assert.equal((await qa.sql`select execution_state from public.work_items where id=${service.work}`)[0].execution_state, "IN_PROGRESS");
    await record("ASSIGNED_WORKER_STARTS_SERVICE_THROUGH_PORTAL_UI", "BROWSER_UI", { job: service.job, work: service.work });
  }
  if (!done("CURRENT_WORKER_HEARTBEAT_DIRECT_RPC_RETRY_ONE_ROW_NO_RESULT")) {
    const intent = await operation("workerHeartbeat"), note = r.documents.marker + " vẫn đang làm, chưa ghi sản lượng";
    const payload = { target_work_item_id: service.work, status_note: note, operation_id: intent };
    const first = await browserRpc(worker, d.personas.worker.subject, "heartbeat_work_item", payload);
    assert.equal(first.status, 200); assert.match(first.data, /^[a-f0-9-]{36}$/);
    const again = await browserRpc(worker, d.personas.worker.subject, "heartbeat_work_item", payload);
    assert.equal(again.status, 200); assert.equal(again.data, first.data);
    const [facts] = await qa.sql`select w.execution_state,w.last_heartbeat_at,w.lease_expires_at,(select count(*)::int from public.work_item_heartbeats where work_item_id=w.id) heartbeats,(select count(*)::int from public.work_item_results where work_item_id=w.id) results,(select count(*)::int from public.service_verifications where service_job_id=${service.job}) verifications,(select actor_employee_id from public.work_item_heartbeats where id=${first.data}) actor from public.work_items w where id=${service.work}`;
    assert.equal(facts.execution_state, "IN_PROGRESS"); assert.equal(facts.heartbeats, 1); assert.equal(facts.results, 0); assert.equal(facts.verifications, 0); assert.equal(facts.actor, d.personas.worker.employee); assert.ok(Date.parse(facts.lease_expires_at) > Date.parse(facts.last_heartbeat_at));
    const deniedIntent = await operation("foreignHeartbeat"), foreign = await browserRpc(owner, d.fixtures.owner, "heartbeat_work_item", { ...payload, status_note: r.documents.marker + " người khác không làm hộ", operation_id: deniedIntent });
    assert.equal(foreign.status, 403); assert.equal(foreign.data.code, "42501"); assert.deepEqual(await receiptFacts(deniedIntent), { receipts: 0, audits: 0 });
    await record("CURRENT_WORKER_HEARTBEAT_DIRECT_RPC_RETRY_ONE_ROW_NO_RESULT", "DIRECT_RPC_BROWSER_SESSION", { job: service.job, work: service.work, heartbeat: first.data, http: first.status, facts, foreignHttp: foreign.status });
  }
  if (!done("STARTED_SERVICE_CURRENT_VERSION_CANCEL_DENIED_NO_MUTATION")) {
    const before = await serviceState(service.job), intent = await operation("startedServiceCancel"); assert.equal(before.execution_state, "IN_PROGRESS");
    const denied = await browserRpc(owner, d.fixtures.owner, "cancel_scheduled_service_job", { target_service_job_id: service.job, expected_version: before.version, cancellation_reason: r.documents.marker + " không hủy lịch đã bắt đầu", operation_id: intent });
    assert.equal(denied.status, 409); assert.equal(denied.data.code, "PT409"); assert.equal(denied.data.message, "service_cancel_version_conflict");
    assert.deepEqual(await serviceState(service.job), before); assert.deepEqual(await receiptFacts(intent), { receipts: 0, audits: 0 });
    await owner.goto(origin + "/admin/service-jobs/" + service.job); assert.equal(await owner.getByRole("button", { name: "Hủy lịch dịch vụ", exact: true }).count(), 0);
    await record("STARTED_SERVICE_CURRENT_VERSION_CANCEL_DENIED_NO_MUTATION", "DIRECT_RPC_BROWSER_SESSION_PLUS_UI_GUARD", { job: service.job, actualVersion: before.version, http: denied.status, code: denied.data.code, uiCancelPresent: false });
  }

  if (!r.documents.dispatch) {
    r.documents.dispatch = await qa.sql.begin(async tx => {
      const stock = await stockFixture(tx, scopedQA, "2"), sale = await salesFixture(tx, scopedQA, stock, d.personas.sales.subject);
      const allocation = await qa.rpc(tx, "upsert_supply_allocation", [sale.line, "WAREHOUSE", null, d.fixtures.warehouse, "2", null, null, randomUUID()], d.personas.purchasing.subject);
      const vehicle = randomUUID();
      await qa.rpc(tx, "save_catalog_record", ["vehicles", vehicle, d.branch, { code: stock.prefix + "SD", plate_number: stock.prefix + "SD", capacity_quantity: "2", capacity_uom_id: stock.uom, capacity_source_note: r.documents.marker + " xe QA riêng có căn cứ sức chứa", active: true }, null, r.documents.marker + " tạo xe riêng cho kiểm tra điều phối", randomUUID()], d.fixtures.owner);
      const deliveries = [];
      for (let index = 0; index < 2; index++) deliveries.push(await qa.rpc(tx, "create_delivery_from_allocations", [sale.so, [{ supply_allocation_id: allocation, planned_base_quantity: "1" }], r.documents.dispatchDate + "T00:00:00Z", randomUUID()], d.personas.warehouse.subject));
      return { marker: r.documents.marker, prefix: stock.prefix, sale: sale.so, material: stock.material, vehicle, contactDelivery: deliveries[0], cancelDelivery: deliveries[1] };
    }); await b.save();
  }
  const delivery = r.documents.dispatch; assert.equal(delivery.marker, r.documents.marker);
  const [owned] = await qa.sql`select branch_id,(select code from public.materials where id=${delivery.material}) material_code from public.sales_orders where id=${delivery.sale}`;
  assert.equal(owned.branch_id, d.branch); assert.equal(owned.material_code, delivery.prefix);
  if (!done("DISPATCH_UI_CANCEL_PLANNED_DELIVERY_RELEASES_SAME_RESERVATION_ONCE")) {
    const [state] = await qa.sql`select execution_state from public.deliveries where id=${delivery.cancelDelivery}`;
    if (!delivery.reservationBefore) {
      delivery.reservationBefore = await qa.sql`select r.id,r.state,r.version,r.reserved_base_quantity::text quantity from public.inventory_reservations r join public.delivery_lines l on l.id=r.delivery_line_id where l.delivery_id=${delivery.cancelDelivery} order by r.id`;
      assert.equal(delivery.reservationBefore.length, 1); assert.equal(delivery.reservationBefore[0].state, "ACTIVE"); assert.equal(delivery.reservationBefore[0].quantity, "1.000000"); await b.save();
    }
    if (state.execution_state === "PLANNED") {
      await dispatch.goto(origin + `/admin/deliveries/${delivery.cancelDelivery}/cancel`);
      const form = dispatch.locator("form").filter({ has: dispatch.getByRole("button", { name: "Xác nhận hủy kế hoạch", exact: true }) });
      await form.locator("textarea[name=reason]").fill(r.documents.marker + " hủy kế hoạch trước phân giao, trả lại giữ chỗ");
      await setHidden(form, "operationId", await operation("deliveryCancel"));
      await form.getByRole("button", { name: "Xác nhận hủy kế hoạch", exact: true }).click();
      await dispatch.getByText("Tồn đặt trước đã được giải phóng. Lịch sử phiếu vẫn được giữ lại.", { exact: true }).waitFor();
    }
    const after = await qa.sql`select r.id,r.state,r.version,r.reserved_base_quantity::text quantity,r.finalized_at from public.inventory_reservations r join public.delivery_lines l on l.id=r.delivery_line_id where l.delivery_id=${delivery.cancelDelivery} order by r.id`;
    assert.equal(after.length, 1); assert.equal(after[0].id, delivery.reservationBefore[0].id); assert.equal(after[0].state, "RELEASED"); assert.equal(after[0].version, delivery.reservationBefore[0].version + 1); assert.equal(after[0].quantity, delivery.reservationBefore[0].quantity); assert.ok(after[0].finalized_at);
    const [facts] = await qa.sql`select (select execution_state from public.deliveries where id=${delivery.cancelDelivery}) state,(select commercial_state from public.sales_orders where id=${delivery.sale}) commercial,(select count(*)::int from public.delivery_assignments where delivery_id=${delivery.cancelDelivery}) assignments,(select count(*)::int from public.inventory_movements where material_id=${delivery.material} and location_kind='IN_TRANSIT') cargo,(select count(*)::int from public.revenue_entries where sales_order_id=${delivery.sale}) revenue,(select sum(reserved_base_quantity)::text from public.inventory_reservations where material_id=${delivery.material} and state='ACTIVE') active_reserved`;
    assert.deepEqual(facts, { state: "CANCELLED", commercial: "CONFIRMED", assignments: 0, cargo: 0, revenue: 0, active_reserved: "1.000000" });
    assert.deepEqual(await receiptFacts(await operation("deliveryCancel")), { receipts: 1, audits: 1 });
    await record("DISPATCH_UI_CANCEL_PLANNED_DELIVERY_RELEASES_SAME_RESERVATION_ONCE", "BROWSER_UI", { delivery: delivery.cancelDelivery, before: delivery.reservationBefore, after, facts });
  }
  if (!done("DISPATCH_UI_UPDATES_RECEIVER_BEFORE_WORK_PUBLICATION")) {
    await dispatch.goto(origin + "/admin/deliveries/" + delivery.contactDelivery);
    const form = dispatch.locator("form").filter({ has: dispatch.getByRole("button", { name: "Lưu người nhận", exact: true }) });
    const intent = await operation("receiverUpdate"), name = r.documents.marker + " người nhận đã xác minh";
    const [committed] = await qa.sql`select operation_id from public.command_receipts where operation_id=${intent}`;
    if (!committed) {
      await form.locator("input[name=receiverName]").fill(name); await form.locator("input[name=receiverPhone]").fill("0900000001"); await form.locator("input[name=reason]").fill(r.documents.marker + " đối chiếu liên hệ trước phát hành"); await setHidden(form, "operationId", intent);
      await form.getByRole("button", { name: "Lưu người nhận", exact: true }).click(); await dispatch.waitForURL(url => url.searchParams.get("notice") === "delivery-contact-updated");
    }
    const [facts] = await qa.sql`select receiver_name_snapshot,receiver_phone_snapshot,(select count(*)::int from public.work_items where delivery_id=d.id) work from public.deliveries d where id=${delivery.contactDelivery}`;
    assert.deepEqual(facts, { receiver_name_snapshot: name, receiver_phone_snapshot: "0900000001", work: 0 });
    assert.deepEqual(await receiptFacts(intent), { receipts: 1, audits: 1 });
    await record("DISPATCH_UI_UPDATES_RECEIVER_BEFORE_WORK_PUBLICATION", "BROWSER_UI", { delivery: delivery.contactDelivery, facts });
  }
  if (!delivery.work) {
    const [state] = await qa.sql`select execution_state from public.deliveries where id=${delivery.contactDelivery}`;
    if (state.execution_state === "PLANNED") {
      await dispatch.goto(origin + "/admin/deliveries/" + delivery.contactDelivery);
      const form = dispatch.locator("form").filter({ has: dispatch.getByRole("button", { name: "Phân người và xe", exact: true }) });
      await form.locator("select[name=employeeId]").selectOption(d.personas.worker.employee); await form.locator("select[name=vehicleId]").selectOption(delivery.vehicle);
      await form.locator("input[name=scheduledStart]").fill(r.documents.dispatchDate + "T07:00"); await form.locator("input[name=scheduledEnd]").fill(r.documents.dispatchDate + "T08:00"); await setHidden(form, "operationId", await operation("deliveryAssign"));
      await form.getByRole("button", { name: "Phân người và xe", exact: true }).click(); await b.wait(async () => (await qa.sql`select execution_state from public.deliveries where id=${delivery.contactDelivery}`)[0].execution_state === "ASSIGNED");
    }
    const [existing] = await qa.sql`select id from public.work_items where delivery_id=${delivery.contactDelivery}`;
    if (existing) delivery.work = existing.id;
    else {
      await dispatch.goto(origin + "/admin/deliveries/" + delivery.contactDelivery);
      const form = dispatch.locator("form").filter({ has: dispatch.getByRole("button", { name: "Giao việc qua cổng thợ", exact: true }) });
      await setHidden(form, "operationId", await operation("deliveryPublish")); await form.getByRole("button", { name: "Giao việc qua cổng thợ", exact: true }).click();
      await b.wait(async () => !!(await qa.sql`select id from public.work_items where delivery_id=${delivery.contactDelivery}`)[0]);
      delivery.work = (await qa.sql`select id from public.work_items where delivery_id=${delivery.contactDelivery}`)[0].id;
    }
    await b.save();
  }
  if (!done("PUBLISHED_DELIVERY_RECEIVER_UI_AND_DIRECT_RPC_LOCK_KEEP_SOURCE")) {
    const [before] = await qa.sql`select receiver_name_snapshot,receiver_phone_snapshot,version,execution_state from public.deliveries where id=${delivery.contactDelivery}`;
    const [assignment] = await qa.sql`select employee_id,vehicle_id from public.work_item_assignments where work_item_id=${delivery.work} and superseded_at is null`;
    assert.equal(assignment.employee_id, d.personas.worker.employee); assert.equal(assignment.vehicle_id, delivery.vehicle);
    await dispatch.goto(origin + "/admin/deliveries/" + delivery.contactDelivery);
    const form = dispatch.locator("form").filter({ has: dispatch.getByRole("button", { name: "Lưu người nhận", exact: true }) });
    const intent = await operation("receiverLockedUI");
    await form.locator("input[name=receiverName]").fill(r.documents.marker + " thay sau phát hành bị khóa"); await form.locator("input[name=receiverPhone]").fill("0900000002"); await form.locator("input[name=reason]").fill(r.documents.marker + " kiểm tra khóa nguồn sau phát hành"); await setHidden(form, "operationId", intent);
    await form.getByRole("button", { name: "Lưu người nhận", exact: true }).click(); await dispatch.waitForURL(url => url.searchParams.has("error"));
    await dispatch.getByRole("alert").filter({ hasText: /thông tin chỉ sửa được trước khi phát hành/i }).waitFor();
    const rawIntent = await operation("receiverLockedRpc"), denied = await browserRpc(dispatch, d.personas.warehouse.subject, "update_delivery_receiver", { target_delivery_id: delivery.contactDelivery, receiver_name: r.documents.marker + " RPC bị khóa", receiver_phone: "0900000003", reason: r.documents.marker + " khóa nguồn đúng version", expected_version: before.version, operation_id: rawIntent });
    assert.equal(denied.data.code, "55000"); assert.equal(denied.data.message, "delivery_contact_locked"); assert.ok(denied.status >= 400);
    const [after] = await qa.sql`select receiver_name_snapshot,receiver_phone_snapshot,version,execution_state from public.deliveries where id=${delivery.contactDelivery}`;
    assert.deepEqual(after, before); assert.deepEqual(await receiptFacts(intent), { receipts: 0, audits: 0 }); assert.deepEqual(await receiptFacts(rawIntent), { receipts: 0, audits: 0 });
    await record("PUBLISHED_DELIVERY_RECEIVER_UI_AND_DIRECT_RPC_LOCK_KEEP_SOURCE", "BROWSER_UI_PLUS_DIRECT_RPC_BROWSER_SESSION", { delivery: delivery.contactDelivery, work: delivery.work, before, after, rawHttp: denied.status, rawCode: denied.data.code });
  }
  await b.shot(owner, "new-service-started-cancel-denied"); await b.shot(dispatch, "new-dispatch-published-contact-locked");
  r.completedSourceProvenance = await provenance();
  await b.finish();
} catch (error) {
  r.status = "FAIL"; r.error = error.message.split("\n")[0]; await b.debug(); await b.save(); throw error;
} finally { await b.close(); }
