import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseEnv } from "node:util";
import { chromium } from "@playwright/test";
import { argumentsForRun, openQA } from "./native-fixture.mjs";

const args = argumentsForRun(), qa = await openQA(args);
const docs = JSON.parse(await readFile(args.documents, "utf8")).documents;
const env = parseEnv(await readFile(args["auth-env"], "utf8"));
assert.equal(env.HX_QA_PROJECT_REF, "ffrwiglcrlumfvhubaxg");
await mkdir(args.screenshots, { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = { scope: "REAL_WAREHOUSE_BROWSER_ASSIGNMENT_LOADING_EXCEPTION", database: args.database,
  browser: "Chromium", browserPlugin: "ABSENT", fallbackReason: "Browser plugin and browser skill not available; installed Playwright used",
  origin: "http://127.0.0.1:3110", consoleErrors: [], screenshots: [], checks: [], productionAccess: "NONE" };
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
page.on("pageerror", error => report.consoleErrors.push(error.message));
page.on("console", message => { if (message.type() === "error") report.consoleErrors.push(message.text()); });
async function shot(name) {
  const filename = path.join(args.screenshots, name + ".png");
  // Avoid Playwright injecting caret styles while React is hydrating streamed forms.
  await page.screenshot({ path: filename, fullPage: true, caret: "initial" });
  report.screenshots.push(filename);
}
async function open(id) {
  await page.goto(report.origin + "/admin/deliveries/" + id);
  await page.getByRole("heading", { name: "Nguồn, lượng và bằng chứng" }).waitFor();
  assert.ok((await page.title()).length);
  assert.equal(await page.locator("nextjs-portal").filter({ hasText: /Runtime Error|Unhandled/ }).count(), 0);
}
async function assign(employee, next = false) {
  await page.getByLabel("Người giao", { exact: true }).selectOption(employee);
  await page.getByLabel("Xe", { exact: true }).selectOption(docs.vehicle);
  const local = value => new Date(Date.parse(value) + 7 * 3600000).toISOString().slice(0, 16);
  await page.getByLabel("Giờ bắt đầu giao", { exact: true }).fill(local(next ? docs.nextStart : docs.scheduleStart));
  await page.getByLabel("Giờ kết thúc dự kiến", { exact: true }).fill(local(next ? docs.nextEnd : docs.scheduleEnd));
  await page.getByRole("button", { name: "Phân người và xe", exact: true }).click();
}
try {
  await page.goto(report.origin + "/login");
  await page.getByLabel("Thư điện tử").fill("hxqa-warehouse-dispatch@example.test");
  await page.getByLabel("Mật khẩu", { exact: true }).fill(env.HX_QA_PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.waitForURL(url => /\/admin|\/select-branch/.test(url.pathname), { timeout: 30000 });
  if (page.url().includes("/select-branch")) {
    await page.getByLabel("Chi nhánh đang hoạt động").selectOption(docs.branch);
    await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
    await page.waitForURL(/\/admin/, { timeout: 30000 });
  }
  await open(docs.load.delivery);
  await shot("g14-plan15-before-loading");
  await assign(docs.worker);
  await page.getByRole("button", { name: "Bàn giao hàng lên xe", exact: true }).waitFor({ timeout: 30000 });
  const before = (await qa.sql`select sum(base_quantity_delta)::text qty from public.inventory_movements
    where material_id=${docs.stock.material} and location_kind='WAREHOUSE'`)[0].qty;
  await page.getByLabel(/Thực lấy ·/).fill("14");
  await page.getByRole("button", { name: "Bàn giao hàng lên xe", exact: true }).click();
  await page.getByRole("button", { name: "Đã tới nơi giao", exact: true }).waitFor({ timeout: 30000 });
  await page.reload();
  await page.getByRole("button", { name: "Đã tới nơi giao", exact: true }).waitFor();
  const [facts] = await qa.sql`select d.execution_state,l.planned_base_quantity::text planned,h.moved_base_quantity::text loaded,
    (select sum(base_quantity_delta)::text from public.inventory_movements where delivery_id=d.id and location_kind='IN_TRANSIT') transit,
    (select sum(base_quantity_delta)::text from public.inventory_movements where material_id=l.material_id and location_kind='WAREHOUSE') warehouse
    from public.deliveries d join public.delivery_lines l on l.delivery_id=d.id join public.delivery_handoff_lines h on h.delivery_line_id=l.id
    where d.id=${docs.load.delivery}`;
  assert.equal(facts.planned, "15.000000");
  assert.equal(facts.loaded, "14.000000");
  assert.equal(facts.transit, "14.000000");
  assert.equal(Number(before) - Number(facts.warehouse), 14);
  await shot("g14-actual14-saved-reloaded");
  report.checks.push({ name: "G14_REAL_UI_ACTUAL14_PLAN15_RELOAD_INDEPENDENT_READBACK", status: "PASS", facts });
  await open(docs.reassign.delivery);
  await assign(docs.worker);
  await page.getByText("Người giao hoặc xe đã được phân trong khung giờ này. Chọn lịch hoặc tài nguyên khác.", { exact: true }).waitFor({ timeout: 30000 });
  const [denied] = await qa.sql`select execution_state,version from public.deliveries where id=${docs.reassign.delivery}`;
  assert.deepEqual(denied, { execution_state: "PLANNED", version: 1 });
  await shot("g13-schedule-conflict-rejected");
  await assign(docs.worker, true);
  await page.getByRole("button", { name: "Giao việc qua cổng thợ", exact: true }).waitFor({ timeout: 30000 });
  await page.getByRole("button", { name: "Giao việc qua cổng thợ", exact: true }).click();
  await page.getByRole("button", { name: "Giao việc qua cổng thợ", exact: true }).waitFor({ state: "detached", timeout: 30000 });
  await assign(docs.newAssignee, true);
  await page.waitForURL(url => url.searchParams.get("notice") === "assigned", { timeout: 30000 });
  await page.reload();
  await page.getByRole("heading", { name: "Nguồn, lượng và bằng chứng" }).waitFor();
  const [synced] = await qa.sql`select da.employee_id delivery_employee,wa.employee_id work_employee,w.id work,
    w.version work_version,d.version delivery_version from public.deliveries d join public.work_items w on w.delivery_id=d.id
    join public.delivery_assignments da on da.delivery_id=d.id and da.superseded_at is null
    join public.work_item_assignments wa on wa.work_item_id=w.id and wa.superseded_at is null where d.id=${docs.reassign.delivery}`;
  assert.equal(synced.delivery_employee, docs.newAssignee);
  assert.equal(synced.work_employee, docs.newAssignee);
  await shot("g06-published-work-reassignment-synced");
  report.checks.push({ name: "G06_G13_REAL_UI_CONFLICT_RECOVERY_PUBLISH_REASSIGN_RELOAD", status: "PASS", denied, synced });
  await open(docs.exception.delivery);
  await page.getByLabel("Khách chấp nhận", { exact: true }).fill("14");
  await page.getByLabel("Lượng tính tiền", { exact: true }).fill("14");
  await page.getByRole("button", { name: "Xác minh và ghi nhận", exact: true }).click();
  await page.getByRole("button", { name: "Xác minh và ghi nhận", exact: true }).waitFor({ state: "detached", timeout: 30000 });
  const [exception] = await qa.sql`select delivery_number,result_kind,execution_state from public.deliveries where id=${docs.exception.delivery}`;
  assert.deepEqual({ kind: exception.result_kind, state: exception.execution_state }, { kind: "FULL", state: "VERIFIED" });
  await page.goto(report.origin + "/admin/dispatch?q=" + encodeURIComponent(exception.delivery_number));
  const column = page.locator(".dispatch-column").filter({ has: page.getByRole("heading", { name: "Ngoại lệ", exact: true }) });
  await column.getByRole("link", { name: new RegExp(exception.delivery_number) }).waitFor({ timeout: 30000 });
  await page.reload();
  await column.getByRole("link", { name: new RegExp(exception.delivery_number) }).waitFor();
  await shot("g10-full-result-accepted14-exception-visible");
  report.checks.push({ name: "G10_REAL_UI_FULL_RESULT_DIFFERENCE_VISIBLE_ON_BOARD_RELOAD", status: "PASS", exception });
  await page.setViewportSize({ width: 390, height: 844 });
  await open(docs.load.delivery);
  await shot("g14-mobile-actual-loading-readback");
  report.checks.push({ name: "PACKAGE3_MOBILE_DELIVERY_READ", status: "PASS", viewport: "390x844" });
  assert.equal(report.consoleErrors.length, 0);
  report.status = "PASS_EXECUTED_BROWSER_SCOPE";
  await writeFile(args.out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, screenshots: report.screenshots.length, consoleErrors: 0 }));
} catch (error) {
  await shot("package3-failure").catch(() => {});
  await writeFile(args.out.replace(/\.json$/, "-failure.json"), JSON.stringify({ ...report, status: "FAIL", error: error.message }, null, 2));
  throw error;
} finally { await browser.close(); await qa.sql.end({ timeout: 3 }); }
