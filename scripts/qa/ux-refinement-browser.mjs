import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { parseEnv } from "node:util";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chromium, expect } from "@playwright/test";
import { argumentsForRun, openQA } from "./remediation/native-fixture.mjs";

const a = argumentsForRun(), q = await openQA(a);
assert.equal(a.database, "hx_remediation_ux_refinement186");
const d = JSON.parse(await readFile(a.documents, "utf8")).documents;
const f = JSON.parse(await readFile("reports/ux-ui-refinement/FIXTURES.json", "utf8")).source;
const env = parseEnv(await readFile(a["auth-env"], "utf8"));
assert.equal(env.HX_QA_PROJECT_REF, "ffrwiglcrlumfvhubaxg");
assert.equal(env.HX_QA_RUNTIME_APPROVED, "true");
const origin = "http://127.0.0.1:3116", browser = await chromium.launch({ headless: true }), contexts = [];
const digest = createHash("sha256");
for (const file of execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--", "src", "package.json", "pnpm-lock.yaml", "supabase/migrations"], { encoding: "utf8" }).trim().split("\n").sort()) digest.update(file + "\0").update(await readFile(file));
let r;
try { r = JSON.parse(await readFile(a.out, "utf8")); } catch (e) { if (e.code !== "ENOENT") throw e; }
assert.notEqual(r?.status, "PASS", "Never replay a completed source flow");
r ??= { scope: "UX_UI_ONLY_REAL_AUTH_BROWSER_AND_DISPOSABLE_NATIVE_QA", checkedAt: new Date().toISOString(), sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), sourceSha256: digest.digest("hex"), database: a.database, productionAccess: "NONE", excludedAdvanceRacesRun: false, checks: [], screenshots: [], pageErrors: [] };
if (r.pageErrors.length) { r.priorPageErrors = r.pageErrors; r.pageErrors = []; }
await mkdir(a.screenshots, { recursive: true });
const save = () => writeFile(a.out, JSON.stringify(r, null, 2) + "\n");
const done = (name) => r.checks.some(c => c.name === name && c.status === "PASS");
async function record(name, facts = {}) { r.checks.push({ name, status: "PASS", checkedAt: new Date().toISOString(), facts }); await save(); console.log(JSON.stringify({ name, status: "PASS" })); }
async function wait(fn) { for (let i = 0; i < 100; i++) { if (await fn()) return; await new Promise(resolve => setTimeout(resolve, 150)); } throw Error("Independent readback did not reach expected state"); }
async function shot(p, name) { const file = a.screenshots + "/" + name + ".png"; await p.screenshot({ path: file, fullPage: false }); r.screenshots.push(file); }
async function open(p, path) { await p.goto(origin + path); await p.locator("h1").first().waitFor(); await p.evaluate(() => document.fonts.ready); }
async function login(role, surface = "admin", viewport = { width: 1280, height: 900 }) {
  const c = await browser.newContext({ viewport }); contexts.push(c);
  let customer = d.customer;
  if (role === "other_customer") { const rows = await q.sql`select customer_id from public.customer_portal_memberships where auth_user_id=${d.portalSubjects.otherCustomer} and active`; assert.equal(rows.length, 1); customer = rows[0].customer_id; }
  await c.addCookies([{ name: "hx_branch_id", value: d.branch, url: origin }, { name: "hx_customer_id", value: customer, url: origin }]);
  const p = await c.newPage(); p.on("pageerror", e => r.pageErrors.push({ role, message: e.message.split("\n")[0] }));
  await p.goto(origin + (surface === "admin" ? "/login" : "/" + surface + "/login"));
  await p.getByLabel("Thư điện tử").fill("hxqa-" + role + "@example.test");
  await p.getByLabel("Mật khẩu", { exact: true }).fill(env.HX_QA_PASSWORD);
  await p.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await p.waitForURL(u => u.pathname.startsWith("/" + surface) && !u.pathname.endsWith("/login") || u.pathname === "/select-branch");
  if (new URL(p.url()).pathname === "/select-branch") { await p.getByLabel("Chi nhánh đang hoạt động").selectOption(d.branch); await p.getByRole("button", { name: "Tiếp tục", exact: true }).click(); await p.waitForURL(u => u.pathname.startsWith("/" + surface)); }
  return p;
}
async function resultCounts() { return (await q.sql`select (select count(*)::int from public.delivery_results where delivery_id=${f.delivery}) delivery_results,(select count(*)::int from public.work_item_results where work_item_id=${f.work}) work_results,(select count(*)::int from public.delivery_verifications where delivery_id=${f.delivery}) verifications`)[0]; }
async function reconciliation(id) { return q.sql.begin(async tx => { await q.actor(tx, d.personas.finance.subject); const [row] = await tx`select reconciliation_state from public.payment_read where id=${id}`; assert.ok(row); return row.reconciliation_state; }); }
try {
  r.schema = (await q.sql`select count(*)::int count,max(version) latest from supabase_migrations.schema_migrations`)[0]; assert.equal(r.schema.count, 186);
  if (!done("CASHBOOK_LABELS_KEYBOARD_AND_HORIZONTAL_TABLE")) {
    const p = await login("finance-employee"); await open(p, "/admin/cashbook");
    await p.getByText("Xử lý", { exact: true }).first().click();
    const expanded = p.locator("details[open]").filter({ has: p.locator("input[name=paymentId]") }).first();
    const fields = ["Số tiền đối soát (VND)", "Thời điểm đối soát", "Mã dòng ngân hàng", "Lý do đảo"];
    for (const label of fields) { const field = expanded.getByLabel(label, { exact: true }); await field.waitFor(); assert.equal(await field.evaluate(el => el.labels.length), 1); }
    await expanded.getByLabel("Số tiền đối soát (VND)", { exact: true }).fill("123456");
    await expanded.getByLabel("Mã dòng ngân hàng", { exact: true }).fill("QA chỉ nhập, chưa ghi");
    await expanded.getByLabel("Lý do đảo", { exact: true }).fill("QA chỉ kiểm tra nhãn");
    await expect(expanded.getByText("Số tiền đối soát (VND)", { exact: true })).toBeVisible();
    const region = p.getByRole("region", { name: "Giao dịch thu chi đã ghi sổ" });
    await p.keyboard.press("Tab"); await region.focus(); assert.equal(await region.evaluate(el => getComputedStyle(el).outlineWidth), "3px");
    await p.setViewportSize({ width: 390, height: 844 });
    await region.evaluate(el => { el.scrollLeft = 0; }); await region.focus(); await p.keyboard.press("ArrowRight");
    await wait(async () => await region.evaluate(el => el.scrollLeft > 0));
    await region.evaluate(el => { el.scrollLeft = el.scrollWidth; });
    const layout = await expanded.evaluate(el => { const field = el.querySelector("input[name=amount]"), region = el.closest(".table-wrap"), f = field.getBoundingClientRect(), b = region.getBoundingClientRect(); return { fieldInsideRegion: f.left >= b.left && f.right <= b.right, documentOverflow: document.documentElement.scrollWidth > innerWidth, inputFont: getComputedStyle(field).fontSize }; });
    assert.equal(layout.fieldInsideRegion, true); assert.equal(layout.documentOverflow, false); assert.equal(layout.inputFont, "16px");
    await shot(p, "cashbook-labels-mobile-keyboard"); await record("CASHBOOK_LABELS_KEYBOARD_AND_HORIZONTAL_TABLE", { fields, layout, writes: 0 });
  }
  if (!done("MOBILE_MENU_DIALOG_AND_DRAFT_PRESERVED")) {
    const p = await login("owner", "admin", { width: 390, height: 844 }); await open(p, "/admin/orders/new");
    await p.getByRole("button", { name: "Mở menu", exact: true }).click(); await p.getByRole("button", { name: "Đóng menu", exact: true }).press("Escape");
    assert.equal(await p.getByRole("button", { name: "Mở menu", exact: true }).evaluate(el => el === document.activeElement), true);
    await p.locator("input[name=quantity]").fill("15"); await p.getByRole("button", { name: "+ Thêm khách", exact: true }).click();
    const dialog = p.getByRole("dialog", { name: "Thêm khách hàng" }); await dialog.waitFor();
    const fit = await dialog.evaluate(el => { const b = el.getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth && b.height <= innerHeight; }); assert.equal(fit, true);
    await expect(dialog.getByRole("button", { name: "Đóng", exact: true })).toBeVisible(); await shot(p, "sales-dialog-mobile");
    await p.keyboard.press("Escape"); await dialog.waitFor({ state: "detached" }); assert.equal(await p.locator("input[name=quantity]").inputValue(), "15");
    await record("MOBILE_MENU_DIALOG_AND_DRAFT_PRESERVED", { writes: 0, draftQuantity: "15", dialogFitsViewport: true });
  }
  const warehouse = await login("warehouse-dispatch");
  if (!done("DISPATCH_RESULT_LABELS_AND_COST_SCOPE")) {
    await open(warehouse, "/admin/deliveries/" + f.delivery);
    await warehouse.getByText("Mạng yếu: gửi kết quả không có bước tới nơi", { exact: true }).click();
    for (const label of ["Người nhận", "Ghi chú / sự cố", "Lý do thiếu bước tới nơi"]) await warehouse.getByLabel(label, { exact: true }).waitFor();
    assert.doesNotMatch(await warehouse.locator("main").last().innerText(), /Giá vốn/);
    await record("DISPATCH_RESULT_LABELS_AND_COST_SCOPE", { labels: 3, noExtraCostAccess: true, writes: 0 });
  }
  if (!done("WORKER_RESPONSE_LOSS_RETRY_EXACTLY_ONCE")) {
    const p = await login("worker", "work", { width: 390, height: 844 }); await open(p, "/work/jobs/" + f.work);
    const quantity = p.getByLabel(/Lượng thực tế ·/); await quantity.waitFor();
    assert.equal(await quantity.inputValue(), ""); assert.equal(await quantity.getAttribute("max"), "14.000000");
    for (const text of ["Kế hoạch: 15 m³", "Thực lấy: 14 m³", "Còn được phép báo: 14 m³"]) await expect(p.getByText(text, { exact: true }).last()).toBeVisible();
    await quantity.fill("15"); assert.equal(await quantity.evaluate(el => el.validity.rangeOverflow), true);
    await quantity.fill("14.0000001"); assert.equal(await quantity.evaluate(el => el.validity.stepMismatch), true);
    await quantity.fill("14");
    await p.getByLabel("Lý do chưa ghi nhận bước tới nơi").fill("QA mất mạng lúc tới nơi, ghi đúng lượng đã giao");
    await p.getByLabel("Ghi chú hiện trường").fill("QA giao14, chờ người có quyền xác minh13");
    const key = "hx:work-draft:" + f.work;
    await wait(async () => JSON.parse(await p.evaluate(k => localStorage.getItem(k), key))?.delivery?.lines[0].actualQuantity === "14");
    await p.context().setOffline(true); await p.getByRole("button", { name: "Gửi kết quả công việc", exact: true }).click();
    await expect(p.getByRole("status")).toHaveText(/Có lỗi xảy ra/);
    assert.equal(await quantity.inputValue(), "14"); assert.deepEqual(await resultCounts(), { delivery_results: 0, work_results: 0, verifications: 0 });
    await shot(p, "worker-offline-draft-kept"); await p.context().setOffline(false); await p.reload(); await quantity.waitFor();
    assert.equal(await quantity.inputValue(), "14"); assert.equal(await p.getByLabel("Ghi chú hiện trường").inputValue(), "QA giao14, chờ người có quyền xác minh13");
    await record("WORKER_SERVER_LIMIT_PRECISION_OFFLINE_AND_RELOAD", { plan: "15", loaded: "14", reportable: "14", inputMax: "14.000000", overLimitAndPrecision: "HTML validity; server contracts unchanged", offlineWrites: 0, restoredDraft: true });
    let release; const gate = new Promise(resolve => { release = resolve; }); const requests = [], statuses = [];
    await p.route("**/api/portal/work-results", async route => {
      requests.push(route.request().postDataJSON());
      if (requests.length === 1) { await gate; const response = await route.fetch(); statuses.push(response.status()); await route.abort("failed"); }
      else await route.continue();
    });
    await p.getByRole("button", { name: "Gửi kết quả công việc", exact: true }).click();
    await expect(p.getByRole("button", { name: "Đang gửi kết quả", exact: true })).toBeDisabled();
    await p.getByRole("button", { name: "Đang gửi kết quả", exact: true }).evaluate(el => el.click());
    await wait(async () => requests.length === 1); assert.equal(requests.length, 1); release();
    await expect(p.getByRole("status")).toHaveText(/Có lỗi xảy ra/); assert.deepEqual(statuses, [200]);
    assert.equal(await quantity.inputValue(), "14"); const saved = await resultCounts(); assert.deepEqual(saved, { delivery_results: 1, work_results: 1, verifications: 0 });
    await shot(p, "worker-saved-response-lost-keeps-values"); r.workIntent = requests[0].operationId; await save();
    await p.getByRole("button", { name: "Gửi kết quả công việc", exact: true }).click(); await p.waitForURL(u => u.pathname === "/work");
    assert.equal(requests.length, 2); assert.equal(requests[1].operationId, requests[0].operationId); assert.deepEqual(await resultCounts(), saved);
    await record("WORKER_RESPONSE_LOSS_RETRY_EXACTLY_ONCE", { firstServerStatus: 200, operationId: r.workIntent, disabledDoubleClick: true, requests: 2, persistedResults: saved, sameIntent: true });
  }
  let ar = (await q.sql`select r.id from public.receivable_obligations r join public.delivery_verifications v on v.id=r.delivery_verification_id where v.delivery_id=${f.delivery}`)[0];
  if (!ar) {
    await open(warehouse, "/admin/deliveries/" + f.delivery); await warehouse.getByLabel("Khách chấp nhận", { exact: true }).fill("13");
    await warehouse.getByLabel("Lượng tính tiền", { exact: true }).fill("13"); await warehouse.getByLabel("Lý do điều chỉnh số lượng thợ (nếu thay đổi)", { exact: true }).fill("QA khách nhận13, giữ báo cáo thợ14 và1 còn trên xe");
    await warehouse.getByRole("button", { name: "Xác minh và ghi nhận", exact: true }).click(); await warehouse.getByRole("button", { name: "Xác minh và ghi nhận", exact: true }).waitFor({ state: "detached" });
    ar = (await q.sql`select r.id from public.receivable_obligations r join public.delivery_verifications v on v.id=r.delivery_verification_id where v.delivery_id=${f.delivery}`)[0]; assert.ok(ar);
    await warehouse.reload(); await shot(warehouse, "dispatch-accepted13-keeps-report14"); await record("AUTHORIZED_VERIFY13_KEEPS_WORKER14_AND_CARGO1", { obligation: ar.id });
  }
  r.obligation = ar.id; await save();
  const finance = await login("finance-employee");
  const [debtBefore] = await q.sql`select private.current_receivable_outstanding(${ar.id})::text debt`;
  if (debtBefore.debt === "2990000") {
    await open(finance, "/admin/receivables?customer=" + f.customer); const form = finance.locator(".payment-editor");
    // Existing labels describe source kind, not the delivery number. Match the authenticated API's
    // source ID and ordering; never allocate another obligation merely because its label is equal.
    let index = -1, page = 1;
    while (index < 0) {
      const response = await finance.request.get(origin + `/api/finance/obligations?side=AR&party=${f.customer}&page=${page}`); assert.equal(response.status(), 200);
      const result = await response.json(); index = result.rows.findIndex(row => row.id === ar.id);
      if (index < 0) { assert.equal(result.hasNext, true); await form.getByRole("button", { name: "Tiếp", exact: true }).click(); page += 1; }
      else { assert.equal(await form.getByLabel(/^Phân bổ cho /).count(), result.rows.length); r.receiptSelection = { obligation: ar.id, page, index, sourceLabel: result.rows[index].sourceLabel }; await save(); }
    }
    const allocation = form.getByLabel(/^Phân bổ cho /).nth(index); await allocation.fill("1000000");
    await form.locator("input[name=amount]").fill("1000000"); await form.locator("select[name=accountId]").selectOption(f.account);
    await form.getByRole("button", { name: "Ghi nhận thu tiền", exact: true }).click(); await wait(async () => (await q.sql`select private.current_receivable_outstanding(${ar.id})::text debt`)[0].debt === "1990000");
    await finance.reload(); await shot(finance, "finance-receipt1m-debt1990000"); await record("FINANCE_RECEIPT1M_ALLOCATES_NEW_SOURCE_ONCE", { receipt: "1000000", debt: "1990000", advance: "0" });
  } else assert.equal(debtBefore.debt, "1990000");
  if (!done("CASHBOOK_NEW_LABELS_SAVE_RECONCILIATION")) {
    const rows = await q.sql`select p.id,p.payment_number from public.payments p join public.payment_allocations a on a.payment_id=p.id where a.receivable_obligation_id=${ar.id} and a.amount_delta_vnd>0`; assert.equal(rows.length, 1); r.payment = rows[0].id;
    if (await reconciliation(r.payment) !== "MATCHED") {
      await open(finance, "/admin/cashbook"); const row = finance.getByRole("row").filter({ hasText: rows[0].payment_number }); await row.getByText("Xử lý", { exact: true }).click();
      const form = row.locator("form").filter({ has: finance.getByRole("button", { name: "Ghi đối soát", exact: true }) }); await expect(form).toHaveCount(1);
      await form.getByLabel("Số tiền đối soát (VND)", { exact: true }).fill("1000000"); await form.getByLabel("Mã dòng ngân hàng", { exact: true }).fill("UX-QA-" + f.delivery);
      await form.getByRole("button", { name: "Ghi đối soát", exact: true }).click();
    }
    await wait(async () => await reconciliation(r.payment) === "MATCHED");
    await finance.reload(); await record("CASHBOOK_NEW_LABELS_SAVE_RECONCILIATION", { payment: r.payment, matched: true, extraPaymentCreated: false });
  }
  const sales = await login("sales"); await open(sales, "/admin/orders/" + f.so); await shot(sales, "sales-reload-after-worker-warehouse-finance");
  const customer = await login("finance", "customer", { width: 390, height: 844 }); await open(customer, "/customer/orders/" + f.so); assert.doesNotMatch(await customer.locator("body").innerText(), /Giá vốn/); await shot(customer, "customer-order-mobile-permitted");
  const receiver = await login("receiver", "customer"); await open(receiver, "/customer/orders/" + f.so); assert.doesNotMatch(await receiver.locator("body").innerText(), /Giá vốn/);
  const other = await login("other_customer", "customer"); await other.goto(origin + "/customer/orders/" + f.so); await other.waitForURL(u => u.pathname === "/customer/orders" && u.searchParams.get("notice") === "order-unavailable"); assert.doesNotMatch(await other.locator("body").innerText(), /1\.990\.000|2\.990\.000|Giá vốn/);
  const workerRead = await login("worker", "work"); const denied = await workerRead.request.get(origin + "/api/finance/obligations?side=AR&party=" + f.customer); assert.equal(denied.status(), 403);
  await record("ROLE_RELOAD_CUSTOMER_BOUNDARY_AND_WORKER_FINANCE_DENIED", { wrongCustomer: "redirect_order_unavailable", workerFinanceHttp: denied.status(), customerNoCost: true });
  const [facts] = await q.sql`select (select sum(base_quantity_delta)::text from public.inventory_movements where warehouse_id=${f.warehouse} and material_id=${f.material} and location_kind='WAREHOUSE') warehouse,(select sum(base_quantity_delta)::text from public.inventory_movements where delivery_id=${f.delivery} and location_kind='IN_TRANSIT') cargo,(select sum(amount_vnd)::text from public.revenue_entries where sales_order_id=${f.so}) revenue,private.current_receivable_outstanding(${ar.id})::text debt,(select count(distinct payment_id)::int from public.payment_allocations where receivable_obligation_id=${ar.id} and amount_delta_vnd>0) receipts,(select actual_base_quantity::text from public.delivery_result_lines where delivery_line_id=${f.deliveryLine}) reported,(select accepted_base_quantity::text from public.delivery_verification_lines where delivery_line_id=${f.deliveryLine}) accepted,(select activation_operation_id from private.branch_operational_states where branch_id=${f.branch}) activation,(select count(*)::int from public.inventory_opening_sources where branch_id=${f.branch}) stock_opening,(select count(*)::int from public.opening_balance_sources where branch_id=${f.branch}) debt_opening,(select count(*)::int from public.cash_opening_balances where branch_id=${f.branch}) cash_opening`;
  assert.deepEqual(facts, { warehouse: "1.000000", cargo: "1.000000", revenue: "2990000", debt: "1990000", receipts: 1, reported: "14.000000", accepted: "13.000000", activation: null, stock_opening: 0, debt_opening: 0, cash_opening: 0 });
  const ops = await q.sql.begin(tx => q.rpc(tx, "sales_order_operational_snapshot", [f.so], d.fixtures.owner)); assert.equal(ops.operational_complete, false); assert.equal(ops.exceptions.cargo_remaining, true);
  await record("INDEPENDENT15_14_13_LEDGER_NO_OPENING_AND_NOT_COMPLETE", { facts, operational: ops, counts: await resultCounts() });
  assert.deepEqual(r.pageErrors, []); r.status = "PASS"; r.completedAt = new Date().toISOString(); delete r.error; await save();
} catch (e) { r.status = "FAIL"; r.error = e.message.split("\n")[0]; await save(); throw new Error(r.error); }
finally { for (const c of contexts) { for (const p of c.pages()) await p.unrouteAll({ behavior: "wait" }); await c.close(); } await browser.close(); await q.sql.end({ timeout: 3 }); }
