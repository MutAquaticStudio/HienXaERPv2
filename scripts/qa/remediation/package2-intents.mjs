import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { argumentsForRun, openQA, rejected, stockFixture } from "./native-fixture.mjs";

const args = argumentsForRun();
assert.ok(args.personas);
const personas = JSON.parse(await readFile(args.personas, "utf8"));
const qa = await openQA(args);
const { sql, fixtures: f, rpc } = qa;
const rollback = new Error("ROLLBACK_TEST_FIXTURE");
const report = { scope: "NATIVE_DURABLE_OUTCOME_PRIVATE_DRAFT_CONTRACT", database: args.database,
  productionAccess: "NONE", managedAuthTested: false, checks: [] };
try {
  try {
    await sql.begin(async (tx) => {
      const stock = await stockFixture(tx, qa);
      const account = await rpc(tx, "create_finance_account", [f.branch, stock.prefix + "_CASH", "Quỹ QA độc lập", "CASH", randomUUID()]);
      const operation = randomUUID();
      const entries = [["partyId", stock.customer], ["accountId", account], ["amount", "1000000"], ["operationId", operation]];
      const saved = await rpc(tx, "save_command_draft", [operation, "post_payment", f.branch, entries]);
      assert.equal(saved, operation);
      const restored = await rpc(tx, "get_command_draft", [operation, "post_payment", f.branch]);
      assert.deepEqual(restored.entries, entries);
      assert.equal(await rpc(tx, "save_command_draft", [operation, "post_payment", f.branch, entries]), operation);
      await rejected(tx, (sp) => rpc(sp, "save_command_draft", [operation, "post_payment", f.branch, [["amount", "2000000"]]]), "operation_payload_conflict", "23505");
      const other = await rpc(tx, "get_command_draft", [operation, "post_payment", f.branch], personas.personas.finance.subject);
      assert.equal(other, null);
      const unknown = await rpc(tx, "lookup_command_outcome", [operation, "post_payment", f.branch]);
      assert.deepEqual(unknown, { status: "UNKNOWN" });
      const effective = new Date().toISOString();
      const parameters = [f.branch, "RECEIPT", stock.customer, null, account, "1000000", effective, "CASH", "QA receipt", [], "0", operation, null];
      await rejected(tx, (sp) => rpc(sp, "post_payment", parameters, personas.personas.finance.subject), "forbidden_command_intent", "42501");
      const payment = await rpc(tx, "post_payment", parameters);
      assert.equal(await rpc(tx, "post_payment", parameters), payment);
      const outcome = await rpc(tx, "lookup_command_outcome", [operation, "post_payment", f.branch]);
      assert.deepEqual(outcome, { status: "COMMITTED", result_id: payment });
      const second = await rpc(tx, "post_payment", [...parameters.slice(0, 11), randomUUID(), null]);
      assert.notEqual(second, payment, "A distinct actual receipt with the same amount remains valid");
      await tx.unsafe("set local role postgres");
      const [facts] = await tx`select count(*)::int payments,sum(amount_vnd)::text total from public.payments where customer_id=${stock.customer}`;
      assert.deepEqual(facts, { payments: 2, total: "2000000" });
      report.checks.push({ name: "G15_PRIVATE_DRAFT_OWNER_IMMUTABLE_PAYLOAD_UNKNOWN_AND_COMMITTED", status: "PASS", outcome, facts,
        changedPayloadDenied: true, otherActorDraftHidden: true, otherActorCannotTakeIntent: true });
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  report.status = "PASS_EXECUTED_DB_SCOPE";
  report.rolledBack = true;
  await writeFile(args.out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, rolledBack: true }));
} finally { await sql.end({ timeout: 3 }); }
