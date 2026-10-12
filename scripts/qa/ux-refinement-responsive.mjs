import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { execFileSync } from "node:child_process";
import { chromium } from "@playwright/test";
import { argumentsForRun } from "./remediation/native-fixture.mjs";
const a = argumentsForRun(), e = parseEnv(await readFile(a["auth-env"], "utf8"));
assert.equal(e.HX_QA_PROJECT_REF, "ffrwiglcrlumfvhubaxg"); assert.equal(e.HX_QA_RUNTIME_APPROVED, "true");
const f = JSON.parse(await readFile("reports/ux-ui-refinement/FIXTURES.json", "utf8")).source;
const o = "http://127.0.0.1:3116", browser = await chromium.launch({ headless: true }), context = await browser.newContext(), p = await context.newPage();
const r = { checkedAt: new Date().toISOString(), codeBase: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), sourceDiff: execFileSync("git", ["status", "--porcelain", "--", "src"], { encoding: "utf8" }).trim(), productionAccess: "NONE", writes: 0, rows: [] };
try {
  await context.addCookies([{ name: "hx_branch_id", value: f.branch, url: o }]); await p.goto(o + "/login");
  await p.getByLabel("Thư điện tử").fill("hxqa-owner@example.test"); await p.getByLabel("Mật khẩu", { exact: true }).fill(e.HX_QA_PASSWORD); await p.getByRole("button", { name: "Đăng nhập", exact: true }).click(); await p.waitForURL(u => u.pathname === "/admin");
  await p.locator('[data-uat-dashboard-filters="ready"]').waitFor(); await p.locator('[data-uat-dashboard-content="ready"]').waitFor();
  const values = await p.locator(".metric-value").allTextContents();
  for (const width of [320, 760, 1024, 1100, 1180, 1280, 1440]) {
    await p.setViewportSize({ width, height: 900 });
    const row = await p.evaluate(() => ({ width: innerWidth, documentOverflow: document.documentElement.scrollWidth > innerWidth, clipped: [...document.querySelectorAll(".metric-value")].filter(el => el.scrollWidth > el.clientWidth + 1).map(el => ({ value: el.textContent, client: el.clientWidth, scroll: el.scrollWidth })) }));
    assert.equal(row.documentOverflow, false); assert.deepEqual(row.clipped, []); assert.deepEqual(await p.locator(".metric-value").allTextContents(), values); r.rows.push(row);
    if (width === 1024) { await p.locator(".finance-metrics").scrollIntoViewIfNeeded(); await p.screenshot({ path: "reports/ux-ui-refinement/regression/manager1024-metric-groups.png", fullPage: false }); }
  }
  r.valuesUnchangedAcrossViewports = true; r.status = "PASS"; await writeFile(a.out, JSON.stringify(r, null, 2) + "\n"); console.log(JSON.stringify({ status: "PASS", widths: r.rows.map(x => x.width), clipped: 0 }));
} catch (error) { r.status = "FAIL"; r.error = error.message.split("\n")[0]; await writeFile(a.out, JSON.stringify(r, null, 2) + "\n"); throw new Error(r.error); }
finally { await context.close(); await browser.close(); }
