import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { chromium } from "@playwright/test";
import { argumentsForRun, openQA } from "./native-fixture.mjs";
import { observeIntentionalResponseLoss } from "./browser-faults.mjs";

const args = argumentsForRun(), qa = await openQA(args);
const env = parseEnv(await readFile(args["auth-env"], "utf8")); assert.equal(env.HX_QA_PROJECT_REF, "ffrwiglcrlumfvhubaxg");
const d = JSON.parse(await readFile(args.documents, "utf8")).documents;
await mkdir(args.screenshots, { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = { scope: "G16_REAL_BROWSER_COST_INCOMPLETE_TO_COMPLETE_G05_ROLE_GUARD_AR_EXPORT", browserPlugin: "ABSENT",
  fallback: "Installed Playwright; Browser plugin not available", origin: "http://127.0.0.1:3110", productionAccess: "NONE", checks: [] };
try {
  async function login(role) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage(), faults = observeIntentionalResponseLoss(page, report, "/unused");
    await page.goto(report.origin + "/login");
    await page.getByLabel("Thư điện tử").fill("hxqa-" + role + "@example.test");
    await page.getByLabel("Mật khẩu", { exact: true }).fill(env.HX_QA_PASSWORD);
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await page.waitForURL(url => /\/admin|\/select-branch/.test(url.pathname));
    if (page.url().includes("select-branch")) {
      await page.getByLabel("Chi nhánh đang hoạt động").selectOption(qa.fixtures.branch);
      await page.getByRole("button", { name: "Tiếp tục", exact: true }).click(); await page.waitForURL(/\/admin/);
    }
    return { page, faults };
  }
  const target = report.origin + "/admin?from=2000-01-01&to=2099-01-01&activity=DELIVERY&customer=" + d.customer;
  const finance = await login("finance-employee");
  await finance.page.goto(target);
  const profit = finance.page.locator(".finance-metrics .metric-card").filter({ hasText: "Lợi nhuận ròng" });
  await profit.getByText("Chưa đủ hoặc chưa khớp giá vốn theo dòng và nguồn", { exact: true }).waitFor();
  assert.equal(await profit.locator(".metric-value").innerText(), "—");
  await finance.faults.assertHealthy();
  await finance.page.screenshot({ path: args.screenshots + "/g16-cost-missing-desktop.png", fullPage: true });
  report.checks.push({ name: "WAREHOUSE_COST_PRESENT_DIRECT_COST_MISSING_HIDES_PROFIT", status: "PASS", profit: await profit.innerText() });
  const warehouse = await login("warehouse-dispatch");
  await warehouse.page.goto(report.origin + "/admin/purchase-orders/" + d.po);
  await warehouse.page.locator('input[name="quantity"]').fill("5");
  await warehouse.page.getByRole("button", { name: "Xác minh NCC giao", exact: true }).click();
  await warehouse.page.getByText("Đã hoàn tất lượng mua. Hóa đơn NCC đến sau chỉ dùng đối soát, không ghi công nợ phải trả lần hai.", { exact: true }).waitFor();
  await warehouse.faults.assertHealthy();
  const observer = await openQA(args);
  try {
    const [facts] = await observer.sql`select (select count(*)::int from public.supplier_fulfillments where purchase_order_id=${d.po}) source,
      (select sum(payable_amount_vnd)::text from public.supplier_fulfillment_lines where purchase_order_line_id=${d.purchaseLine}) cost`;
    assert.deepEqual(facts, { source: 1, cost: "750000" });
    report.checks.push({ name: "ACTUAL_WAREHOUSE_UI_SOURCE_COMMIT_INDEPENDENT_READ", status: "PASS", facts });
  } finally { await observer.sql.end({ timeout: 3 }); }
  await finance.page.reload();
  await profit.locator(".metric-value").filter({ hasText: "800.000" }).waitFor();
  assert.doesNotMatch(await profit.innerText(), /Chưa đủ/);
  await finance.faults.assertHealthy();
  await finance.page.screenshot({ path: args.screenshots + "/g16-cost-complete-desktop.png", fullPage: true });
  await finance.page.setViewportSize({ width: 390, height: 844 });
  await finance.page.screenshot({ path: args.screenshots + "/g16-cost-complete-mobile.png", fullPage: true });
  report.checks.push({ name: "RELOAD_COMPLETE_ONLY_AFTER_BOTH_SOURCE_LINES_MATCH", status: "PASS", profit: await profit.innerText() });
  const csv = await finance.page.request.get(report.origin + "/api/reports/export?report=receivables&customer=" + d.customer);
  assert.equal(csv.status(), 200); const contents = await csv.text();
  assert.match(contents, /"quality","READY"/); assert.match(contents, /"total_vnd","2300000"/);
  assert.doesNotMatch(contents, /inventory_unit_cost|unit_cost_vnd|gross_profit/);
  await writeFile(args.screenshots + "/g16-source-ar-export.csv", contents);
  report.checks.push({ name: "AUTHENTICATED_AR_CSV_MATCHES_SOURCE_DEBT_WITHOUT_COST_FIELDS", status: "PASS", totalVnd: "2300000", pnlCsvImplemented: false });
  const sales = await login("sales"); await sales.page.goto(target);
  assert.equal(await sales.page.locator(".finance-metrics .metric-card").filter({ hasText: "Lợi nhuận ròng" }).count(), 0);
  await sales.faults.assertHealthy();
  report.checks.push({ name: "SALES_ROLE_CANNOT_READ_COST_OR_PROFIT_FROM_NEW_DASHBOARD_PATH", status: "PASS" });
  report.status = "PASS_BROWSER_COST_SOURCE_COMPLETENESS_AND_SCOPED_EXPORT";
  await writeFile(args.out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, unexpectedErrors: report.unexpectedErrors.length }));
} catch (error) {
  report.failurePages = [];
  for (const [i, page] of browser.contexts().flatMap(context => context.pages()).entries()) {
    report.failurePages.push({ url: page.url(), body: (await page.locator("body").innerText()).slice(0, 8000) });
    await page.screenshot({ path: args.screenshots + "/g16-failure-" + i + ".png", fullPage: true });
  }
  await writeFile(args.out.replace(/\.json$/, "-failure.json"), JSON.stringify({ ...report, status: "FAIL", error: error.message }, null, 2)); throw error;
} finally { await browser.close(); await qa.sql.end({ timeout: 3 }); }
