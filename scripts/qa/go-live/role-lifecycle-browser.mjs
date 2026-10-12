import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { randomUUID } from "node:crypto";
import { chromium } from "@playwright/test";
import { argumentsForRun, openQA } from "../remediation/native-fixture.mjs";

const a = argumentsForRun(), q = await openQA(a);
assert.equal(a.database, "hx_remediation_go_live_browser175");
const d = JSON.parse(await readFile(a.documents, "utf8")).documents;
const standard = JSON.parse(await readFile(a.standard, "utf8")).documents;
const env = parseEnv(await readFile(a["auth-env"], "utf8"));
const origin = "http://127.0.0.1:3112", browser = await chromium.launch({ headless: true }), contexts = [];
const report = { scope: "REAL_BROWSER_ROLE_PAGES_AND_REVOCATION_WITH_EXISTING_SESSION", productionAccess: "NONE", checks: [], pages: [], failures: [] };
async function login(role, surface, customer = d.customer) {
  const c = await browser.newContext(); contexts.push(c);
  await c.addCookies([{ name: "hx_branch_id", value: d.branch, url: origin }, { name: "hx_customer_id", value: customer, url: origin }]);
  const p = await c.newPage(); await p.goto(origin + (surface === "work" ? "/work/login" : surface === "customer" ? "/customer/login" : "/login"));
  await p.getByLabel("Thư điện tử").fill("hxqa-" + role + "@example.test");
  await p.getByLabel("Mật khẩu", { exact: true }).fill(env.HX_QA_PASSWORD);
  await p.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await p.waitForURL(u => u.pathname.startsWith("/" + surface) && !u.pathname.endsWith("/login"));
  return p;
}
async function pageRead(p, role, url) {
  const response = await p.goto(origin + url); await p.locator("main").last().waitFor();
  await p.getByRole("heading").first().waitFor();
  const body = await p.locator("body").innerText();
  assert.ok(response.status() < 500, role + " " + url);
  assert.equal(/Application error:|Runtime Error|Không thể tải/.test(body), false, role + " " + url);
  report.pages.push({ role, url, status: "PASS_READ", http: response.status() });
}
let revoked = false, accessId;
try {
  const worker = await login("worker", "work");
  for (const path of ["/work", "/work/pool", "/work/earnings", "/work/messages", "/work/profile", "/work/tracking", "/work/jobs/" + standard.work]) await pageRead(worker, "worker", path);
  const receiver = await login("receiver", "customer");
  for (const path of ["/customer", "/customer/orders", "/customer/orders/" + standard.so, "/customer/quotations", "/customer/messages", "/customer/profile"]) await pageRead(receiver, "receiver", path);
  const finance = await login("finance", "customer");
  for (const path of ["/customer", "/customer/orders/" + standard.so, "/customer/debts", "/customer/profile"]) await pageRead(finance, "customer-finance", path);
  const owner = await login("owner", "admin");
  const [grant] = await q.sql`select id,active from public.employee_branch_access where employee_id=${d.personas.worker.employee} and branch_id=${d.branch}`;
  assert.equal(grant.active, true); accessId = grant.id;
  await owner.goto(origin + "/admin/access");
  const revoke = owner.locator("form").filter({ has: owner.locator(`input[name=accessId][value="${accessId}"]`) });
  await revoke.locator("input[name=reason]").waitFor({ state: "attached" });
  await revoke.locator("xpath=..").locator("summary").click();
  await revoke.locator("input[name=reason]").fill("QA thu hồi quyền với phiên đang mở");
  await revoke.locator("input[name=confirmed]").check();
  await revoke.getByRole("button", { name: "Thu hồi quyền", exact: true }).click();
  revoked = true;
  for (let i = 0; i < 40; i++) {
    const [state] = await q.sql`select active from public.employee_branch_access where id=${accessId}`;
    if (!state.active) break;
    if (i === 39) throw new Error("UI revoke did not persist");
    await owner.waitForTimeout(100);
  }
  const denied = await worker.request.post(origin + "/api/portal/work-items/start", { data: { workItemId: standard.work, version: 1, operationId: randomUUID() } });
  assert.ok([403, 409].includes(denied.status()), "Existing authenticated session must lose branch rights");
  await worker.goto(origin + "/work/jobs/" + standard.work);
  await worker.waitForURL(u => u.pathname === "/work" && u.searchParams.get("notice") === "work-unavailable");
  report.checks.push({ name: "OWNER_UI_REVOKE_STALE_WORKER_SESSION_CANNOT_READ_OR_START", status: "PASS", deniedStatus: denied.status() });
  await owner.reload();
  const restore = owner.locator("form").filter({ has: owner.locator(`input[name=accessId][value="${accessId}"]`) });
  await restore.locator("input[name=reason]").waitFor({ state: "attached" });
  await restore.locator("xpath=..").locator("summary").click();
  await restore.locator("input[name=reason]").fill("QA khôi phục đúng vai trò sau kiểm chứng");
  await restore.locator("input[name=confirmed]").check();
  await restore.getByRole("button", { name: "Kích hoạt lại", exact: true }).click();
  for (let i = 0; i < 40; i++) {
    const [state] = await q.sql`select active from public.employee_branch_access where id=${accessId}`;
    if (state.active) break;
    if (i === 39) throw new Error("UI reactivate did not persist");
    await owner.waitForTimeout(100);
  }
  revoked = false;
  await pageRead(worker, "worker-restored", "/work/jobs/" + standard.work);
  report.checks.push({ name: "OWNER_UI_REACTIVATE_SAME_ACCESS_SOURCE_AND_READ_AGAIN", status: "PASS" });
  report.status = "PASS_ROLE_PAGE_READ_AND_BRANCH_ACCESS_LIFECYCLE";
  report.checkedAt = new Date().toISOString(); await writeFile(a.out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, pages: report.pages.length, checks: report.checks.length }));
} catch (error) { report.status = "FAIL"; report.error = error.message; await writeFile(a.out, JSON.stringify(report, null, 2)); throw error; }
finally {
  if (revoked) await q.sql.begin(tx => q.rpc(tx, "reactivate_employee_access", [accessId, "QA phục hồi quyền sau lỗi bộ chạy", randomUUID()], d.fixtures.owner));
  for (const c of contexts) await c.close(); await browser.close(); await q.sql.end({ timeout: 3 });
}
