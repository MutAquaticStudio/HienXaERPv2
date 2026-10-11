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
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
let intentionalAbort = false;
const report = { scope: "G08_REAL_FINANCE_BROWSER_APPROVAL_REFUND_RECOVERY_OFFSET", database: args.database,
  origin: "http://127.0.0.1:3110", browserPlugin: "ABSENT", fallbackReason: "Browser plugin and browser skill not available; installed Playwright used",
  productionAccess: "NONE", errors: [], screenshots: [], checks: [] };
page.on("pageerror", error => report.errors.push({ message: error.message, afterIntentionalAbort: intentionalAbort }));
page.on("console", message => { if (message.type() === "error") report.errors.push({ message: message.text(), afterIntentionalAbort: intentionalAbort }); });
async function shot(name) {
  const filename = path.join(args.screenshots, name + ".png");
  await page.screenshot({ path: filename, fullPage: true, caret: "initial" }); report.screenshots.push(filename);
}
async function approve(doc) {
  await page.goto(report.origin + "/admin/receivables?customer=" + doc.stock.customer);
  await page.getByRole("heading", { name: "Hàng trả và khoản có của khách" }).waitFor();
  await page.getByLabel("Lý do duyệt giảm", { exact: true }).fill("Giảm một đơn vị trả theo snapshot230k");
  await page.getByRole("button", { name: "Duyệt giảm theo hàng trả", exact: true }).click();
  await page.getByRole("heading", { name: "Ghi hoàn tiền đã thực hiện", exact: true }).waitFor({ timeout: 30000 });
  const [credit] = await qa.sql`select id from public.customer_credits where return_case_id=${doc.returnCase}`;
  assert.ok(credit?.id); return credit.id;
}
try {
  await page.goto(report.origin + "/login");
  await page.getByLabel("Thư điện tử").fill("hxqa-finance-employee@example.test");
  await page.getByLabel("Mật khẩu", { exact: true }).fill(env.HX_QA_PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.waitForURL(url => /\/admin|\/select-branch/.test(url.pathname), { timeout: 30000 });
  if (page.url().includes("/select-branch")) {
    await page.getByLabel("Chi nhánh đang hoạt động").selectOption(docs.branch);
    await page.getByRole("button", { name: "Tiếp tục", exact: true }).click(); await page.waitForURL(/\/admin/);
  }
  const creditId = await approve(docs.refund);
  await shot("g08-approved-return-holds-source-credit");
  await page.getByLabel("Số tiền hoàn từ khoản có (VND)", { exact: true }).fill("230000");
  await page.getByLabel("Tài khoản chi hoàn", { exact: true }).selectOption(docs.refund.account);
  await page.getByLabel("Phương thức hoàn", { exact: true }).selectOption("CASH");
  await page.getByLabel("Tham chiếu hoàn tiền", { exact: true }).fill("Hoàn một phần hàng đã trả trên QA");
  let committedAbort = false;
  await page.route("**/admin/receivables**", async route => {
    if (committedAbort || route.request().method() !== "POST" || !route.request().headers()["next-action"]) return route.continue();
    const response = await route.fetch();
    const [{ n }] = await qa.sql`select count(*)::int n from public.payments where customer_credit_refund_id=${creditId}`;
    if (n === 1) { committedAbort = true; intentionalAbort = true; await route.abort("failed"); }
    else await route.fulfill({ response });
  });
  await page.getByRole("button", { name: "Ghi phiếu hoàn khoản có", exact: true }).click();
  await page.getByText(/Phản hồi bị gián đoạn; chưa xác định được kết quả/).waitFor({ timeout: 30000 });
  assert.equal(committedAbort, true);
  const entries = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("hx-intent-v1:") && key.endsWith(":refund_customer_credit")));
  assert.equal(entries.length, 1); assert.match(entries[0][1], /^[0-9a-f-]{36}$/i);
  await shot("g08-refund-response-lost-unknown-after-commit");
  await page.unroute("**/admin/receivables**");
  await page.reload();
  await page.getByText(/Thao tác này đã được ghi nhận. Không cần gửi lại/).waitFor({ timeout: 30000 });
  assert.equal(await page.getByRole("button", { name: "Ghi phiếu hoàn khoản có", exact: true }).count(), 0);
  const [refunded] = await qa.sql`select private.current_receivable_outstanding(${docs.refund.obligation})::text debt,
    private.customer_credit_remaining(${creditId})::text credit,private.payment_available(${docs.refund.payment})::text receiptAvailable,
    (select sum(case when direction='RECEIPT' then amount_vnd else -amount_vnd end)::text from public.payments where customer_id=${docs.refund.stock.customer}) cash,
    (select count(*)::int from public.payments where customer_id=${docs.refund.stock.customer}) payments`;
  assert.deepEqual(refunded, { debt: "0", credit: "0", receiptavailable: "0", cash: "2990000", payments: 2 });
  await shot("g08-reloaded-refund-committed-once");
  await page.setViewportSize({ width: 390, height: 844 }); await shot("g08-mobile-refund-recovery");
  report.checks.push({ name: "REAL_UI_APPROVAL_REFUND_AFTER_COMMIT_ABORT_RELOAD_ONE_CASH_EFFECT", status: "PASS", refunded, onlyOpaqueIntentStored: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  const offsetCredit = await approve(docs.offset);
  await page.getByLabel("Khoản nợ để cấn trừ", { exact: true }).selectOption(docs.offset.nextObligation);
  await page.getByLabel("Số tiền cấn trừ (VND)", { exact: true }).fill("230000");
  await page.getByRole("button", { name: "Ghi cấn trừ khoản có", exact: true }).click();
  await page.getByRole("heading", { name: "Ghi hoàn tiền đã thực hiện", exact: true }).waitFor({ state: "detached", timeout: 30000 });
  await page.reload();
  await page.getByRole("heading", { name: "Hàng trả và khoản có của khách" }).waitFor();
  const [offset] = await qa.sql`select private.customer_credit_remaining(${offsetCredit})::text credit,
    private.current_receivable_outstanding(${docs.offset.nextObligation})::text nextDebt,
    (select count(*)::int from public.payments where customer_id=${docs.offset.stock.customer}) payments,
    (select sum(case when direction='RECEIPT' then amount_vnd else -amount_vnd end)::text from public.payments where customer_id=${docs.offset.stock.customer}) cash`;
  assert.deepEqual(offset, { credit: "0", nextdebt: "0", payments: 1, cash: "3220000" });
  await shot("g08-offset-committed-reloaded-no-new-cash");
  report.checks.push({ name: "REAL_UI_CREDIT_OFFSET_VALID_CUSTOMER_DEBT_NO_NEW_MONEY", status: "PASS", offset });
  const expected = report.errors.filter(item => item.afterIntentionalAbort && /net::ERR_FAILED|Failed to fetch|Failed to load resource/.test(item.message));
  const unexpected = report.errors.filter(item => !expected.includes(item));
  assert.equal(unexpected.length, 0, JSON.stringify(unexpected));
  report.expectedTransportErrors = expected; report.unexpectedConsoleErrors = 0;
  report.status = "PASS_REAL_BROWSER_CUSTOMER_CREDIT";
  await writeFile(args.out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, screenshots: report.screenshots.length, unexpectedConsoleErrors: 0 }));
} catch (error) {
  await shot("g08-credit-browser-failure").catch(() => {});
  await writeFile(args.out.replace(/\.json$/, "-failure.json"), JSON.stringify({ ...report, status: "FAIL", error: error.message }, null, 2));
  throw error;
} finally { await browser.close(); await qa.sql.end({ timeout: 3 }); }
