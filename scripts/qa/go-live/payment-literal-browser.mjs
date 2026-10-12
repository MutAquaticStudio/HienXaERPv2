import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { parseEnv } from "node:util";
import { chromium } from "@playwright/test";
import { argumentsForRun, openQA } from "../remediation/native-fixture.mjs";
const a = argumentsForRun(), q = await openQA(a);
assert.equal(a.database, "hx_remediation_go_live_browser175");
const d = JSON.parse(await readFile(a.documents, "utf8")).documents;
const env = parseEnv(await readFile(a["auth-env"], "utf8"));
const origin = "http://127.0.0.1:3112", browser = await chromium.launch({ headless: true }), c = await browser.newContext(), p = await c.newPage();
let report;
try { report = JSON.parse(await readFile(a.out, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
report ??= { scope: "T30_LITERAL_PREPAY10M_SERVICE_AR30M_TWO_NEW_RECEIPTS10M", productionAccess: "NONE", excludedAdvanceRacesRun: false, checks: [], documents: {} };
assert.notEqual(report.status, "PASS", "Completed test must not be replayed");
const save = () => writeFile(a.out, JSON.stringify(report, null, 2));
async function count() { return (await q.sql`select count(*)::int n from public.payments where customer_id=${report.documents.customer}`)[0].n; }
async function wait(check) { for (let i = 0; i < 50; i++) { if (await check()) return; await p.waitForTimeout(150); } throw new Error("Expected payment source did not persist"); }
async function cashForm() {
  const form = p.locator("form").filter({ has: p.getByRole("button", { name: "Ghi nhận thu tiền", exact: true }) });
  await form.locator("input[name=amount]").waitFor({ state: "attached" });
  const fresh = form.getByRole("button", { name: "Bắt đầu thao tác mới", exact: true });
  if (await fresh.count()) await fresh.click();
  await form.locator("input[name=amount]").waitFor(); return form;
}
try {
  if (!report.documents.customer) {
    const customer = randomUUID(), site = randomUUID(), code = "GLPAY" + randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
    await q.sql.begin(async tx => {
      await tx`insert into public.customers(id,branch_id,code,display_name,sales_owner_employee_id,payment_terms_days,credit_limit_vnd,tier_code)
        select ${customer},branch_id,${code},'QA thu nhiều lần và ứng trước',sales_owner_employee_id,payment_terms_days,credit_limit_vnd,tier_code from public.customers where id=${d.customer}`;
      await tx`insert into public.customer_sites(id,customer_id,code,name,address_text) values(${site},${customer},${code},'Công trình QA phiếu tiền','QA cô lập')`;
    }); report.documents = { customer, site }; await save();
  }
  await c.addCookies([{ name: "hx_branch_id", value: d.branch, url: origin }]);
  await p.goto(origin + "/login"); await p.getByLabel("Thư điện tử").fill("hxqa-finance-employee@example.test");
  await p.getByLabel("Mật khẩu", { exact: true }).fill(env.HX_QA_PASSWORD);
  await p.getByRole("button", { name: "Đăng nhập", exact: true }).click(); await p.waitForURL(u => u.pathname.startsWith("/admin"));
  const url = origin + "/admin/receivables?customer=" + report.documents.customer;
  await p.goto(url);
  if (await count() === 0) {
    const form = await cashForm(); await form.locator("input[name=amount]").fill("10000000");
    await form.locator("select[name=accountId]").selectOption(d.account); await form.locator("input[name=advanceAmount]").fill("10000000");
    await form.getByRole("button", { name: "Ghi nhận thu tiền", exact: true }).click(); await wait(async () => await count() === 1);
    report.checks.push({ name: "FINANCE_UI_PREPAY10M_BEFORE_AR", status: "PASS", cashReceipts: 1 }); await save();
  }
  if (!report.documents.obligation) {
    const docs = await q.sql.begin(async tx => {
      const job = await q.rpc(tx, "create_service_job", [d.branch, report.documents.customer, report.documents.site, "QA dịch vụ nguồn30m", "Nguồn hợp lệ cho ca thu nhiều lần", "2200-01-05T00:00:00Z", "2200-01-05T01:00:00Z", "1", "ca", d.personas.worker.employee, null, null, randomUUID()], d.fixtures.owner);
      const work = await q.rpc(tx, "publish_work_item", [d.branch, "SERVICE_JOB", job, "DIRECT", d.personas.worker.employee, randomUUID()], d.fixtures.owner);
      const [v] = await tx`select version from public.work_items where id=${work}`;
      await q.rpc(tx, "start_work_item", [work, v.version, randomUUID()], d.personas.worker.subject);
      const [started] = await tx`select version from public.work_items where id=${work}`;
      await q.rpc(tx, "submit_portal_work_result", [work, "1", "QA hoàn thành nguồn dịch vụ", "QA người nhận", null, started.version, randomUUID()], d.personas.worker.subject);
      await q.actor(tx, d.fixtures.owner);
      const [versions] = await tx`select j.version job,w.version work from public.service_jobs j join public.work_items w on w.service_job_id=j.id where j.id=${job}`;
      const verification = await q.rpc(tx, "verify_service_job", [job, "1", "1", "30000000", "2026-10-19", "QA xác minh nguồn30m, không tự thu tiền", versions.job, versions.work, randomUUID()], d.fixtures.owner);
      const [ar] = await tx`select id from public.receivable_obligations where service_verification_id=${verification}`;
      return { job, work, verification, obligation: ar.id };
    }); Object.assign(report.documents, docs); await save();
  }
  const ar = report.documents.obligation;
  let [state] = await q.sql`select private.current_receivable_outstanding(${ar})::text debt`;
  if (state.debt === "30000000") {
    await p.goto(url);
    const allocation = p.locator("form").filter({ has: p.getByRole("button", { name: "Phân bổ tiền đã có", exact: true }) });
    await allocation.getByLabel(/^Phân bổ tiền đã có cho /).fill("10000000");
    await allocation.getByRole("button", { name: "Phân bổ tiền đã có", exact: true }).click();
    await wait(async () => (await q.sql`select private.current_receivable_outstanding(${ar})::text debt`)[0].debt === "20000000");
    assert.equal(await count(), 1);
    report.checks.push({ name: "ALLOCATE_EXISTING10M_AR30M_WITHOUT_SECOND_CASH", status: "PASS", debt: "20000000", cashReceipts: 1 }); await save();
  }
  for (const [targetCount, expectedDebt] of [[2, "10000000"], [3, "0"]]) {
    if (await count() >= targetCount) continue;
    await p.goto(url); const form = await cashForm();
    await form.locator("input[name=amount]").fill("10000000"); await form.locator("select[name=accountId]").selectOption(d.account);
    await form.locator("input[name=advanceAmount]").fill("0"); await form.getByLabel(/^Phân bổ cho /).fill("10000000");
    await form.getByRole("button", { name: "Ghi nhận thu tiền", exact: true }).click();
    await wait(async () => await count() === targetCount);
    [state] = await q.sql`select private.current_receivable_outstanding(${ar})::text debt`;
    assert.equal(state.debt, expectedDebt); report.checks.push({ name: "NEW_RECEIPT10M_NUMBER" + targetCount, status: "PASS", debt: state.debt, cashReceipts: targetCount }); await save();
  }
  await p.reload();
  const [facts] = await q.sql`select
    (select sum(amount_vnd)::text from public.payments where customer_id=${report.documents.customer}) cash,
    (select sum(amount_delta_vnd)::text from public.payment_allocations where receivable_obligation_id=${ar}) allocated,
    private.current_receivable_outstanding(${ar})::text debt,
    (select count(*)::int from public.payments where customer_id=${report.documents.customer}) cash_receipts`;
  assert.deepEqual(facts, { cash: "30000000", allocated: "30000000", debt: "0", cash_receipts: 3 });
  report.facts = facts; report.status = "PASS"; report.checkedAt = new Date().toISOString(); await save();
  await p.screenshot({ path: a.screenshots + "/payment-prepay10m-ar30m-two10m.png", fullPage: true });
  console.log(JSON.stringify({ status: "PASS", checks: report.checks.length, facts }));
} catch (error) { report.lastFailure = error.message; await save(); throw error; }
finally { await c.close(); await browser.close(); await q.sql.end({ timeout: 3 }); }
