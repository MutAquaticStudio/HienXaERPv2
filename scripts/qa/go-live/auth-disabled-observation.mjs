import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { randomUUID, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { database, guard, capacity } from "../core.mjs";
Object.assign(process.env, parseEnv(await readFile(process.argv[2], "utf8")));
assert.equal(guard().ref, "ffrwiglcrlumfvhubaxg");
const sql = await database(); await capacity(sql);
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, options);
const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, options);
const marker = randomUUID().replaceAll("-", "").slice(0, 12), branch = randomUUID(), employee = randomUUID(), role = randomUUID();
let subject, configured = false;
const report = { scope: "QA_ONLY_NEW_ACCOUNT_REAL_AUTH_BAN_EXISTING_JWT_OBSERVATION", productionAccess: "NONE", messagesSent: 0, businessWrites: 0, checks: [] };
try {
  const password = randomBytes(24).toString("base64url"), email = "hxqa-disabled-" + marker + "@example.test";
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { qa_lifecycle: marker } });
  assert.equal(created.error, null); subject = created.data.user.id;
  await sql.begin(async tx => {
    await tx`insert into public.branches(id,code,name) values(${branch},${"GLAUTH" + marker.toUpperCase()},'QA vòng đời Auth riêng')`;
    await tx`insert into public.roles(id,code,name) values(${role},${"qa_auth_" + marker},'QA thợ kiểm vòng đời Auth')`;
    await tx`insert into public.role_permissions(role_id,permission_code) values(${role},'work.read'),(${role},'work.claim')`;
    await tx`insert into public.employees(id,auth_user_id,code,display_name) values(${employee},${subject},${"GLAUTH" + marker.toUpperCase()},'QA tài khoản thử khóa')`;
    await tx`insert into public.employee_branch_access(employee_id,branch_id,role_id,active) values(${employee},${branch},${role},true)`;
  }); configured = true;
  const login = await client.auth.signInWithPassword({ email, password }); assert.equal(login.error, null);
  const token = login.data.session.access_token;
  const before = await client.rpc("worker_portal_snapshot"); assert.equal(before.error, null); assert.equal(before.data.employee.id, employee);
  report.checks.push({ name: "DEDICATED_REAL_AUTH_ACTIVE_EMPLOYEE_CAN_READ_OWN_WORK_SNAPSHOT", status: "PASS" });
  const ban = await admin.auth.admin.updateUserById(subject, { ban_duration: "24h" }); assert.equal(ban.error, null);
  const freshUser = await client.auth.getUser(token);
  const after = await client.rpc("worker_portal_snapshot");
  report.checks.push({ name: "AUTH_BAN_WITH_PREEXISTING_JWT", authGetUserDenied: !!freshUser.error, authErrorStatus: freshUser.error?.status ?? null, directRpcDenied: !!after.error, rpcErrorCode: after.error?.code ?? null });
  report.status = after.error ? "BAN_DENIAL_OBSERVED_REVIEW_SCOPE" : "ACTIVE_RPC_AFTER_AUTH_BAN_REQUIRES_REVIEW";
  if (process.argv[4] === "--expect-denied") {
    const headers = { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, authorization: "Bearer " + token, "content-type": "application/json" };
    const raw = await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL + "/rest/v1/rpc/worker_portal_snapshot", { method: "POST", headers, body: "{}" });
    const rawBody = await raw.json(); assert.equal(raw.status, 403); assert.equal(rawBody.code, "42501"); assert.equal(rawBody.message, "account_inactive");
    const read = await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL + "/rest/v1/employees?select=id,active&id=eq." + employee, { headers });
    assert.equal(read.status, 403); assert.equal((await read.json()).message, "account_inactive");
    report.checks.push({ name: "ORIGINAL_BEARER_TOKEN_RPC_AND_TABLE_READ_DENIED_BY_PRE_REQUEST", status: "PASS", rpc: raw.status, table: read.status });
    const unban = await admin.auth.admin.updateUserById(subject, { ban_duration: "none" }); assert.equal(unban.error, null);
    const restored = await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL + "/rest/v1/rpc/worker_portal_snapshot", { method: "POST", headers, body: "{}" });
    assert.equal(restored.status, 200); assert.equal((await restored.json()).employee.id, employee);
    report.checks.push({ name: "UNBAN_KEEPS_SAME_EMPLOYEE_SCOPE_AND_OLD_TOKEN_READ_VALID", status: "PASS", http: 200 });
    // Re-ban for the independent new-login denial check below.
    const reban = await admin.auth.admin.updateUserById(subject, { ban_duration: "24h" }); assert.equal(reban.error, null);
    report.status = "PASS_REAL_AUTH_DISABLED_EXISTING_TOKEN_AND_RESTORE";
  }
  const deniedLogin = await createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, options).auth.signInWithPassword({ email, password });
  assert.ok(deniedLogin.error); report.newLoginBlocked = true;
} finally {
  if (configured) {
    await sql.begin(async tx => {
      const [facts] = await tx`select (select count(*)::int from public.work_item_assignments where employee_id=${employee}) work,(select count(*)::int from public.payments where branch_id=${branch}) cash,(select count(*)::int from public.inventory_movements where branch_id=${branch}) stock`;
      assert.deepEqual(facts, { work: 0, cash: 0, stock: 0 });
      await tx`delete from public.employee_branch_access where employee_id=${employee} and branch_id=${branch} and role_id=${role}`;
      await tx`delete from public.employees where id=${employee} and auth_user_id=${subject}`;
      await tx`delete from public.role_permissions where role_id=${role}`;
      await tx`delete from public.roles where id=${role} and code=${"qa_auth_" + marker}`;
      await tx`delete from private.branch_operational_states where branch_id=${branch} and activation_operation_id is null`;
      await tx`delete from public.branches where id=${branch} and code=${"GLAUTH" + marker.toUpperCase()}`;
    });
  }
  if (subject) { const deleted = await admin.auth.admin.deleteUser(subject); assert.equal(deleted.error, null); }
  report.temporaryAccountAndConfigurationCleaned = true;
  report.checkedAt = new Date().toISOString(); await writeFile(process.argv[3], JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, observations: report.checks, cleaned: true }));
  await sql.end({ timeout: 3 });
}
