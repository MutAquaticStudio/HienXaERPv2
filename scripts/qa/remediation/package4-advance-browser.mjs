import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseEnv } from "node:util";
import { chromium } from "@playwright/test";
import { argumentsForRun, openQA } from "./native-fixture.mjs";
const args = argumentsForRun(), qa = await openQA(args);
const all = JSON.parse(await readFile(args.documents, "utf8")).documents, doc = all.browser;
const env = parseEnv(await readFile(args["auth-env"], "utf8"));
assert.equal(env.HX_QA_PROJECT_REF, "ffrwiglcrlumfvhubaxg");
await mkdir(args.screenshots, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
let dropped = false;
const report = { scope: "G07_BROWSER_PRIOR_ADVANCE_LOST_ALLOCATION_RESPONSE_RECOVERY", database: args.database,
  origin: "http://127.0.0.1:3110", browserPlugin: "ABSENT", fallbackReason: "Browser plugin and browser skill not available; installed Playwright used",
  checks: [], screenshots: [], errors: [], productionAccess: "NONE" };
page.on("pageerror", error => report.errors.push({ message: error.message, afterIntentionalAbort: dropped }));
page.on("console", message => { if (message.type() === "error") report.errors.push({ message: message.text(), afterIntentionalAbort: dropped }); });
async function shot(name) { const file = path.join(args.screenshots, name + ".png"); await page.screenshot({ path: file, fullPage: true, caret: "initial" }); report.screenshots.push(file); }
try {
  await page.goto(report.origin + "/login");
  await page.getByLabel("Thư điện tử").fill("hxqa-finance-employee@example.test");
  await page.getByLabel("Mật khẩu", { exact: true }).fill(env.HX_QA_PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.waitForURL(url => /\/admin|\/select-branch/.test(url.pathname), { timeout: 30000 });
  if (page.url().includes("/select-branch")) {
    await page.getByLabel("Chi nhánh đang hoạt động").selectOption(all.branch);
    await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
    await page.waitForURL(/\/admin/, { timeout: 30000 });
  }
  await page.goto(report.origin + "/admin/receivables?customer=" + doc.customer);
  const title = page.getByRole("heading", { name: "Phân bổ phiếu thu đã có", exact: true });
  await title.waitFor();
  assert.ok((await page.title()).length);
  const form = page.locator("form").filter({ has: title });
  await form.getByRole("button", { name: "Tìm khoản", exact: true }).click();
  const field = form.getByRole("textbox", { name: /Phân bổ tiền đã có cho/ });
  await field.waitFor();
  await form.getByLabel("Phiếu thu còn tiền", { exact: true }).selectOption(doc.payment);
  await field.fill("1000000");
  await shot("g07-prior-advance-selected-before-allocation");
  await page.route("**/*", async route => {
    const req = route.request();
    if (!dropped && req.method() === "POST" && req.headers()["next-action"]) {
      const response = await route.fetch();
      const [fact] = await qa.sql`select count(*)::int effects from public.payment_allocations where payment_id=${doc.payment}`;
      if (fact.effects === 1) { dropped = true; await route.abort("failed"); return; }
      await route.fulfill({ response }); return;
    }
    await route.continue();
  });
  await form.getByRole("button", { name: "Phân bổ tiền đã có", exact: true }).click();
  await page.getByText(/Phản hồi bị gián đoạn; chưa xác định được kết quả/).waitFor({ timeout: 30000 });
  assert.equal(dropped, true);
  const storage = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("hx-intent-v1:")));
  assert.equal(storage.length, 1);
  assert.match(storage[0][1], /^[0-9a-f-]{36}$/i);
  await shot("g07-allocation-committed-response-lost-unknown");
  await page.unroute("**/*");
  await page.reload();
  await page.getByText(/Thao tác này đã được ghi nhận\. Không cần gửi lại/).waitFor({ timeout: 30000 });
  const [facts] = await qa.sql`select (select count(*)::int from public.payments where customer_id=${doc.customer}) payments,
    (select sum(amount_vnd)::text from public.payments where customer_id=${doc.customer}) cash,
    private.current_receivable_outstanding(${doc.obligation})::text debt,private.advance_remaining(${doc.advance})::text advance,
    (select count(*)::int from public.payment_allocations where payment_id=${doc.payment}) allocations`;
  assert.deepEqual(facts, { payments: 1, cash: "1000000", debt: "0", advance: "0", allocations: 1 });
  await shot("g07-reloaded-lookup-committed-no-second-payment");
  await page.setViewportSize({ width: 390, height: 844 });
  await shot("g07-mobile-committed-recovery");
  const unexpected = report.errors.filter(error => !error.afterIntentionalAbort || !/Failed to fetch|ERR_FAILED/.test(error.message));
  assert.deepEqual(unexpected, []);
  assert.equal(await page.locator("nextjs-portal").filter({ hasText: /Runtime Error|Unhandled/ }).count(), 0);
  report.checks.push({ name: "REAL_FINANCE_PRIOR_ADVANCE_COMMIT_ABORT_RELOAD_LOOKUP", status: "PASS", facts, onlyOpaqueIntentStored: true });
  report.expectedTransportErrors = report.errors;
  report.unexpectedConsoleErrors = 0;
  report.status = "PASS_EXECUTED_G07_BROWSER_LOST_RESPONSE";
  await writeFile(args.out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, screenshots: report.screenshots.length, facts, unexpectedConsoleErrors: 0 }));
} catch (error) {
  await shot("g07-browser-failure").catch(() => {});
  await writeFile(args.out.replace(/\.json$/, "-failure.json"), JSON.stringify({ ...report, status: "FAIL", error: error.message }, null, 2));
  throw error;
} finally { await browser.close(); await qa.sql.end({ timeout: 3 }); }
