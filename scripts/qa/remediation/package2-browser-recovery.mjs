import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { parseEnv } from "node:util";
import { chromium } from "@playwright/test";
import { argumentsForRun, openQA } from "./native-fixture.mjs";
import { observeIntentionalResponseLoss } from "./browser-faults.mjs";
const args = argumentsForRun();
const env = parseEnv(await readFile(args["auth-env"], "utf8"));
assert.equal(env.HX_QA_PROJECT_REF, "ffrwiglcrlumfvhubaxg");
const documents = JSON.parse(await readFile(args.documents, "utf8")).documents;
const qa = await openQA(args);
await mkdir(args.screenshots, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const report = { scope: "REAL_BROWSER_LOST_RESPONSE_AFTER_ACTUAL_PAYMENT_COMMIT", origin: "http://127.0.0.1:3110",
  browserPlugin: "ABSENT", fallback: "Installed Playwright", productionAccess: "NONE", checks: [], expectedTransportErrors: [] };
const faults = observeIntentionalResponseLoss(page, report, "/admin/receivables");
try {
  await page.goto(report.origin + "/login");
  await page.getByLabel("Thư điện tử").fill("hxqa-finance-employee@example.test");
  await page.getByLabel("Mật khẩu", { exact: true }).fill(env.HX_QA_PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.waitForURL((url) => /\/admin|\/select-branch/.test(url.pathname), { timeout: 30000 });
  if (page.url().includes("select-branch")) {
    await page.getByLabel("Chi nhánh đang hoạt động").selectOption(documents.branch);
    await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
    await page.waitForURL(/\/admin/);
  }
  const target = report.origin + "/admin/receivables?customer=" + documents.customer;
  await page.goto(target);
  await page.getByLabel("Số tiền nhận", { exact: false }).fill("1000000");
  await page.locator('select[name="accountId"]').selectOption(documents.account);
  let lostResponse = false;
  await page.route("**/admin/receivables**", async (route) => {
    if (route.request().method() !== "POST" || lostResponse) return route.continue();
    const response = await route.fetch();
    const [facts] = await qa.sql`select count(*)::int n from public.payments where customer_id=${documents.customer}`;
    if (facts.n === 1) {
      lostResponse = true;
      faults.markIntentionalLoss();
      await route.abort("failed");
    } else await route.fulfill({ response });
  });
  await page.getByRole("button", { name: "Ghi nhận thu tiền", exact: true }).click();
  await page.getByText(/Phản hồi bị gián đoạn/).waitFor({ timeout: 30000 });
  assert.equal(lostResponse, true, "Fault must happen after actual DB COMMIT, not before request");
  const beforeReload = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("hx-intent-v1:")));
  assert.ok(beforeReload.length);
  assert.ok(beforeReload.every(([, value]) => /^[0-9a-f-]{36}$/i.test(value)), "Browser storage must contain no financial payload");
  await page.screenshot({ path: args.screenshots + "/g15-payment-response-lost.png", fullPage: true });
  await page.unroute("**/admin/receivables**");
  await page.reload();
  await page.getByText(/Thao tác này đã được ghi nhận/).waitFor({ timeout: 30000 });
  const [after] = await qa.sql`select count(*)::int n,sum(amount_vnd)::text amount from public.payments where customer_id=${documents.customer}`;
  assert.deepEqual(after, { n: 1, amount: "1000000" });
  report.checks.push({ name: "ACTUAL_COMMIT_RESPONSE_LOST_RELOAD_RECONCILES_ONE_RECEIPT", status: "PASS", facts: after, browserIdentifierOnly: true });
  await page.screenshot({ path: args.screenshots + "/g15-payment-recovered-after-reload.png", fullPage: true });
  await page.getByLabel("Số tiền nhận", { exact: false }).fill("1000000");
  await page.locator('select[name="accountId"]').selectOption(documents.account);
  await page.getByRole("button", { name: "Ghi nhận thu tiền", exact: true }).click();
  await page.getByText(/Đã ghi nhận thu\/chi và các phân bổ đúng nguồn/).waitFor({ timeout: 30000 });
  const [two] = await qa.sql`select count(*)::int n,sum(amount_vnd)::text amount from public.payments where customer_id=${documents.customer}`;
  assert.deepEqual(two, { n: 2, amount: "2000000" });
  report.checks.push({ name: "DISTINCT_ACTUAL_RECEIPT_SAME_AMOUNT_ALLOWED", status: "PASS", facts: two });
  await faults.assertHealthy();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: args.screenshots + "/g15-payment-mobile.png", fullPage: true });
  report.status = "PASS_EXECUTED_BROWSER_PAYMENT_RECOVERY_SCOPE";
  await writeFile(args.out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, actualLostResponseAfterCommit: true }));
} catch (error) {
  await page.screenshot({ path: args.screenshots + "/g15-failure.png", fullPage: true });
  await writeFile(args.out.replace(/\.json$/, "-failure.json"), JSON.stringify({ url: page.url(), title: await page.title(), body: (await page.locator("body").innerText()).slice(0, 10000), error: error.message }, null, 2));
  throw error;
} finally { await browser.close(); await qa.sql.end({ timeout: 3 }); }
