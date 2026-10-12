import assert from "node:assert/strict";
import { browserQA } from "./browser-kit.mjs";
const b = await browserQA("T41_AP1001_EXPORT_SAME_JOB_AND_ROLE_BRANCH_SCOPE"), { qa, d, report: r, origin } = b;
try {
  const finance = await b.login("finance-employee"), worker = await b.login("worker", "work");
  const params = new URLSearchParams({ report: "payables", from: "2026-10-01", to: "2026-11-01", asOf: "2026-10-12", cutoff: r.checkedAt });
  const direct = await finance.request.get(origin + "/api/reports/export?" + params); assert.equal(direct.status(), 409);
  await b.record("AP_OVER1000_REQUIRES_JOB_NOT_TRUNCATED", { http: direct.status() });
  if (!r.documents.job) {
    const start = await finance.request.post(origin + "/api/reports/export?" + params); assert.equal(start.status(), 202);
    r.documents.job = (await start.json()).jobId; await b.save();
  }
  const job = r.documents.job;
  let [before] = await qa.sql`select state,processed_rows from public.report_export_jobs where id=${job}`;
  if (before.processed_rows === 0) {
    // Exercise actual browser command and lose the committed first-batch response.
    await finance.goto(origin + "/admin/reports?" + params);
    let lost = false;
    await finance.route("**/api/reports/export?job=*", async route => {
      if (lost || route.request().method() !== "POST") return route.continue();
      const response = await route.fetch(); assert.equal(response.status(), 202); lost = true; await route.abort("connectionfailed");
    });
    await finance.getByRole("button", { name: "Xuất CSV", exact: true }).click();
    await b.wait(async () => (await qa.sql`select processed_rows from public.report_export_jobs where id=${job}`)[0].processed_rows === 500);
    await b.record("AP_FIRST500_COMMITTED_RESPONSE_LOST", { job, processed: 500 });
  }
  await finance.goto(origin + "/admin/reports?" + params);
  const download = finance.waitForEvent("download", { timeout: 60000 }); await finance.getByRole("button", { name: "Xuất CSV", exact: true }).click();
  await download;
  const file = await finance.request.get(origin + `/api/reports/export?job=${job}&download=1`); assert.equal(file.status(), 200);
  const csv = await file.text(), ids = [...csv.matchAll(/^"([a-f0-9-]{36})",/gm)].map(x => x[1]);
  assert.equal(ids.length, 1001); assert.equal(new Set(ids).size, 1001); assert.deepEqual(ids.sort(), d.rows.map(x => x.obligation).sort());
  assert.match(csv, /"total_vnd","1001000"/);
  const [state] = await qa.sql`select state,processed_rows,attempt from public.report_export_jobs where id=${job}`;
  assert.deepEqual(state, { state: "COMPLETED", processed_rows: 1001, attempt: 3 });
  await b.record("AP_SAME_JOB_RELOAD1001_EXACT_IDS_TOTAL_AND_THREE_BATCHES", state);
  const denied = await worker.request.get(origin + `/api/reports/export?job=${job}&download=1`); assert.equal(denied.status(), 403);
  await finance.context().addCookies([{ name: "hx_branch_id", value: qa.fixtures.branch, url: origin }]);
  const wrongBranch = await finance.request.get(origin + `/api/reports/export?job=${job}&download=1`); assert.ok([403, 404].includes(wrongBranch.status()));
  await b.record("AP_WORKER_AND_OTHER_BRANCH_CANNOT_DOWNLOAD", { worker: denied.status(), wrongBranch: wrongBranch.status() });
  await b.finish();
} catch (error) { r.status = "FAIL"; r.error = error.message; await b.debug(); await b.save(); throw error; }
finally { await b.close(); }
