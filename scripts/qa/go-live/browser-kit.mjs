import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { parseEnv } from "node:util";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chromium } from "@playwright/test";
import { argumentsForRun, openQA } from "../remediation/native-fixture.mjs";

export async function browserQA(scope) {
  const args = argumentsForRun(), qa = await openQA(args);
  assert.equal(args.database, "hx_remediation_go_live_browser175");
  const d = JSON.parse(await readFile(args.documents, "utf8")).documents;
  const env = parseEnv(await readFile(args["auth-env"], "utf8"));
  assert.equal(env.HX_QA_PROJECT_REF, "ffrwiglcrlumfvhubaxg");
  assert.equal(env.HX_QA_RUNTIME_APPROVED, "true");
  const origin = "http://127.0.0.1:3112", browser = await chromium.launch({ headless: true }), contexts = [];
  let report;
  try { report = JSON.parse(await readFile(args.out, "utf8")); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  const sourceFiles = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--", "src", "supabase/migrations", "package.json", "next.config.ts"], { encoding: "utf8" }).trim().split("\n").filter(Boolean).sort();
  const sourceHash = createHash("sha256");
  for (const file of sourceFiles) sourceHash.update(file + "\0").update(await readFile(file));
  const currentSource = { commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), sourceSha256: sourceHash.digest("hex"), uncommitted: Boolean(execFileSync("git", ["status", "--porcelain", "--", "src", "supabase/migrations"], { encoding: "utf8" }).trim()) };
  const [runtimeSchema] = await qa.sql`select count(*)::int count,max(version) latest from supabase_migrations.schema_migrations`;
  report ??= { scope, checkedAt: new Date().toISOString(), source: currentSource, schema: runtimeSchema,
    productionAccess: "NONE", browserPlugin: "ABSENT", fallback: "Installed Playwright1.63.0; Browser skill/plugin is not listed", checks: [], documents: {}, pageErrors: [] };
  assert.notEqual(report.status, "PASS", "Completed case must not be replayed");
  if (report.pageErrors.length) { report.priorPageErrors = [...(report.priorPageErrors ?? []), ...report.pageErrors]; report.pageErrors = []; }
  await mkdir(args.screenshots, { recursive: true });
  const save = () => writeFile(args.out, JSON.stringify(report, null, 2));
  async function record(name, facts = {}) {
    const [schema] = await qa.sql`select count(*)::int count,max(version) latest from supabase_migrations.schema_migrations`;
    report.checks.push({ name, status: "PASS", checkedAt: new Date().toISOString(), source: currentSource, schema, facts }); await save(); console.log(JSON.stringify({ name, status: "PASS" }));
  }
  async function wait(fn) { for (let i = 0; i < 100; i++) { if (await fn()) return; await new Promise(r => setTimeout(r, 150)); } throw new Error("Independent source readback did not reach expected state"); }
  async function login(role, surface = "admin") {
    const c = await browser.newContext({ viewport: { width: 1280, height: 900 } }); contexts.push(c);
    let customer = d.customer;
    if (role === "other_customer") {
      const memberships = await qa.sql`select customer_id from public.customer_portal_memberships where auth_user_id=${d.portalSubjects.otherCustomer} and active`;
      assert.equal(memberships.length, 1); customer = memberships[0].customer_id;
    }
    await c.addCookies([{ name: "hx_branch_id", value: d.branch, url: origin }, { name: "hx_customer_id", value: customer, url: origin }]);
    const p = await c.newPage(); p.on("pageerror", e => report.pageErrors.push({ role, message: e.message }));
    await p.goto(origin + (surface === "admin" ? "/login" : "/" + surface + "/login"));
    await p.getByLabel("Thư điện tử").fill("hxqa-" + role + "@example.test");
    await p.getByLabel("Mật khẩu", { exact: true }).fill(env.HX_QA_PASSWORD);
    await p.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await p.waitForURL(u => u.pathname.startsWith("/" + surface) && !u.pathname.endsWith("/login") || u.pathname === "/select-branch");
    if (new URL(p.url()).pathname === "/select-branch") {
      await p.getByLabel("Chi nhánh đang hoạt động").selectOption(d.branch);
      await p.getByRole("button", { name: "Tiếp tục", exact: true }).click();
      await p.waitForURL(u => u.pathname.startsWith("/" + surface));
    }
    return p;
  }
  async function shot(p, name) { await p.screenshot({ path: args.screenshots + "/" + name + ".png", fullPage: true }); }
  async function finish() {
    assert.deepEqual(report.pageErrors, []); report.status = "PASS"; report.completedAt = new Date().toISOString();
    delete report.error; delete report.failurePages; await save();
  }
  async function debug() {
    report.failurePages = [];
    for (const c of contexts) for (const p of c.pages()) {
      report.failurePages.push({ url: p.url(), title: await p.title(), body: (await p.locator("body").innerText()).slice(0, 5000) });
    }
  }
  async function close() {
    for (const c of contexts) {
      for (const p of c.pages()) await p.unrouteAll({ behavior: "wait" });
      await c.close();
    }
    await browser.close(); await qa.sql.end({ timeout: 3 });
  }
  return { args, qa, d, origin, report, save, record, wait, login, shot, finish, close, debug };
}
