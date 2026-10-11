import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { chromium } from "@playwright/test";
import { argumentsForRun, openQA } from "./native-fixture.mjs";
import { observeIntentionalResponseLoss } from "./browser-faults.mjs";
import { realQAAuth } from "./auth.mjs";
const args = argumentsForRun(), qa = await openQA(args);
const d = JSON.parse(await readFile(args.documents, "utf8")).documents;
const env = parseEnv(await readFile(args["auth-env"], "utf8")); assert.equal(env.HX_QA_PROJECT_REF, "ffrwiglcrlumfvhubaxg");
await mkdir(args.screenshots, { recursive: true });
const browser = await chromium.launch({ headless: true }), page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const report = { scope: "G08_REAL_FINANCE_BROWSER_RECONCILE_EXISTING_LEGACY_SOURCE_LOST_RESPONSE_RELOAD", browserPlugin: "ABSENT",
  fallback: "Installed Playwright; Browser plugin not available", productionAccess: "NONE", checks: [] };
const faults = observeIntentionalResponseLoss(page, report, "/admin/receivables");
let observer;
try {
  const [before] = await qa.sql`select md5(to_jsonb(a)::text) hash from public.receivable_adjustments a where id=${d.adjustment}`;
  await page.goto("http://127.0.0.1:3110/login"); await page.getByLabel("Thư điện tử").fill("hxqa-finance-employee@example.test");
  await page.getByLabel("Mật khẩu", { exact: true }).fill(env.HX_QA_PASSWORD); await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.waitForURL(url => /\/admin|\/select-branch/.test(url.pathname));
  await page.goto("http://127.0.0.1:3110/select-branch"); await page.getByLabel("Chi nhánh đang hoạt động").selectOption(d.branch);
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click(); await page.waitForURL(/\/admin/);
  await page.goto("http://127.0.0.1:3110/admin/receivables?customer=" + d.customer);
  const amount = page.getByLabel("Giá trị điều chỉnh đã ghi (VND)", { exact: true });
  assert.equal(await amount.inputValue(), "230000"); assert.equal(await amount.getAttribute("readonly"), "");
  await page.getByLabel("Lý do đối chiếu nguồn tiền", { exact: true }).fill("Đối chiếu nguồn tiền theo điều chỉnh đã ghi");
  let lost = false;
  await page.route("**/admin/receivables**", async route => {
    if (route.request().method() !== "POST" || lost) return route.continue();
    const response = await route.fetch();
    const [count] = await qa.sql`select count(*)::int n from public.customer_credits where return_case_id=${d.returnCase}`;
    if (count.n === 1) { lost = true; faults.markIntentionalLoss(); await route.abort("failed"); } else await route.fulfill({ response });
  });
  await page.getByRole("button", { name: "Đối chiếu nguồn điều chỉnh đã ghi", exact: true }).click();
  await page.getByText(/Phản hồi bị gián đoạn/).waitFor(); assert.equal(lost, true);
  await page.screenshot({ path: args.screenshots + "/g08-legacy-response-lost.png", fullPage: true });
  await page.unroute("**/admin/receivables**"); await page.reload(); await page.getByText(/Thao tác này đã được ghi nhận/).waitFor();
  await faults.assertHealthy();
  observer = await openQA(args);
  const [credit] = await observer.sql`select id from public.customer_credits where return_case_id=${d.returnCase}`;
  const [facts] = await observer.sql`select private.current_receivable_outstanding(${d.obligation})::text debt,
    private.customer_credit_remaining(${credit.id})::text credit,private.payment_available(${d.payment})::text available,
    (select count(*)::int from public.payments where customer_id=${d.customer}) payments,
    (select count(*)::int from public.receivable_adjustments where return_case_id=${d.returnCase}) adjustments,
    (select sum(amount_delta_vnd)::text from public.payment_allocations where payment_id=${d.payment}) retained,
    (select md5(to_jsonb(a)::text) from public.receivable_adjustments a where id=${d.adjustment}) originalHash`;
  assert.deepEqual(facts, { debt: "0", credit: "230000", available: "0", payments: 1, adjustments: 1, retained: "2990000", originalhash: before.hash });
  report.checks.push({ name: "EXISTING_DECISION_UNCHANGED_ONE_FUNDED_CREDIT_AFTER_LOST_RESPONSE_RELOAD", status: "PASS", facts });
  const auth = await realQAAuth(args["auth-env"], { finance: "hxqa-finance-employee@example.test" });
  const upper = new Date(Date.now() + 86400000).toISOString();
  const net = await auth.api("finance", "rpc/finance_dashboard_snapshot", { target_branch_id: d.branch, from_inclusive: "2000-01-01T00:00:00Z", to_exclusive: upper, knowledge_cutoff: upper, target_customer_id: d.customer, target_activity_kind: "DELIVERY" });
  assert.equal(net.status, 200); assert.equal(net.data.revenue.value_vnd, "2990000"); assert.equal(net.data.direct_cost.value_vnd, "1950000"); assert.equal(net.data.gross_profit.value_vnd, "1040000");
  report.checks.push({ name: "NO_SECOND_REVENUE_ADJUSTMENT_EXISTING_GROSS1040K_RETAINED", status: "PASS", snapshot: net.data });
  await page.screenshot({ path: args.screenshots + "/g08-legacy-reconciled-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: args.screenshots + "/g08-legacy-reconciled-mobile.png", fullPage: true });
  report.status = "PASS_LEGACY_RECONCILIATION_BROWSER_RECOVERY_AND_NET_REPORT";
  await writeFile(args.out, JSON.stringify(report, null, 2)); console.log(JSON.stringify({ status: report.status, checks: report.checks.length, unexpectedErrors: report.unexpectedErrors.length }));
} catch (error) {
  await page.screenshot({ path: args.screenshots + "/g08-legacy-failure.png", fullPage: true });
  await writeFile(args.out.replace(/\.json$/, "-failure.json"), JSON.stringify({ ...report, status: "FAIL", url: page.url(), body: (await page.locator("body").innerText()).slice(0, 9000), error: error.message }, null, 2)); throw error;
} finally { if (observer) await observer.sql.end({ timeout: 3 }); await browser.close(); await qa.sql.end({ timeout: 3 }); }
