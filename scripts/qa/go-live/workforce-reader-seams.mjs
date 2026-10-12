import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { argumentsForRun, openQA } from "../remediation/native-fixture.mjs";
const a = argumentsForRun(), q = await openQA(a);
const d = JSON.parse(await readFile(a.documents, "utf8")).documents;
const other = JSON.parse(await readFile(a.large, "utf8")).documents;
const rollback = new Error("ROLLBACK_WORKFORCE_READER"), checks = [];
try {
  try { await q.sql.begin(async tx => {
    await q.actor(tx, d.fixtures.owner);
    const read = async branch => [...await tx`select id,work_item_id,work_state from public.workforce_read where branch_id=${branch} and id=${d.personas.worker.employee}`];
    const before = await read(d.branch);
    assert.deepEqual(before, [{ id: d.personas.worker.employee, work_item_id: null, work_state: null }]);
    checks.push({ name: "1004_HISTORY_FREE_ROWS_COLLAPSE_TO_ONE_REAL_BRANCH_EMPLOYEE", status: "PASS", rows: before.length });
    async function planned(branch, customer, site, start, end) {
      const job = await q.rpc(tx, "create_service_job", [branch, customer, site, "QA phân công theo chi nhánh", "Nguồn kiểm chứng danh sách nhân sự", start, end, "1", "giờ", d.personas.worker.employee, null, null, randomUUID()], d.fixtures.owner);
      return q.rpc(tx, "publish_work_item", [branch, "SERVICE_JOB", job, "DIRECT", d.personas.worker.employee, randomUUID()], d.fixtures.owner);
    }
    const otherWork = await planned(other.branch, other.customer, other.site, "2400-01-01T00:00:00Z", "2400-01-01T01:00:00Z");
    assert.deepEqual(await read(d.branch), before);
    assert.deepEqual(await read(other.branch), [{ id: d.personas.worker.employee, work_item_id: otherWork, work_state: "CLAIMED" }]);
    const ownWork = await planned(d.branch, d.customer, d.site, "2400-01-02T00:00:00Z", "2400-01-02T01:00:00Z");
    assert.deepEqual(await read(d.branch), [{ id: d.personas.worker.employee, work_item_id: ownWork, work_state: "CLAIMED" }]);
    assert.deepEqual(await read(other.branch), [{ id: d.personas.worker.employee, work_item_id: otherWork, work_state: "CLAIMED" }]);
    checks.push({ name: "ACTIVE_ASSIGNMENTS_MATCH_ONLY_SELECTED_BRANCH_WITH_NO_PHANTOM_FREE_ROW", status: "PASS", ownWork, otherWork });
    throw rollback;
  }); } catch (error) { if (error !== rollback) throw error; }
  await writeFile(a.out, JSON.stringify({ status: "PASS_WORKFORCE_READER_SCOPE", checkedAt: new Date().toISOString(), checks, rolledBack: true, productionAccess: "NONE" }, null, 2));
  console.log(JSON.stringify({ status: "PASS", checks: checks.length, rolledBack: true }));
} finally { await q.sql.end({ timeout: 3 }); }
