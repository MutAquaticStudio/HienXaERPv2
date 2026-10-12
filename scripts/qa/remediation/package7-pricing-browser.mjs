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
const browser = await chromium.launch({ headless: true }), page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const report = { scope: "G04_REAL_SALES_BROWSER_SAVED_PRICE_QTY_EDIT_RELOAD", browserPlugin: "ABSENT", fallback: "Installed Playwright; Browser plugin not available", productionAccess: "NONE", checks: [] };
const faults = observeIntentionalResponseLoss(page, report, "/unused");
try {
  await page.goto("http://127.0.0.1:3110/login");
  await page.getByLabel("Thư điện tử").fill("hxqa-sales@example.test"); await page.getByLabel("Mật khẩu", { exact: true }).fill(env.HX_QA_PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click(); await page.waitForURL(url => /\/admin|\/select-branch/.test(url.pathname));
  await page.goto("http://127.0.0.1:3110/select-branch"); await page.getByLabel("Chi nhánh đang hoạt động").selectOption(d.branch);
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click(); await page.waitForURL(/\/admin/);
  await page.goto("http://127.0.0.1:3110/admin/orders/" + d.saved + "/edit");
  await page.getByLabel("Số lượng *", { exact: true }).fill("3");
  await page.getByRole("button", { name: "Tính giá và xem trước", exact: true }).click();
  await page.getByText("230.000", { exact: false }).first().waitFor();
  await faults.assertHealthy();
  await page.screenshot({ path: args.screenshots + "/g04-saved-price-preview.png", fullPage: true });
  await page.getByRole("button", { name: "Lưu thay đổi bản nháp", exact: true }).click();
  await page.waitForURL(url => url.pathname === "/admin/orders/" + d.saved);
  await page.reload(); await page.getByRole("heading", { name: /^SO-/ }).waitFor();
  const observer = await openQA(args);
  try {
    const [fact] = await observer.sql`select quantity::text qty,unit_price_vnd::text price,line_total_vnd::text total from public.sales_order_lines where sales_order_id=${d.saved}`;
    assert.deepEqual(fact, { qty: "3.000000", price: "230000", total: "690000" });
    const [rule] = await observer.sql`select unit_price_vnd::text price from public.pricing_rules where id=${d.preferred}`; assert.equal(rule.price, "260000");
    report.checks.push({ name: "ACTUAL_SALES_UI_SAVED230K_PRICE_QTY3_STORED690K_DESPITE_NEW260K_RULE", status: "PASS", fact, currentRule: rule });
  } finally { await observer.sql.end({ timeout: 3 }); }
  await faults.assertHealthy();
  await page.screenshot({ path: args.screenshots + "/g04-saved-price-after-reload.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: args.screenshots + "/g04-saved-price-mobile.png", fullPage: true });
  report.status = "PASS_SALES_BROWSER_SAVED_PRICE_AND_INDEPENDENT_READ";
  await writeFile(args.out, JSON.stringify(report, null, 2)); console.log(JSON.stringify({ status: report.status, checks: report.checks.length, unexpectedErrors: report.unexpectedErrors.length }));
} catch (error) {
  await page.screenshot({ path: args.screenshots + "/g04-failure.png", fullPage: true });
  await writeFile(args.out.replace(/\.json$/, "-failure.json"), JSON.stringify({ ...report, url: page.url(), body: (await page.locator("body").innerText()).slice(0, 9000), status: "FAIL", error: error.message }, null, 2)); throw error;
} finally { await browser.close(); await qa.sql.end({ timeout: 3 }); }
