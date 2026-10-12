import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { chromium } from "@playwright/test";
import { clients, guard, id } from "../core.mjs";
Object.assign(process.env, parseEnv(await readFile(process.argv[2], "utf8")));
assert.equal(guard().ref, "ffrwiglcrlumfvhubaxg");
const old = JSON.parse(await readFile("reports/business-flow-remediation/evidence/STORAGE_REAL_QA171.json", "utf8"));
const { login } = await clients(), worker = await login("worker");
const authorized = await worker.rpc("get_portal_evidence_for_signing", { target_evidence_id: old.sources.workEvidence });
assert.equal(authorized.error, null); const metadata = authorized.data;
const origin = "http://127.0.0.1:3110", b = await chromium.launch({ headless: true }), contexts = [];
async function browserUser(role, surface) {
  const c = await b.newContext(); contexts.push(c);
  await c.addCookies([{ name: "hx_branch_id", value: id("branch-A"), url: origin }]);
  const p = await c.newPage(); await p.goto(origin + "/" + surface + "/login");
  await p.getByLabel("Thư điện tử").fill("hxqa-" + role + "@example.test");
  await p.getByLabel("Mật khẩu", { exact: true }).fill(process.env.HX_QA_PASSWORD);
  await p.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await p.waitForURL(u => u.pathname.startsWith("/" + surface) && !u.pathname.endsWith("/login")); return p;
}
try {
  const good = await browserUser("worker", "work");
  const response = await good.request.get(origin + "/api/evidence/" + metadata.id + "/download");
  assert.equal(response.status(), 200); const bytes = await response.body();
  assert.equal(bytes.length, metadata.byte_size); assert.equal(createHash("sha256").update(bytes).digest("hex"), metadata.checksum_sha256);
  const other = await browserUser("other_customer", "customer");
  const denied = await other.request.get(origin + "/api/evidence/" + metadata.id + "/download"); assert.equal(denied.status(), 404);
  const direct = await worker.storage.from(metadata.bucket_id).download(metadata.object_path); assert.ok(direct.error);
  const report = { status: "PASS_REAL_MANAGED_STORAGE_READ_AND_WRONG_CUSTOMER_DENIAL", checkedAt: new Date().toISOString(), evidence: metadata.id, checks: [{ name: "AUTHORIZED_ACTUAL_APP_STREAM_SIZE_AND_SHA", status: "PASS", bytes: bytes.length, sha256: metadata.checksum_sha256 }, { name: "OTHER_CUSTOMER_APP_STREAM_MASKED404", status: "PASS", http: denied.status() }, { name: "DIRECT_PORTAL_SDK_DOWNLOAD_STILL_DENIED", status: "PASS" }], newWrites: 0, productionAccess: "NONE", fullUploadProof: "Unchanged upload/finalization code and pre178 actual QA evidence remain scoped separately" };
  await writeFile(process.argv[3], JSON.stringify(report, null, 2)); console.log(JSON.stringify({ status: "PASS", checks: report.checks.length, bytes: bytes.length }));
} finally { for (const c of contexts) await c.close(); await b.close(); worker.realtime.disconnect(); }
