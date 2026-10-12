import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { argumentsForRun, openQA } from "../remediation/native-fixture.mjs";
import { isolatedBranchFixture } from "../remediation/isolated-branch-fixture.mjs";
const a = argumentsForRun(), q = await openQA(a), d = JSON.parse(await readFile(a.documents, "utf8")).documents;
assert.equal(a.database, "hx_remediation_go_live_browser175");
try {
  const documents = await q.sql.begin(async tx => {
    const local = await isolatedBranchFixture(tx, q, Object.values(d.personas).map(x => x.subject));
    const f = local.fixtures, site = randomUUID();
    await tx.unsafe("set local role postgres");
    await tx`insert into public.customer_sites(id,customer_id,code,name,address_text) values(${site},${f.customer},${"EX" + randomUUID().replaceAll("-", "").slice(0, 8)},'QA export1001 nguồn dịch vụ','QA cô lập')`;
    const rows = [];
    for (let i = 0; i < 1001; i++) {
      const start = new Date(Date.UTC(2300, 0, 1 + i)), end = new Date(start.getTime() + 3600000);
      const job = await q.rpc(tx, "create_service_job", [f.branch, f.customer, site, "QA tải báo cáo", "Nguồn dịch vụ độc lập " + (i + 1), start.toISOString(), end.toISOString(), "1", "giờ", d.personas.worker.employee, null, null, randomUUID()], f.owner);
      const work = await q.rpc(tx, "publish_work_item", [f.branch, "SERVICE_JOB", job, "DIRECT", d.personas.worker.employee, randomUUID()], f.owner);
      const [v] = await tx`select version from public.work_items where id=${work}`;
      await q.rpc(tx, "start_work_item", [work, v.version, randomUUID()], d.personas.worker.subject);
      const [started] = await tx`select version from public.work_items where id=${work}`;
      await q.rpc(tx, "submit_portal_work_result", [work, "1", "QA thực hiện nguồn dịch vụ cho tải báo cáo", "QA", null, started.version, randomUUID()], d.personas.worker.subject);
      await q.actor(tx, f.owner);
      const [version] = await tx`select j.version job,w.version work from public.service_jobs j join public.work_items w on w.service_job_id=j.id where j.id=${job}`;
      const verification = await q.rpc(tx, "verify_service_job", [job, "1", "1", "1000", "2026-10-12", "QA nguồn tải báo cáo, không thu tiền", version.job, version.work, randomUUID()], f.owner);
      const [obligation] = await tx`select id from public.receivable_obligations where service_verification_id=${verification}`;
      rows.push({ job, work, verification, obligation: obligation.id });
      if ((i + 1) % 100 === 0) console.log(JSON.stringify({ preparedSources: i + 1, committed: false }));
    }
    await tx.unsafe("set local role postgres");
    const [facts] = await tx`select count(*)::int obligations,sum(original_amount_vnd)::text amount from public.receivable_obligations where customer_id=${f.customer}`;
    assert.deepEqual(facts, { obligations: 1001, amount: "1001000" });
    const [history] = await tx`select state,activation_operation_id from private.branch_operational_states where branch_id=${f.branch}`;
    assert.equal(history.state, "PENDING_OPENING"); assert.equal(history.activation_operation_id, null);
    return { branch: f.branch, customer: f.customer, site, facts, history, rows, setup: "CANONICAL_MANAGER_AND_WORKER_RPCS_NO_DIRECT_FINANCIAL_INSERTS" };
  });
  await writeFile(a.out, JSON.stringify({ status: "PREPARED_CANONICAL_QA_SOURCES_NOT_YET_EXPORT_ACCEPTED", checkedAt: new Date().toISOString(), documents, productionAccess: "NONE", cleanup: "Owned native clone only; preserve sources until evidence/readback and private checkpoint" }, null, 2));
  console.log(JSON.stringify({ prepared: 1001, committed: true, branch: documents.branch, amount: documents.facts.amount }));
} finally { await q.sql.end({ timeout: 3 }); }
