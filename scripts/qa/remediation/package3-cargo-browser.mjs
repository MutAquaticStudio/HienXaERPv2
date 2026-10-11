import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import path from "node:path";
import { chromium } from "@playwright/test";
import { argumentsForRun, openQA } from "./native-fixture.mjs";

const args = argumentsForRun(), qa = await openQA(args);
const docs = JSON.parse(await readFile(args.documents, "utf8")).documents;
const env = parseEnv(await readFile(args["auth-env"], "utf8"));
assert.equal(env.HX_QA_PROJECT_REF, "ffrwiglcrlumfvhubaxg");
await mkdir(args.screenshots, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const report = { scope: "G13_REAL_WAREHOUSE_BROWSER_ACTUAL_CARGO_LIMIT", database: args.database,
  origin: "http://127.0.0.1:3110", browserPlugin: "ABSENT",
  fallbackReason: "Browser plugin and browser skill not available; installed Playwright used",
  productionAccess: "NONE", consoleErrors: [], screenshots: [], checks: [] };
page.on("pageerror", error => report.consoleErrors.push(error.message));
page.on("console", message => { if (message.type() === "error") report.consoleErrors.push(message.text()); });
async function shot(name) {
  const filename = path.join(args.screenshots, name + ".png");
  await page.screenshot({ path: filename, fullPage: true, caret: "initial" });
  report.screenshots.push(filename);
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
  await page.goto(report.origin + "/admin/deliveries/" + docs.second.delivery);
  await page.getByRole("heading", { name: "Nguồn, lượng và bằng chứng" }).waitFor();
  await page.getByLabel(/Thực lấy ·/).fill("15");
  await page.getByRole("button", { name: "Bàn giao hàng lên xe", exact: true }).click();
  const message = "Tổng hàng thực lấy và hàng còn trên xe vượt sức chứa đã xác minh. Xử lý hàng của phiếu trước hoặc chọn xe phù hợp trước khi bàn giao.";
  await page.getByText(message, { exact: true }).waitFor({ timeout: 30000 });
  await shot("g13-cargo-limit-vietnamese-denial");
  await page.reload();
  await page.getByText(message, { exact: true }).waitFor();
  const [denied] = await qa.sql`select execution_state,version,
    (select count(*)::int from public.delivery_handoffs where delivery_id=${docs.second.delivery}) handoffs
    from public.deliveries where id=${docs.second.delivery}`;
  assert.deepEqual(denied, { execution_state: "ASSIGNED", version: 2, handoffs: 0 });
  await page.setViewportSize({ width: 390, height: 844 });
  await shot("g13-mobile-cargo-limit-reloaded");
  report.checks.push({ name: "OVERLOAD_DENIAL_AND_RELOAD_KEEPS_ASSIGNED_WITHOUT_EFFECT", status: "PASS", denied });
  await page.getByLabel(/Thực lấy ·/).fill("5");
  await page.getByRole("button", { name: "Bàn giao hàng lên xe", exact: true }).click();
  await page.getByRole("button", { name: "Đã tới nơi giao", exact: true }).waitFor({ timeout: 30000 });
  await page.reload();
  await page.getByRole("button", { name: "Đã tới nơi giao", exact: true }).waitFor();
  const [accepted] = await qa.sql`select d.execution_state,h.moved_base_quantity::text loaded,
    (select sum(hl.moved_base_quantity)::text from public.delivery_handoff_lines hl join public.delivery_lines l on l.id=hl.delivery_line_id
      where l.delivery_id in(${docs.first.delivery},${docs.second.delivery})) total,
    (select count(*)::int from public.delivery_handoffs where delivery_id=d.id) handoffs,
    (select sum(base_quantity_delta)::text from public.inventory_movements where delivery_id=d.id and location_kind='IN_TRANSIT') transit
    from public.deliveries d join public.delivery_lines l on l.delivery_id=d.id
    join public.delivery_handoff_lines h on h.delivery_line_id=l.id where d.id=${docs.second.delivery}`;
  assert.deepEqual(accepted, { execution_state: "DISPATCHED", loaded: "5.000000", total: "20.000000", handoffs: 1, transit: "5.000000" });
  await shot("g13-mobile-load-five-total-twenty-committed");
  await page.setViewportSize({ width: 1280, height: 900 });
  await shot("g13-desktop-load-five-total-twenty-committed");
  report.checks.push({ name: "LOADS_ONLY_REMAINING_FIVE_AND_RELOAD_CONFIRMS_TOTAL_TWENTY", status: "PASS", accepted });
  assert.equal(report.consoleErrors.length, 0);
  report.status = "PASS_REAL_BROWSER_CARGO_LIMIT";
  await writeFile(args.out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, screenshots: report.screenshots.length, consoleErrors: 0 }));
} catch (error) {
  await shot("g13-cargo-browser-failure").catch(() => {});
  await writeFile(args.out.replace(/\.json$/, "-failure.json"), JSON.stringify({ ...report, status: "FAIL", error: error.message }, null, 2));
  throw error;
} finally { await browser.close(); await qa.sql.end({ timeout: 3 }); }
