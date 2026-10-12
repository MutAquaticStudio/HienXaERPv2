import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { argumentsForRun, openQA } from "./native-fixture.mjs";
import { realQAAuth } from "./auth.mjs";
const args = argumentsForRun(), qa = await openQA(args);
const doc = JSON.parse(await readFile(args.documents, "utf8")).documents.http;
const auth = await realQAAuth(args["auth-env"], { finance: "hxqa-finance-employee@example.test", sales: "hxqa-sales@example.test", worker: "hxqa-worker@example.test" });
const report = { scope: "G07_REAL_AUTH_ALLOCATE_PRIOR_ADVANCE", database: args.database, productionAccess: "NONE", checks: [], tokensRecorded: false };
try {
  const op = randomUUID(), lines = [{ obligation_id: doc.obligation, amount_vnd: "1000000" }];
  const payload = { target_payment_id: doc.payment, allocation_lines: lines, operation_id: op };
  assert.equal((await auth.api("sales", "rpc/allocate_payment", payload)).status, 403);
  const [source] = await qa.sql`select branch_id from public.payments where id=${doc.payment}`;
  const draft = await auth.api("finance", "rpc/save_command_draft", { target_operation_id: op, target_command: "allocate_payment",
    target_branch_id: source.branch_id, target_entries: [["paymentId", doc.payment], ["allocationsJson", JSON.stringify(lines)], ["operationId", op]] });
  assert.equal(draft.status, 200);
  const positive = await auth.api("finance", "rpc/allocate_payment", payload);
  assert.equal(positive.status, 200);
  assert.equal((await auth.api("finance", "rpc/allocate_payment", payload)).data, doc.payment);
  const lookup = await auth.api("finance", "rpc/lookup_command_outcome", { target_operation_id: op, target_command: "allocate_payment", target_branch_id: source.branch_id });
  assert.equal(lookup.status, 200);
  assert.equal(lookup.data.status, "COMMITTED");
  const read = await auth.api("finance", `payment_allocation_source_read?select=available_amount_vnd,advance_remaining_vnd&id=eq.${doc.payment}`);
  assert.equal(read.status, 200);
  assert.deepEqual(read.data[0], { available_amount_vnd: "0", advance_remaining_vnd: "0" });
  const legacy = await auth.api("finance", `payment_read?select=advance_amount_vnd,unallocated_amount_vnd&id=eq.${doc.payment}`);
  assert.equal(legacy.status, 200);
  assert.deepEqual(legacy.data[0], { advance_amount_vnd: 0, unallocated_amount_vnd: 0 });
  const worker = await auth.api("worker", `payment_allocation_source_read?select=id&id=eq.${doc.payment}`);
  assert.equal(worker.status, 200); assert.equal(worker.data.length, 0);
  const [facts] = await qa.sql`select (select count(*)::int from public.payments where customer_id=${doc.customer}) payments,
    (select sum(amount_vnd)::text from public.payments where customer_id=${doc.customer}) cash,
    private.current_receivable_outstanding(${doc.obligation})::text debt,
    private.advance_remaining(${doc.advance})::text advance,
    (select count(*)::int from public.advance_allocations where advance_id=${doc.advance}) consumptions`;
  assert.deepEqual(facts, { payments: 1, cash: "1000000", debt: "0", advance: "0", consumptions: 1 });
  report.checks.push({ name: "REAL_FINANCE_PRIOR_RECEIPT_ALLOCATED_WITHOUT_NEW_CASH", status: "PASS", facts,
    salesDenied: 403, workerDeniedRead: true, durableLookup: lookup.data.status, sourceReader: read.data[0], cashbookReader: legacy.data[0] });
  report.status = "PASS_EXECUTED_AUTHENTICATED_G07";
  await writeFile(args.out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, facts }));
} catch (error) {
  await writeFile(args.out.replace(/\.json$/, "-failure.json"), JSON.stringify({ ...report, status: "FAIL", error: error.message }, null, 2));
  throw error;
} finally { await qa.sql.end({ timeout: 3 }); }
