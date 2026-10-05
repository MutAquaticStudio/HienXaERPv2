import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/, "");
const out = process.env.HX_MB_EVIDENCE_DIR;
assert.ok(out, "HX_MB_EVIDENCE_DIR_required");
const cfg = JSON.parse(await fs.readFile("/private/tmp/hx-native-goal.Qfwbz9/native-private-credentials.json", "utf8"));
const postgres = createRequire(root + "/package.json")("postgres");
const relative = "supabase/migrations/20261005043000_purchase_cost_column_boundary.sql";
const raw = await fs.readFile(root + "/" + relative, "utf8");
assert.match(raw, /^begin;/);
assert.match(raw, /commit;\s*$/);
const body = raw.replace(/^begin;\s*/, "").replace(/commit;\s*$/, "");
const report = {
  scope: "MB_COST_01_NATIVE_AUTHENTICATED_COLUMN_BOUNDARY",
  candidate: process.env.HX_MB_CANDIDATE,
  patch: { path: relative, sha256: createHash("sha256").update(raw).digest("hex") },
  environment: "OWNED_LOCAL_POSTGRESQL_17_11",
  managedChanges: "NONE",
  databases: [],
};
const rollback = new Error("EXPECTED_ISOLATED_REHEARSAL_ROLLBACK");
try {
  for (const mode of ["CLEAN", "DIVERGED"]) {
    const sql = postgres({ host: cfg.host, port: cfg.port, username: cfg.username,
      password: cfg.password, database: cfg.databases[mode], ssl: false,
      max: 1, prepare: false, connect_timeout: 5 });
    const result = { mode, checks: [], transaction: "ROLLED_BACK_AFTER_REHEARSAL" };
    report.databases.push(result);
    try {
      const [identity] = await sql.unsafe("select current_database() database, current_setting('data_directory') directory, inet_server_port() port");
      assert.equal(identity.directory, "/private/tmp/hx-native-goal.Qfwbz9/cluster-data");
      assert.equal(identity.port, 54757);
      assert.equal(identity.database, cfg.databases[mode]);
      result.identity = identity;
      try {
        await sql.begin(async tx => {
          await tx.unsafe(body).simple();
          const [po] = await tx.unsafe("select p.id,p.branch_id, sum(l.line_total_cost_vnd)::text total from public.purchase_orders p join public.purchase_order_lines l on l.purchase_order_id=p.id group by p.id order by p.created_at limit 1");
          assert.ok(po, "positive_po_fixture_required");
          const [actor] = await tx.unsafe("select e.id employee,e.auth_user_id actor,a.id access,a.role_id role from public.employees e join public.employee_branch_access a on a.employee_id=e.id and a.active join public.roles r on r.id=a.role_id and r.active where e.active and a.branch_id=$1 and e.auth_user_id is not null limit 1", [po.branch_id]);
          assert.ok(actor, "positive_actor_required");
          const expected = Array.from(await tx.unsafe("select id,unit_cost_vnd::text,line_total_cost_vnd::text from public.purchase_order_lines where purchase_order_id=$1 order by id", [po.id]));
          result.sourceIds = { purchaseOrder: po.id, lines: expected.map(x => x.id), actor };
          const asActor = async id => {
            await tx.unsafe("set local role authenticated");
            await tx.unsafe("select set_config('request.jwt.claim.sub',$1,true)", [id]);
          };
          const admin = () => tx.unsafe("reset role");
          const canRead = async () => {
            const [permissions] = await tx.unsafe("select private.has_permission($1,'purchasing.read') read,private.has_permission($1,'purchasing.price.read') cost", [po.branch_id]);
            return permissions;
          };
          const read = async () => ({
            orders: Array.from(await tx.unsafe("select id,total_cost_vnd from public.purchase_order_read where id=$1", [po.id])),
            lines: Array.from(await tx.unsafe("select id,unit_cost_vnd,line_total_cost_vnd from public.purchase_order_line_read where purchase_order_id=$1 order by id", [po.id])),
            progress: Array.from(await tx.unsafe("select purchase_order_line_id,received_quantity,supplier_quantity from public.purchase_order_line_progress_read where purchase_order_id=$1", [po.id])),
            rawQuantity: Array.from(await tx.unsafe("select id,quantity::text from public.purchase_order_lines where purchase_order_id=$1 order by id", [po.id])),
            helper: (await tx.unsafe("select private.purchase_order_visible_total_cost($1)::text total", [po.id]))[0].total,
          });
          await tx.unsafe("insert into public.role_permissions(role_id,permission_code) values($1,'purchasing.read'),($1,'purchasing.price.read') on conflict do nothing", [actor.role]);
          await asActor(actor.actor);
          assert.deepEqual(await canRead(), { read: true, cost: true });
          const allowed = await read();
          assert.deepEqual(allowed.lines, expected);
          assert.equal(allowed.orders[0].total_cost_vnd, po.total);
          assert.equal(allowed.helper, po.total);
          assert.equal(allowed.progress.length, expected.length);
          result.checks.push({ name: "AUTHORIZED_VIEW_AND_TOTAL_CONTROL", status: "PASS", expectedTotal: po.total, rows: expected.length });

          await assert.rejects(tx.savepoint(s => s.unsafe("select unit_cost_vnd from public.purchase_order_lines where purchase_order_id=$1", [po.id])), e => e.code === "42501");
          result.checks.push({ name: "RAW_COST_DIRECT_READ_DENIED", status: "PASS", code: "42501" });
          await admin();
          await tx.unsafe("delete from public.role_permissions where role_id=$1 and permission_code='purchasing.price.read'", [actor.role]);
          await tx.unsafe("delete from public.employee_permission_grants where employee_id=$1 and branch_id=$2 and permission_code='purchasing.price.read'", [actor.employee, po.branch_id]);
          await asActor(actor.actor);
          assert.deepEqual(await canRead(), { read: true, cost: false });
          const masked = await read();
          assert.equal(masked.orders[0].total_cost_vnd, null);
          assert.equal(masked.helper, null);
          assert.deepEqual(masked.lines.map(x => x.id), expected.map(x => x.id));
          assert.ok(masked.lines.every(x => x.unit_cost_vnd === null && x.line_total_cost_vnd === null));
          assert.equal(masked.rawQuantity.length, expected.length);
          assert.equal(masked.progress.length, expected.length);
          result.checks.push({ name: "PRICE_REVOKE_RETAINS_OPERATIONAL_ROWS_MASKS_COST", status: "PASS" });

          await admin();
          await tx.unsafe("insert into public.role_permissions(role_id,permission_code) values($1,'purchasing.price.read')", [actor.role]);
          await asActor(actor.actor);
          assert.equal((await read()).helper, po.total);
          result.checks.push({ name: "PRICE_REGRANT_SAME_CONNECTION", status: "PASS" });

          await admin();
          const [outsider] = await tx.unsafe("select e.auth_user_id actor from public.employees e where e.active and e.auth_user_id is not null and not exists(select 1 from public.employee_branch_access a where a.employee_id=e.id and a.branch_id=$1 and a.active) limit 1", [po.branch_id]);
          assert.ok(outsider, "cross_branch_fixture_required");
          await asActor(outsider.actor);
          const cross = await read();
          assert.equal(cross.orders.length, 0);
          assert.equal(cross.lines.length, 0);
          assert.equal(cross.rawQuantity.length, 0);
          assert.equal(cross.progress.length, 0);
          assert.equal(cross.helper, null);
          await asActor(actor.actor);
          assert.equal((await read()).helper, po.total);
          result.checks.push({ name: "ACTOR_SWITCH_CROSS_BRANCH_NO_ROW_OR_AGGREGATE_LEAK", status: "PASS" });

          for (const boundary of [
            { name: "EMPLOYEE_REVOKE", table: "employees", id: actor.employee, disable: "active=false,deactivated_at=now()", enable: "active=true,deactivated_at=null" },
            { name: "ACCESS_REVOKE", table: "employee_branch_access", id: actor.access, disable: "active=false,revoked_at=now()", enable: "active=true,revoked_at=null" },
            { name: "ROLE_REVOKE", table: "roles", id: actor.role, disable: "active=false", enable: "active=true" },
            { name: "BRANCH_REVOKE", table: "branches", id: po.branch_id, disable: "active=false", enable: "active=true" },
          ]) {
            await admin();
            await tx.unsafe("update public." + boundary.table + " set " + boundary.disable + " where id=$1", [boundary.id]);
            await asActor(actor.actor);
            const denied = await read();
            assert.equal(denied.orders.length, 0);
            assert.equal(denied.lines.length, 0);
            assert.equal(denied.helper, null);
            await admin();
            await tx.unsafe("update public." + boundary.table + " set " + boundary.enable + " where id=$1", [boundary.id]);
            await asActor(actor.actor);
            assert.equal((await read()).helper, po.total);
            result.checks.push({ name: boundary.name, status: "PASS" });
          }
          await admin();
          const [security] = await tx.unsafe("select p.prosecdef, p.provolatile, p.proconfig, pg_get_userbyid(p.proowner) owner, has_function_privilege('anon',p.oid,'EXECUTE') anon_execute, has_function_privilege('service_role',p.oid,'EXECUTE') service_execute from pg_proc p where p.oid='private.purchase_order_visible_total_cost(uuid)'::regprocedure");
          assert.equal(security.prosecdef, true);
          assert.equal(security.provolatile, "s");
          assert.ok(security.proconfig.includes('search_path=""'));
          assert.equal(security.owner, "postgres");
          assert.equal(security.anon_execute, false);
          assert.equal(security.service_execute, false);
          result.security = security;
          result.checks.push({ name: "HELPER_SECURITY_AND_GRANTS", status: "PASS" });
          throw rollback;
        });
      } catch (error) { if (error !== rollback) throw error; }
      result.status = "PASS_AFFECTED_NATIVE_SCOPE";
    } finally { await sql.end({ timeout: 3 }); }
  }
  report.status = "FIXED_VERIFIED_NATIVE";
} catch (error) {
  report.status = "FAILED_OR_BLOCKED_SETUP";
  report.error = { code: error.code ?? null, message: error.message };
  process.exitCode = 1;
} finally {
  await fs.writeFile(out + "/purchase-cost-patch-evidence.json", JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ status: report.status, artifact: out + "/purchase-cost-patch-evidence.json", databases: report.databases.map(x => ({ mode: x.mode, status: x.status, passed: x.checks.length })), error: report.error }));
}
