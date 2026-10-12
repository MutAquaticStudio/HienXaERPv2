import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { chromium } from "@playwright/test";
import { argumentsForRun, openQA } from "./native-fixture.mjs";
import { observeIntentionalResponseLoss } from "./browser-faults.mjs";
const args = argumentsForRun(), qa = await openQA(args);
const d = JSON.parse(await readFile(args.documents, "utf8")).documents;
const env = parseEnv(await readFile(args["auth-env"], "utf8")); assert.equal(env.HX_QA_PROJECT_REF, "ffrwiglcrlumfvhubaxg");
await mkdir(args.screenshots, { recursive: true });
const browser = await chromium.launch({ headless: true }), page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const report = { scope: "G09_REAL_OWNER_BROWSER_COMMISSION_REVIEW_RECOVERY_AND_WAIVE", browserPlugin: "ABSENT",
  fallback: "Installed Playwright; Browser plugin not available", productionAccess: "NONE", syntheticLocalEmployeesAndRules: true, realRightsOrRulesChanged: false, checks: [] };
const faults = observeIntentionalResponseLoss(page, report, "/admin/compensation");
try {
  await page.goto("http://127.0.0.1:3110/login"); await page.getByLabel("Thư điện tử").fill("hxqa-owner@example.test");
  await page.getByLabel("Mật khẩu", { exact: true }).fill(env.HX_QA_PASSWORD); await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.waitForURL(url => /\/admin|\/select-branch/.test(url.pathname));
  await page.goto("http://127.0.0.1:3110/select-branch"); await page.getByLabel("Chi nhánh đang hoạt động").selectOption(d.branch);
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click(); await page.waitForURL(/\/admin/);
  await page.goto("http://127.0.0.1:3110/admin/compensation");
  const recover = page.locator("#commission-reconciliation li").filter({ hasText: d.recover.originalEarning });
  await recover.getByLabel("Nguồn hoa hồng còn chưa trả", { exact: true }).selectOption(`${d.recover.target}:${d.recover.targetVersion}`);
  await recover.getByLabel("Quy tắc điều chỉnh theo VND", { exact: true }).selectOption(d.recover.adjustmentRule);
  await recover.getByLabel("Lý do quyết định", { exact: true }).fill("Giảm hoa hồng chưa trả theo nguồn trả hàng QA");
  let lost = false;
  await page.route("**/admin/compensation**", async route => {
    if (route.request().method() !== "POST" || lost) return route.continue();
    const response = await route.fetch();
    const [fact] = await qa.sql`select count(*)::int n from public.commission_review_resolutions where case_id=${d.recover.review}`;
    if (fact.n === 1) { lost = true; faults.markIntentionalLoss(); await route.abort("failed"); } else await route.fulfill({ response });
  });
  await recover.getByRole("button", { name: "Ghi quyết định đối chiếu hoa hồng", exact: true }).click();
  await recover.getByText(/Phản hồi bị gián đoạn/).waitFor(); assert.equal(lost, true);
  await page.screenshot({ path: args.screenshots + "/g09-review-response-lost.png", fullPage: true });
  await page.unroute("**/admin/compensation**"); await page.reload();
  await recover.getByText(/Thao tác này đã được ghi nhận/).waitFor();
  const waive = page.locator("#commission-reconciliation li").filter({ hasText: d.waive.originalEarning });
  await waive.getByLabel("Quyết định", { exact: true }).selectOption("WAIVE");
  await waive.getByLabel("Lý do quyết định", { exact: true }).fill("Owner quyết định không thu hồi khoản đã trả QA");
  await waive.getByRole("button", { name: "Ghi quyết định đối chiếu hoa hồng", exact: true }).click();
  await waive.getByText(/Không thu hồi theo phê duyệt của chủ doanh nghiệp/).waitFor();
  await page.reload(); await recover.getByText(/Đã giảm nguồn hoa hồng còn chưa trả/).waitFor();
  await faults.assertHealthy();
  const observer = await openQA(args);
  try {
    for (const [kind, doc] of [["RECOVER_UNPAID_COMMISSION", d.recover], ["WAIVE", d.waive]]) {
      const [fact] = await observer.sql`select (select count(*)::int from public.commission_review_resolutions where case_id=${doc.review}) resolutions,
        (select resolution_kind from public.commission_review_resolutions where case_id=${doc.review}) kind,
        (select md5(to_jsonb(e)::text) from public.earning_events e where id=${doc.originalEarning}) originalHash,
        (select count(*)::int from public.payments where employee_id=${doc.commissionEmployee}) payments,
        private.current_payable_outstanding(${doc.originalPayable})::text oldDebt`;
      assert.deepEqual(fact, { resolutions: 1, kind, originalhash: doc.originalHash, payments: 1, olddebt: "0" });
      if (doc.targetPayable) assert.equal((await observer.sql`select private.current_payable_outstanding(${doc.targetPayable})::text amount`)[0].amount, "8500");
      report.checks.push({ kind, status: "PASS", fact });
    }
  } finally { await observer.sql.end({ timeout: 3 }); }
  await page.screenshot({ path: args.screenshots + "/g09-review-resolved-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: args.screenshots + "/g09-review-resolved-mobile.png", fullPage: true });
  report.status = "PASS_COMMISSION_REVIEW_BROWSER_RECOVERY_AND_WAIVER";
  await writeFile(args.out, JSON.stringify(report, null, 2)); console.log(JSON.stringify({ status: report.status, checks: report.checks.length, unexpectedErrors: report.unexpectedErrors.length }));
} catch (error) {
  await page.screenshot({ path: args.screenshots + "/g09-review-failure.png", fullPage: true });
  await writeFile(args.out.replace(/\.json$/, "-failure.json"), JSON.stringify({ ...report, status: "FAIL", url: page.url(), body: (await page.locator("body").innerText()).slice(0, 14000), error: error.message }, null, 2)); throw error;
} finally { await browser.close(); await qa.sql.end({ timeout: 3 }); }
