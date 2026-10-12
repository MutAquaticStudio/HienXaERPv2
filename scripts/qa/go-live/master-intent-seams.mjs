import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { argumentsForRun, openQA, rejected } from "../remediation/native-fixture.mjs";
const a = argumentsForRun(), q = await openQA(a), d = JSON.parse(await readFile(a.documents, "utf8")).documents;
const otherBranch = JSON.parse(await readFile("reports/go-live-acceptance/AP1001_FIXTURES181.json", "utf8")).documents.branch;
assert.notEqual(otherBranch, d.branch);
const r = { scope: "MASTER_DRAFT_OUTCOME_ACTOR_BRANCH_AND_FINANCIAL_DELEGATION", productionAccess: "NONE", checks: [] }, rollback = new Error("ROLLBACK_MASTER_INTENTS");
const call = (tx, name, args, uid = d.fixtures.owner) => q.rpc(tx, name, args, uid);
try {
  try { await q.sql.begin(async tx => {
    const op = randomUUID(), kind = "groups", command = "save_catalog_record", code = "GMI" + randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
    const entries = [["kind", kind], ["operationId", op], ["code", code], ["name", "QA nhóm phục hồi"], ["reason", "QA giữ nguồn và ý định"]];
    assert.equal(await call(tx, "save_command_draft", [op, command, d.branch, entries]), op);
    assert.equal(await call(tx, "save_command_draft", [op, command, d.branch, entries]), op);
    assert.deepEqual((await call(tx, "get_command_draft", [op, command, d.branch])).entries, entries);
    assert.deepEqual(await call(tx, "lookup_command_outcome", [op, command, d.branch]), { status: "UNKNOWN" });
    await rejected(tx, sp => call(sp, "save_command_draft", [op, command, d.branch, [...entries, ["name", "changed"]]]), null, "23505");
    await rejected(tx, sp => call(sp, "get_command_draft", [op, command, d.branch], d.personas.worker.subject), null, "42501");
    await rejected(tx, sp => call(sp, "save_command_draft", [randomUUID(), command, d.branch, [...entries, ["kind", "vehicles"]]]), null, "22023");
    r.checks.push({ name: "MASTER_DRAFT_PERSIST_GET_RETRY_CHANGE_CONFLICT_AND_WORKER_DENIAL", status: "PASS" });
    const values = { code, name: "QA nhóm phục hồi", active: true };
    const args = [kind, op, d.branch, values, null, "QA giữ nguồn và ý định", op];
    assert.equal(await call(tx, command, args), op); assert.equal(await call(tx, command, args), op);
    assert.deepEqual(await call(tx, "lookup_command_outcome", [op, command, d.branch]), { status: "COMMITTED", result_id: op });
    await rejected(tx, sp => call(sp, command, [kind, op, d.branch, { ...values, name: "changed" }, null, "QA giữ nguồn và ý định", op]), null, "23505");
    const foreign = await call(tx, "lookup_command_outcome", [op, command, otherBranch]); assert.deepEqual(foreign, { status: "UNKNOWN" });
    await rejected(tx, sp => call(sp, command, args, d.personas.worker.subject), null, "42501");
    r.checks.push({ name: "MASTER_ORIGINAL_INTENT_RESULT_BEFORE_STATE_GUARD_BOUND_TO_ACTOR_SOURCE_AND_PAYLOAD", status: "PASS" });
    const financeOp = randomUUID(), financeEntries = [["operationId", financeOp], ["amount", "1000000"]];
    assert.equal(await call(tx, "save_command_draft", [financeOp, "post_payment", d.branch, financeEntries], d.personas.finance.subject), financeOp);
    assert.deepEqual((await call(tx, "get_command_draft", [financeOp, "post_payment", d.branch], d.personas.finance.subject)).entries, financeEntries);
    assert.deepEqual(await call(tx, "lookup_command_outcome", [financeOp, "post_payment", d.branch], d.personas.finance.subject), { status: "UNKNOWN" });
    await rejected(tx, sp => call(sp, "get_command_draft", [financeOp, "post_payment", d.branch], d.personas.worker.subject), null, "42501");
    r.checks.push({ name: "FINANCIAL_DRAFT_DELEGATES_UNCHANGED_WITH_CURRENT_RIGHTS_NO_FINANCIAL_WRITER", status: "PASS", advanceRace: false });
    await tx.unsafe("set local role postgres");
    for (const name of ["canonical_save_catalog_record", "canonical_save_customer_site_profile", "canonical_save_branch_config", "canonical_save_command_draft", "canonical_get_command_draft", "canonical_lookup_command_outcome"]) {
      const [acl] = await tx`select has_function_privilege('authenticated',p.oid,'execute') allowed from pg_proc p where p.pronamespace='private'::regnamespace and p.proname=${name}`;
      assert.equal(acl.allowed, false);
    }
    r.checks.push({ name: "CANONICAL_INTERNAL_HELPERS_NOT_DIRECTLY_EXECUTABLE_BY_AUTHENTICATED", status: "PASS" });
    throw rollback;
  }); } catch (e) { if (e !== rollback) throw e; }
  r.status = "PASS"; r.rolledBack = true; r.checkedAt = new Date().toISOString(); await writeFile(a.out, JSON.stringify(r, null, 2));
  console.log(JSON.stringify({ status: "PASS", checks: r.checks.length, rolledBack: true }));
} catch (e) { r.status = "FAIL"; r.error = e.message; await writeFile(a.out, JSON.stringify(r, null, 2)); throw e; }
finally { await q.sql.end({ timeout: 3 }); }
