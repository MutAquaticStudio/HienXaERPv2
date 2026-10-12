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
const report = { scope: "G11_REAL_BROWSER_PENDING_BRANCH_NO_ACTIVATION_NEW_RECEIPT_SCOPED_REPORTS", browserPlugin: "ABSENT",
  fallback: "Installed Playwright; Browser plugin not available", origin: "http://127.0.0.1:3110", productionAccess: "NONE", cloudRolesChanged: false, checks: [] };
try {
  const [{ start: beforeStart }] = await qa.sql`select started_at::text start from private.branch_recorded_operations where branch_id=${d.branch}`;
  async function login(role) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage(), faults = observeIntentionalResponseLoss(page, report, "/unused");
    await page.goto(report.origin + "/login");
    await page.getByLabel("Thư điện tử").fill("hxqa-" + role + "@example.test");
    await page.getByLabel("Mật khẩu", { exact: true }).fill(env.HX_QA_PASSWORD);
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await page.waitForURL(url => /\/admin|\/select-branch/.test(url.pathname));
    await page.goto(report.origin + "/select-branch");
    await page.getByLabel("Chi nhánh đang hoạt động").selectOption(d.branch);
    await page.getByRole("button", { name: "Tiếp tục", exact: true }).click(); await page.waitForURL(/\/admin/);
    return { page, faults };
  }
  const owner = await login("owner"); await owner.page.goto(report.origin + "/admin/operations");
  await owner.page.getByRole("heading", { name: "Phạm vi dữ liệu", exact: true }).waitFor();
  assert.equal(await owner.page.getByRole("button", { name: "Kích hoạt vận hành", exact: true }).count(), 0);
  await owner.page.getByText("Có thể thực hiện giao dịch mới hợp lệ mà không nhập số dư đầu kỳ hoặc kích hoạt thủ công.", { exact: true }).waitFor();
  await owner.page.getByText(/Thiếu lịch sử không có nghĩa số dư trước đây bằng 0/).waitFor();
  await owner.faults.assertHealthy();
  await owner.page.screenshot({ path: args.screenshots + "/g11-no-manual-activation-desktop.png", fullPage: true });
  report.checks.push({ name: "PENDING_BRANCH_OPERATIONS_PAGE_HAS_NO_ACTIVATION_CHECKLIST_OR_ZERO_ENTRY", status: "PASS" });
  const warehouse = await login("warehouse-dispatch"); await warehouse.page.goto(report.origin + "/admin/purchase-orders/" + d.stock.po);
  if (args.resume !== "true") {
  await warehouse.page.locator('input[name="quantity"]').fill("1");
  await warehouse.page.getByRole("button", { name: "Xác nhận nhận hàng", exact: true }).click();
  await warehouse.page.getByText("Đã hoàn tất lượng mua. Hóa đơn NCC đến sau chỉ dùng đối soát, không ghi công nợ phải trả lần hai.", { exact: true }).waitFor();
  }
  await warehouse.page.reload();
  await warehouse.page.getByText("Đã hoàn tất lượng mua. Hóa đơn NCC đến sau chỉ dùng đối soát, không ghi công nợ phải trả lần hai.", { exact: true }).waitFor();
  await warehouse.faults.assertHealthy();
  await warehouse.page.screenshot({ path: args.screenshots + "/g11-new-receipt-pending-branch.png", fullPage: true });
  const observer = await openQA(args);
  try {
    const [facts] = await observer.sql`select (select state from private.branch_operational_states where branch_id=${d.branch}) state,
      (select version from private.branch_operational_states where branch_id=${d.branch}) version,
      (select activation_operation_id from private.branch_operational_states where branch_id=${d.branch}) activation,
      (select sum(base_quantity_delta)::text from public.inventory_movements where material_id=${d.stock.material} and location_kind='WAREHOUSE') stock,
      (select count(*)::int from public.purchase_receipts where purchase_order_id=${d.stock.po}) receipts,
      (select started_at::text from private.branch_recorded_operations where branch_id=${d.branch}) start`;
    assert.deepEqual(facts, { state: "PENDING_OPENING", version: 0, activation: null, stock: "1.000000", receipts: 2, start: beforeStart });
    report.checks.push({ name: "ACTUAL_NEW_RECEIPT_COMMIT_RELOAD_START_AND_ACTIVATION_UNCHANGED", status: "PASS", facts, resumedCommittedBrowserSource: args.resume === "true" });
  } finally { await observer.sql.end({ timeout: 3 }); }
  const finance = await login("finance-employee");
  await finance.page.goto(report.origin + "/admin?from=2000-01-01&to=2099-01-01&activity=DELIVERY&customer=" + d.customer);
  await finance.page.locator('[data-uat-dashboard-content="ready"]').waitFor();
  await finance.page.locator('[data-recording-scope="RECORDED_TRANSACTIONS"]').getByText(/lịch sử chưa đối chiếu/).waitFor();
  const profit = finance.page.locator(".finance-metrics .metric-card").filter({ hasText: "Lợi nhuận gộp quản trị" });
  assert.match(await profit.innerText(), /1\.120\.000/);
  await finance.faults.assertHealthy();
  await finance.page.screenshot({ path: args.screenshots + "/g11-recorded-dashboard-desktop.png", fullPage: true });
  await finance.page.setViewportSize({ width: 390, height: 844 });
  await finance.page.screenshot({ path: args.screenshots + "/g11-recorded-dashboard-mobile.png", fullPage: true });
  const exported = await finance.page.request.get(report.origin + "/api/reports/export?report=receivables&customer=" + d.customer);
  assert.equal(exported.status(), 200); const csv = await exported.text();
  assert.match(csv, /"total_vnd","2920000"/); assert.match(csv, /lịch sử chưa đối chiếu/); assert.match(csv, /chưa xác minh tổng số dư toàn doanh nghiệp/);
  await writeFile(args.screenshots + "/g11-recorded-receivables.csv", csv);
  report.checks.push({ name: "NEW_TRANSACTIONS_REPORT_AND_EXPORT_KEEP_UNRECONCILED_HISTORY_SCOPE", status: "PASS", revenue: "3220000", gross: "1120000", debt: "2920000" });
  await finance.page.goto(report.origin + "/admin/cashbook"); await finance.page.locator('[data-recording-scope="RECORDED_TRANSACTIONS"]').waitFor();
  await finance.page.goto(report.origin + "/admin/inventory"); await finance.page.locator('[data-recording-scope="RECORDED_TRANSACTIONS"]').waitFor();
  await finance.page.getByRole("columnheader", { name: "Tồn đã ghi nhận", exact: true }).waitFor();
  await finance.faults.assertHealthy();
  report.checks.push({ name: "CASH_AND_INVENTORY_DESCRIBE_RECORDED_FACTS_WITHOUT_ASSUMING_HISTORY_ZERO", status: "PASS" });
  report.status = "PASS_G11_BROWSER_PENDING_BRANCH_AND_SCOPED_EXPORT";
  await writeFile(args.out, JSON.stringify(report, null, 2)); console.log(JSON.stringify({ status: report.status, checks: report.checks.length, unexpectedErrors: report.unexpectedErrors.length }));
} catch (error) {
  report.failurePages = [];
  for (const [i, page] of browser.contexts().flatMap(context => context.pages()).entries()) {
    report.failurePages.push({ url: page.url(), body: (await page.locator("body").innerText()).slice(0, 8000) });
    await page.screenshot({ path: args.screenshots + "/g11-failure-" + i + ".png", fullPage: true });
  }
  await writeFile(args.out.replace(/\.json$/, "-failure.json"), JSON.stringify({ ...report, status: "FAIL", error: error.message }, null, 2)); throw error;
} finally { await browser.close(); await qa.sql.end({ timeout: 3 }); }
