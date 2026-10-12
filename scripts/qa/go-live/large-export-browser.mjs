import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { chromium } from "@playwright/test";
import { argumentsForRun, openQA } from "../remediation/native-fixture.mjs";
const a = argumentsForRun(), q = await openQA(a);
assert.equal(a.database, "hx_remediation_go_live_browser175");
const d = JSON.parse(await readFile(a.large, "utf8")).documents;
const base = JSON.parse(await readFile(a.documents, "utf8")).documents;
const env = parseEnv(await readFile(a["auth-env"], "utf8"));
const origin = "http://127.0.0.1:3112", browser = await chromium.launch({ headless: true }), contexts = [];
const report = { scope: "T41_REAL_BROWSER_EXPORT1001_CANONICAL_AR_SOURCES_LOST_RESPONSE_RELOAD_AND_SCOPE", productionAccess: "NONE", checks: [] };
async function login(role, surface, branch = d.branch) {
  const c = await browser.newContext({ acceptDownloads: true }); contexts.push(c);
  await c.addCookies([{ name: "hx_branch_id", value: branch, url: origin }]); const p = await c.newPage();
  await p.goto(origin + (surface === "work" ? "/work/login" : "/login"));
  await p.getByLabel("Thư điện tử").fill("hxqa-" + role + "@example.test");
  await p.getByLabel("Mật khẩu", { exact: true }).fill(env.HX_QA_PASSWORD);
  await p.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await p.waitForURL(u => u.pathname.startsWith("/" + surface) && !u.pathname.endsWith("/login")); return p;
}
try {
  const p = await login("finance-employee", "admin");
  const params = new URLSearchParams({ report: "receivables", customer: d.customer, from: "2026-10-01", to: "2026-10-12", asOf: "2026-10-12", cutoff: new Date().toISOString() });
  const direct = await p.request.get(origin + "/api/reports/export?" + params);
  assert.equal(direct.status(), 409); assert.equal((await direct.json()).error, "export_requires_job");
  report.checks.push({ name: "DIRECT_GET_OVER1000_REQUIRES_JOB_NOT_TRUNCATED_DOWNLOAD", status: "PASS", http: 409 });
  await p.goto(origin + "/admin/reports?" + params);
  const button = p.getByRole("button", { name: "Xuất CSV", exact: true }); await button.waitFor();
  let lost = false;
  await p.route("**/api/reports/export?job=*", async route => {
    if (lost || route.request().method() !== "POST") return route.continue();
    const result = await route.fetch(); assert.equal(result.status(), 202); lost = true; await route.abort("connectionfailed");
  });
  await button.click();
  for (let i = 0; i < 60; i++) {
    const [state] = await q.sql`select id,processed_rows,state from public.report_export_jobs where branch_id=${d.branch} and customer_id=${d.customer}`;
    if (state?.processed_rows === 500) { report.job = state.id; break; }
    if (i === 59) throw new Error("First batch did not persist"); await p.waitForTimeout(100);
  }
  await p.reload(); await button.waitFor();
  const download = p.waitForEvent("download", { timeout: 60000 }); await button.click();
  const file = await download; await file.saveAs(a.csv);
  const text = await readFile(a.csv, "utf8");
  const ids = [...text.matchAll(/^"([0-9a-f-]{36})",/gm)].map(x => x[1]);
  assert.equal(ids.length, 1001); assert.equal(new Set(ids).size, 1001);
  assert.deepEqual([...ids].sort(), d.rows.map(x => x.obligation).sort());
  assert.match(text, /"total_vnd","1001000"/);
  const [job] = await q.sql`select id,state,processed_rows,jsonb_array_length(rows_json) rows,attempt from public.report_export_jobs where id=${report.job}`;
  assert.equal(job.state, "COMPLETED"); assert.equal(job.processed_rows, 1001); assert.equal(job.rows, 1001); assert.equal(job.attempt, 3);
  const [count] = await q.sql`select count(*)::int n from public.report_export_jobs where branch_id=${d.branch} and customer_id=${d.customer}`;
  assert.equal(count.n, 1);
  report.checks.push({ name: "LOST_FIRST_BATCH_RESPONSE_RELOAD_SAME_JOB1001_IDS_NO_DUPLICATES_TOTAL_EXACT", status: "PASS", job, ids: ids.length, total: "1001000", jobs: 1 });
  const worker = await login("worker", "work");
  const denied = await worker.request.get(origin + "/api/reports/export?job=" + report.job + "&download=1"); assert.equal(denied.status(), 403);
  const owner = await login("owner", "admin", base.branch);
  const wrongBranch = await owner.request.get(origin + "/api/reports/export?job=" + report.job + "&download=1"); assert.equal(wrongBranch.status(), 404);
  report.checks.push({ name: "WORKER_FORBIDDEN_AND_OTHER_SELECTED_BRANCH_NO_EXPORT", status: "PASS", worker: denied.status(), otherBranch: wrongBranch.status() });
  report.status = "PASS"; report.checkedAt = new Date().toISOString(); report.csv = a.csv;
  await writeFile(a.out, JSON.stringify(report, null, 2)); console.log(JSON.stringify({ status: "PASS", checks: report.checks.length, rows: 1001 }));
} catch (error) { report.status = "FAIL"; report.error = error.message; await writeFile(a.out, JSON.stringify(report, null, 2)); throw error; }
finally { for (const c of contexts) await c.close(); await browser.close(); await q.sql.end({ timeout: 3 }); }
