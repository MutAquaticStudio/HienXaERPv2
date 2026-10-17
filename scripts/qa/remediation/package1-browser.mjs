import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseEnv } from "node:util";
import { chromium } from "@playwright/test";
import { argumentsForRun, openQA } from "./native-fixture.mjs";

const args = argumentsForRun();
for (const key of ["auth-env", "documents", "screenshots"]) assert.ok(args[key]);
const env = parseEnv(await readFile(args["auth-env"], "utf8"));
assert.equal(env.HX_QA_PROJECT_REF, "ffrwiglcrlumfvhubaxg");
const documents = JSON.parse(await readFile(args.documents, "utf8")).documents;
const qa = await openQA(args);
await mkdir(args.screenshots, { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = { scope: "REAL_BROWSER_REAL_QA_LOGIN_NATIVE_RPC_AND_FRESH_READBACK", database: args.database,
  browser: "Chromium", browserPlugin: "ABSENT", fallbackReason: "Browser plugin and browser skill not available; installed Playwright used",
  origin: "http://127.0.0.1:3110", productionAccess: "NONE", consoleErrors: [], checks: [], screenshots: [] };
async function login(role, viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on("pageerror", (error) => report.consoleErrors.push({ role, message: error.message }));
  page.on("console", (message) => { if (message.type() === "error") report.consoleErrors.push({ role, message: message.text() }); });
  await page.goto(report.origin + "/login");
  await page.getByLabel("Thư điện tử").fill(`hxqa-${role}@example.test`);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(env.HX_QA_PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.waitForURL((url) => /\/admin|\/select-branch/.test(url.pathname), { timeout: 30000 });
  if (page.url().includes("/select-branch")) {
    await page.getByLabel("Chi nhánh đang hoạt động").selectOption(documents.branch);
    await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
    await page.waitForURL(/\/admin/, { timeout: 30000 });
  }
  return { page, context };
}
async function screenshot(page, name) {
  const filename = path.join(args.screenshots, name + ".png");
  await page.screenshot({ path: filename, fullPage: true });
  report.screenshots.push(filename);
}
try {
  const { page, context } = await login("warehouse-dispatch");
  // FB2 Đợt 5: the count page is a sheet; approval is "Hoàn thành & cân bằng kho" confirmed in a popup.
  const completeCount = async () => {
    await page.getByRole("button", { name: "Hoàn thành & cân bằng kho", exact: true }).click();
    await page.getByRole("dialog", { name: "Hoàn thành phiếu kiểm" }).getByRole("button", { name: "Cân bằng kho", exact: true }).click();
  };
  await page.goto(report.origin + "/admin/stock-counts/" + documents.staleCount);
  await page.locator(".stock-count-sheet").waitFor();
  assert.ok((await page.title()).length);
  await screenshot(page, "g01-stale-before-approval");
  await completeCount();
  await page.getByText(/căn cứ đếm không còn hợp lệ/).first().waitFor({ timeout: 30000 });
  await screenshot(page, "g01-stale-rejected-vietnamese");
  await page.reload();
  await page.locator(".stock-count-sheet").waitFor();
  const [stale] = await qa.sql`select state from public.stock_counts where id=${documents.staleCount}`;
  assert.equal(stale.state, "OPEN");
  report.checks.push({ name: "G01_WAREHOUSE_UI_DENIED_WITH_VIETNAMESE_REASON_RELOAD", status: "PASS", state: stale.state, viewport: "1280x900" });
  await page.goto(report.origin + "/admin/stock-counts/" + documents.validCount);
  await completeCount();
  await page.getByText(/Đã cân bằng kho theo các dòng/).waitFor({ timeout: 30000 });
  await page.reload();
  await page.getByText(/Đã cân bằng kho theo các dòng/).waitFor();
  const [valid] = await qa.sql`select (select state from public.stock_counts where id=${documents.validCount}) state,
    (select sum(base_quantity_delta)::text from public.inventory_movements where material_id=${documents.validMaterial} and warehouse_id=${qa.fixtures.warehouse}) qty`;
  assert.deepEqual(valid, { state: "APPROVED", qty: "15.000000" });
  await screenshot(page, "g01-valid-approved-reloaded");
  report.checks.push({ name: "G01_WAREHOUSE_UI_VALID_COMMIT_RELOAD_READBACK", status: "PASS", facts: valid });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(report.origin + "/admin/stock-counts/" + documents.staleCount);
  await page.locator(".stock-count-sheet").waitFor();
  await screenshot(page, "g01-mobile-count");
  report.checks.push({ name: "G01_MOBILE_COUNT_READ", status: "PASS", viewport: "390x844" });
  await context.close();
  const sales = await login("sales");
  await sales.page.goto(report.origin + "/admin/deliveries/" + documents.costDelivery);
  await sales.page.getByRole("heading", { name: "Nguồn, lượng và bằng chứng" }).waitFor();
  assert.equal(await sales.page.getByRole("button", { name: "Hoàn thành & cân bằng kho" }).count(), 0);
  assert.equal(await sales.page.locator("nextjs-portal").filter({ hasText: /Runtime Error|Unhandled/ }).count(), 0);
  await sales.page.reload();
  await sales.page.getByRole("heading", { name: "Nguồn, lượng và bằng chứng" }).waitFor();
  await screenshot(sales.page, "g05-sales-safe-delivery-detail");
  report.checks.push({ name: "G05_SALES_DELIVERY_DETAIL_SAFE_VIEW_RELOAD", status: "PASS", role: "sales" });
  await sales.context.close();
  assert.equal(report.consoleErrors.length, 0, "Browser console errors require investigation");
  report.status = "PASS_EXECUTED_BROWSER_SCOPE";
  await writeFile(args.out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, consoleErrors: report.consoleErrors.length, screenshots: report.screenshots.length }));
} finally { await browser.close(); await qa.sql.end({ timeout: 3 }); }
