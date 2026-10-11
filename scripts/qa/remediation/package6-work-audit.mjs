import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { argumentsForRun, openQA, rejected, stockFixture } from "./native-fixture.mjs";
import { isolatedBranchFixture } from "./isolated-branch-fixture.mjs";
const args = argumentsForRun(), qa = await openQA(args), { sql, rpc } = qa;
const p = JSON.parse(await readFile(args.personas, "utf8")).personas;
const rollback = new Error("ROLLBACK_WORK_AUDIT_SOURCE");
const report = { scope: "G12_G21_POOL_CLAIM_ASSIGNMENT_SOURCE_AUDIT_ON_PENDING_BRANCH", database: args.database, productionAccess: "NONE", managedAuthTested: false, checks: [] };
try {
  try {
    await sql.begin(async tx => {
      const local = await isolatedBranchFixture(tx, qa, [p.worker.subject]), f = local.fixtures;
      const s = await stockFixture(tx, local, "1", { prepareOnly: true });
      const [owner] = await tx`select id from public.employees where auth_user_id=${f.owner}`;
      const job = await rpc(tx, "create_service_job", [f.branch, s.customer, s.site, "Dịch vụ QA", "Dịch vụ nguồn claim QA", "2099-03-01T08:00:00Z", "2099-03-01T12:00:00Z", "1", "giờ", owner.id, null, null, randomUUID()]);
      const work = await rpc(tx, "publish_work_item", [f.branch, "SERVICE_JOB", job, "POOL_CLAIM", null, randomUUID()]);
      const [w] = await tx`select version from public.work_items where id=${work}`;
      if (args.phase === "before") {
        const error = await rejected(tx, sp => rpc(sp, "claim_work_item", [work, w.version, randomUUID()]), "command_audit_source_missing", "23514");
        report.checks.push({ name: "ASSIGNMENT_RESULT_SOURCE_MISSING_FROM_AUDIT_MAP", reproduced: true, error });
      } else {
        for (const version of [null, 0, 999]) await rejected(tx, sp => rpc(sp, "claim_work_item", [work, version, randomUUID()]), null, "PT409");
        const claim = [work, w.version, randomUUID()], assignment = await rpc(tx, "claim_work_item", claim);
        assert.equal(await rpc(tx, "claim_work_item", claim), assignment);
        const otherJob = await rpc(tx, "create_service_job", [f.branch, s.customer, s.site, "Dịch vụ QA", "Dịch vụ phân công QA", "2099-03-02T08:00:00Z", "2099-03-02T12:00:00Z", "1", "giờ", owner.id, null, null, randomUUID()]);
        const otherWork = await rpc(tx, "publish_work_item", [f.branch, "SERVICE_JOB", otherJob, "POOL_CLAIM", null, randomUUID()]);
        const [claimed] = await tx`select version from public.work_items where id=${otherWork}`;
        for (const version of [null, 0, 999]) await rejected(tx, sp => rpc(sp, "assign_work_item", [otherWork, p.worker.employee, version, randomUUID()]), null, "PT409");
        const assign = [otherWork, p.worker.employee, claimed.version, randomUUID()], reassigned = await rpc(tx, "assign_work_item", assign);
        assert.equal(await rpc(tx, "assign_work_item", assign), reassigned);
        await tx.unsafe("set local role postgres");
        const [facts] = await tx`select (select count(*)::int from public.audit_events where trace_id=${claim[2]}) claimAudits,
          (select count(*)::int from public.audit_events where trace_id=${assign[3]}) assignAudits,
          (select count(*)::int from public.work_item_assignments where work_item_id=${otherWork} and superseded_at is null) activeAssignments,
          (select employee_id from public.work_item_assignments where work_item_id=${otherWork} and superseded_at is null) employee,
          (select state from private.branch_operational_states where branch_id=${f.branch}) state`;
        assert.deepEqual(facts, { claimaudits: 1, assignaudits: 1, activeassignments: 1, employee: p.worker.employee, state: "PENDING_OPENING" });
        report.checks.push({ name: "CLAIM_ASSIGN_NULL_STALE_DENIED_RETRY_AUDIT_ONCE_EXACT_SOURCE", status: "PASS", facts });
      }
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  report.status = args.phase === "before" ? "REPRODUCED_AUDIT_ASSIGNMENT_MAPPING_GAP" : "PASS_WORK_ASSIGNMENT_VERSION_AND_AUDIT_SOURCE"; report.rolledBack = true;
  await writeFile(args.out, JSON.stringify(report, null, 2)); console.log(JSON.stringify({ status: report.status, checks: report.checks.length }));
} finally { await sql.end({ timeout: 3 }); }
