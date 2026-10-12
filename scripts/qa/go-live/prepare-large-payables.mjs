import assert from "node:assert/strict";
import { readFile, writeFile, access } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { argumentsForRun, openQA } from "../remediation/native-fixture.mjs";
import { isolatedBranchFixture } from "../remediation/isolated-branch-fixture.mjs";
const a = argumentsForRun(), q = await openQA(a), d = JSON.parse(await readFile(a.documents, "utf8")).documents;
try { await access(a.out); throw new Error("Prepared sources must not be recreated"); } catch (e) { if (e.code !== "ENOENT") throw e; }
try {
  const documents = await q.sql.begin(async tx => {
    const local = await isolatedBranchFixture(tx, q, Object.values(d.personas).map(p => p.subject)), f = local.fixtures;
    const category = await q.rpc(tx, "create_expense_category", [f.branch, "GAP" + randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase(), "QA phải trả1001 nguồn độc lập", randomUUID()], f.owner);
    const rows = [];
    for (let i = 0; i < 1001; i++) {
      const expense = await q.rpc(tx, "create_expense", [f.branch, category, f.supplier, "1000", "2026-10-11T00:00:00+07:00", "2026-10-12", "QA nguồn phải trả xuất báo cáo " + (i + 1), "ADMIN", null, null, randomUUID()], f.owner);
      const [e] = await tx`select version from public.expenses where id=${expense}`;
      await q.rpc(tx, "approve_expense", [expense, e.version, randomUUID()], f.owner);
      const [ap] = await tx`select id from public.payable_obligations where expense_id=${expense}`; rows.push({ expense, obligation: ap.id });
      if ((i + 1) % 200 === 0) console.log(JSON.stringify({ prepared: i + 1, committed: false }));
    }
    await tx.unsafe("set local role postgres");
    const [facts] = await tx`select count(*)::int count,sum(original_amount_vnd)::text amount from public.payable_obligations where branch_id=${f.branch}`;
    assert.deepEqual(facts, { count: 1001, amount: "1001000" });
    const [history] = await tx`select state,activation_operation_id from private.branch_operational_states where branch_id=${f.branch}`;
    assert.equal(history.state, "PENDING_OPENING"); assert.equal(history.activation_operation_id, null);
    return { ...d, branch: f.branch, fixtures: f, customer: f.customer, rows, category, facts, history, setup: "CANONICAL_EXPENSE_AND_APPROVAL_RPCS_NO_DIRECT_FINANCIAL_INSERT_NO_CASH" };
  });
  await writeFile(a.out, JSON.stringify({ status: "PREPARED_NOT_YET_EXPORT_ACCEPTED", checkedAt: new Date().toISOString(), documents, productionAccess: "NONE" }, null, 2));
  console.log(JSON.stringify({ prepared: 1001, committed: true, amount: documents.facts.amount }));
} finally { await q.sql.end({ timeout: 3 }); }
