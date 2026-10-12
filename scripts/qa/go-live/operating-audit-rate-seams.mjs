import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { argumentsForRun, openQA, rejected } from "../remediation/native-fixture.mjs";
const a = argumentsForRun(), q = await openQA(a), d = JSON.parse(await readFile(a.documents, "utf8")).documents;
const r = { scope: "T02_T37_T40_RULE_RATE_PRECISION_ATOMIC_AUDIT_ROLLBACK_RETRY", checks: [], productionAccess: "NONE", excludedAdvanceRacesRun: false };
const rollback = new Error("ROLLBACK_AUDIT_RATE_ACCEPTANCE");
const call = (tx, command, args, uid = d.fixtures.owner) => q.rpc(tx, command, args, uid);
try {
  try { await q.sql.begin(async tx => {
    for (const rate of ["NaN", "Infinity", "-Infinity", "1.0000001", "100000000000000", "0", "-1", null]) {
      const args = [d.branch, "GR" + randomUUID().replaceAll("-", "").slice(0, 10), "QA từ chối rate không chính xác", d.personas.worker.employee, "BONUS", "FIXED_PER_BASIS", rate, null, "OPEX", "2020-01-01", null, randomUUID()];
      const error = await rejected(tx, sp => call(sp, "create_compensation_rule", args), null, "22023");
      await tx.unsafe("set local role postgres");
      const [effects] = await tx`select (select count(*)::int from public.command_receipts where operation_id=${args[11]}) receipts,(select count(*)::int from public.audit_events where trace_id=${args[11]}) audits`;
      assert.deepEqual(effects, { receipts: 0, audits: 0 }); r.checks.push({ name: "RULE_BAD_RATE", input: rate, status: "PASS", error, effects });
    }
    const code = "GV" + randomUUID().replaceAll("-", "").slice(0, 10), intent = randomUUID();
    const args = [d.branch, code, "QA rate chính xác", d.personas.worker.employee, "BONUS", "FIXED_PER_BASIS", "1.123456", null, "OPEX", "2020-01-01", null, intent];
    const id = await call(tx, "create_compensation_rule", args); assert.equal(await call(tx, "create_compensation_rule", args), id);
    const changed = [...args]; changed[6] = "2"; await rejected(tx, sp => call(sp, "create_compensation_rule", changed), null, "23505");
    await tx.unsafe("set local role postgres");
    const [rule] = await tx`select rate_vnd_per_unit::text rate,version,(select count(*)::int from public.audit_events where trace_id=${intent}) audits from public.compensation_rules where id=${id}`;
    assert.deepEqual(rule, { rate: "1.123456", version: 1, audits: 1 });
    r.checks.push({ name: "EXACT_RULE_RATE_RETRY_ONE_VERSION_ONE_AUDIT_PAYLOAD_CONFLICT", status: "PASS", rule });
    // Simulate a failed audit insert. Everything is installed and removed by this transaction.
    await tx.unsafe("create function pg_temp.fail_go_live_audit() returns trigger language plpgsql as $$ begin if new.trace_id::text=current_setting('qa.audit_fault',true) then raise exception 'qa_audit_fault'; end if; return new; end $$").simple();
    await tx.unsafe("create trigger qa_go_live_audit_fault after insert on public.audit_events for each row execute function pg_temp.fail_go_live_audit()").simple();
    for (const command of ["create_compensation_rule", "create_expense_category"]) {
      const op = randomUUID(), key = "GF" + randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase();
      const values = command === "create_compensation_rule" ? [d.branch, key, "QA audit rollback", d.personas.worker.employee, "BONUS", "FIXED_PER_BASIS", "100000", null, "OPEX", "2020-01-01", null, op] : [d.branch, key, "QA audit rollback", op];
      await tx`select set_config('qa.audit_fault',${op},true)`;
      await rejected(tx, sp => call(sp, command, values), "qa_audit_fault", "P0001");
      await tx.unsafe("set local role postgres");
      const [effects] = await tx`select (select count(*)::int from public.command_receipts where operation_id=${op}) receipts,(select count(*)::int from public.audit_events where trace_id=${op}) audits,(select count(*)::int from public.compensation_rules where code=upper(${key})) rules,(select count(*)::int from public.expense_categories where code=upper(${key})) categories`;
      assert.deepEqual(effects, { receipts: 0, audits: 0, rules: 0, categories: 0 });
      await tx`select set_config('qa.audit_fault','',true)`;
      const saved = await call(tx, command, values); assert.equal(await call(tx, command, values), saved);
      await tx.unsafe("set local role postgres");
      const [audit] = await tx`select count(*)::int n from public.audit_events where trace_id=${op}`; assert.equal(audit.n, 1);
      r.checks.push({ name: command + "_FAILURE_ROLLS_BACK_SOURCE_RECEIPT_AUDIT_SAME_INTENT_RECOVERS_ONCE", status: "PASS", effects, retryAudits: audit.n });
    }
    await tx.unsafe("set local role postgres");
    const [audit] = await tx`select changed_fields,to_jsonb(a) fields from public.audit_events a where trace_id=${intent}`;
    assert.deepEqual([...audit.changed_fields], ["command_result"]);
    assert.deepEqual(Object.keys(audit.fields).sort(), ["id", "occurred_at", "actor_auth_user_id", "branch_id", "action", "entity_type", "entity_id", "trace_id", "changed_fields", "reason"].sort());
    r.checks.push({ name: "AUDIT_ONLY_SOURCE_IDENTIFIERS_NO_PAY_OR_RATE_PAYLOAD", status: "PASS" });
    throw rollback;
  }); } catch (error) { if (error !== rollback) throw error; }
  const [schema] = await q.sql`select count(*)::int count,max(version) latest from supabase_migrations.schema_migrations`;
  r.schema = schema; r.rolledBack = true; r.status = "PASS"; r.checkedAt = new Date().toISOString(); await writeFile(a.out, JSON.stringify(r, null, 2));
  console.log(JSON.stringify({ status: "PASS", schema: schema.count, checks: r.checks.length, rolledBack: true }));
} catch (error) { r.status = "FAIL"; r.error = error.message; await writeFile(a.out, JSON.stringify(r, null, 2)); throw error; }
finally { await q.sql.end({ timeout: 3 }); }
