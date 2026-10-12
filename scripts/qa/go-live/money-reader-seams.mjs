import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { browserQA } from "./browser-kit.mjs";

const scope = "OWNED_QA_LARGE_UNALLOCATED_CASH_TEXT_RPC_UI_AND_CUSTOMER_LIMIT_READERS";
const b = await browserQA(scope), { qa, d, report: r, origin } = b;
assert.equal(r.scope, scope);
const env = parseEnv(await readFile(b.args["auth-env"], "utf8"));
assert.equal(env.HX_QA_PROJECT_REF, "ffrwiglcrlumfvhubaxg");
assert.equal(env.HX_QA_RUNTIME_APPROVED, "true");
const client = createClient("http://127.0.0.1:3113", env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const amount = "9007199254740994", creditLimit = "9007199254740993";
const formatted = value => BigInt(value).toLocaleString("vi-VN");
const done = name => r.checks.some(check => check.name === name && check.status === "PASS");
let failure;
async function rpc(name, args) {
  const result = await client.rpc(name, args);
  assert.equal(result.error, null, "Owned QA canonical RPC failed; credentials are not logged");
  return result.data;
}
async function independentNet() {
  const [source] = await qa.sql`select coalesce(sum(case when direction='RECEIPT' then amount_vnd else -amount_vnd end),0)::text value from public.payments where branch_id=${d.branch}`;
  return source.value;
}
async function reverseOwnedReceipt() {
  if (!r.documents.payment && r.documents.paymentIntent) {
    const [committed] = await qa.sql`select p.id from public.command_receipts c join public.payments p on p.id=c.result_entity_id
      where c.operation_id=${r.documents.paymentIntent} and c.command_name='post_payment' and p.customer_id=${r.documents.customer}`;
    if (committed) r.documents.payment = committed.id;
  }
  const source = r.documents.payment;
  if (!source) return;
  const [payment] = await qa.sql`select id,amount_vnd::text amount,customer_id,branch_id,external_reference from public.payments where id=${source}`;
  assert.ok(payment); assert.equal(payment.amount, amount); assert.equal(payment.customer_id, r.documents.customer); assert.equal(payment.branch_id, d.branch);
  assert.equal(payment.external_reference, r.documents.reference);
  let [reversal] = await qa.sql`select id from public.payments where reversal_of_payment_id=${source}`;
  if (!reversal) reversal = { id: await rpc("reverse_payment", { target_payment_id: source, reversal_reason: r.documents.reverseReason, operation_id: r.documents.reverseIntent }) };
  r.documents.reversal = reversal.id;
  const [facts] = await qa.sql`select
    (select count(*)::int from public.payments where customer_id=${r.documents.customer}) payments,
    (select coalesce(sum(case when direction='RECEIPT' then amount_vnd else -amount_vnd end),0)::text from public.payments where customer_id=${r.documents.customer}) net,
    (select count(*)::int from public.payment_allocations a join public.payments p on p.id=a.payment_id where p.customer_id=${r.documents.customer}) allocations,
    (select count(*)::int from public.advances where payment_id=${source}) advances,
    (select count(*)::int from public.audit_events where trace_id=${r.documents.reverseIntent} and action='payment.reversed' and actor_auth_user_id=${d.personas.finance.subject}) reversal_audits`;
  assert.deepEqual(facts, { payments: 2, net: "0", allocations: 0, advances: 0, reversal_audits: 1 });
  r.cleanup = { throughCanonicalRealAuthReversal: true, oldSourcesReplayed: false, originalReceiptPreserved: true, ...facts };
  await b.save();
}

try {
  const login = await client.auth.signInWithPassword({ email: "hxqa-finance-employee@example.test", password: env.HX_QA_PASSWORD });
  assert.equal(login.error, null, "Real QA Finance login failed; credentials are not logged"); assert.equal(login.data.user.id, d.personas.finance.subject);
  const [schema] = await qa.sql`select count(*)::int count,max(version) latest from supabase_migrations.schema_migrations`;
  r.schema = schema.count; r.actualInitialSchema = schema; r.productionAccess = "NONE"; r.excludedAdvanceRacesRun = false;
  if (!r.documents.customer) {
    const marker = "QMR" + randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase();
    Object.assign(r.documents, { marker, customer: randomUUID(), customerIntent: randomUUID(), paymentIntent: randomUUID(), reverseIntent: randomUUID(),
      reference: marker + "-UNALLOCATED-CASH", reverseReason: "QA đảo nguồn tiền lớn riêng sau đối chiếu transport " + marker,
      effectiveAt: new Date().toISOString(), account: d.account, initialNet: await independentNet() });
    await b.save();
  }
  const existing = await qa.sql`select id,credit_limit_vnd::text credit from public.customers where id=${r.documents.customer}`;
  if (!existing.length) {
    await qa.sql.begin(tx => qa.rpc(tx, "save_customer_site_profile", ["customers", r.documents.customer, d.branch,
      { code: r.documents.marker, display_name: "QA tiền lớn riêng " + r.documents.marker, customer_type: "BUSINESS", active: true, credit_limit_vnd: creditLimit },
      null, "QA hồ sơ mới để đọc số tiền chính xác " + r.documents.marker, r.documents.customerIntent], d.fixtures.owner));
  } else assert.equal(existing[0].credit, creditLimit);
  const finance = await b.login("finance-employee");
  if (!done("CUSTOMER_LIMIT_RPC_AND_LIST_DETAIL_EXACT_TEXT_NO_OTHER_FIELD_ACCESS")) {
    const projected = await client.rpc("customer_private_fields", { target_customer_ids: [r.documents.customer] }).select("customer_id,credit_limit_vnd::text,internal_note");
    assert.equal(projected.error, null); assert.equal(projected.data.length, 1); assert.equal(projected.data[0].credit_limit_vnd, creditLimit);
    await finance.goto(origin + "/admin/customers?q=" + r.documents.marker);
    const row = finance.getByRole("row").filter({ hasText: r.documents.marker });
    await row.waitFor({state:"visible"}); assert.equal(await row.count(), 1); assert.ok((await row.innerText()).includes(formatted(creditLimit)));
    await finance.reload(); await finance.getByRole("row").filter({hasText:r.documents.marker}).waitFor({state:"visible"}); assert.ok((await finance.getByRole("row").filter({ hasText: r.documents.marker }).innerText()).includes(formatted(creditLimit)));
    // Detail belongs to the same source; its finance fields use a separate query.
    await finance.goto(origin + "/admin/customers/" + r.documents.customer); await finance.getByText(formatted(creditLimit)+" ₫",{exact:false}).first().waitFor(); assert.ok((await finance.locator("body").innerText()).includes(formatted(creditLimit)));
    await b.record("CUSTOMER_LIMIT_RPC_AND_LIST_DETAIL_EXACT_TEXT_NO_OTHER_FIELD_ACCESS", { customer: r.documents.customer, credit: creditLimit, projectedType: typeof projected.data[0].credit_limit_vnd });
  }
  let [payment] = await qa.sql`select p.id,p.amount_vnd::text amount from public.command_receipts c join public.payments p on p.id=c.result_entity_id
    where c.operation_id=${r.documents.paymentIntent} and c.command_name='post_payment' and p.customer_id=${r.documents.customer}`;
  if (!payment) {
    // This is an unallocated receipt, not an advance allocation/race and not a
    // replay of the completed 5,000 VND reconciliation/reversal source.
    const id = await rpc("post_payment", { target_branch_id: d.branch, direction: "RECEIPT", target_customer_id: r.documents.customer,
      target_supplier_id: null, target_employee_id: null, target_account_id: r.documents.account, amount_vnd: amount,
      effective_at: r.documents.effectiveAt, method: "CASH", external_reference: r.documents.reference, allocation_lines: [], advance_amount_vnd: "0", operation_id: r.documents.paymentIntent });
    payment = { id, amount };
  }
  assert.equal(payment.amount, amount); r.documents.payment = payment.id; await b.save();
  const [alreadyReversed] = await qa.sql`select id from public.payments where reversal_of_payment_id=${payment.id}`;
  assert.equal(alreadyReversed, undefined, "A cleaned-up original source is closed; do not repost it to fill missing live-reader evidence");
  const lookup = await rpc("lookup_command_outcome", { target_operation_id: r.documents.paymentIntent, target_command: "post_payment", target_branch_id: d.branch });
  assert.equal(lookup.status, "COMMITTED"); assert.equal(lookup.result_id, payment.id);
  const [effects] = await qa.sql`select
    (select count(*)::int from public.payments where id=${payment.id} and customer_id=${r.documents.customer}) payments,
    (select count(*)::int from public.command_receipts where operation_id=${r.documents.paymentIntent} and result_entity_id=${payment.id}) receipts,
    (select count(*)::int from public.audit_events where trace_id=${r.documents.paymentIntent} and action='payment.posted' and actor_auth_user_id=${d.personas.finance.subject}) audits,
    (select count(*)::int from public.payment_allocations where payment_id=${payment.id}) allocations,
    (select count(*)::int from public.advances where payment_id=${payment.id}) advances`;
  assert.deepEqual(effects, { payments: 1, receipts: 1, audits: 1, allocations: 0, advances: 0 });
  if (!done("ONE_OWNED_LARGE_RECEIPT_SAME_INTENT_OUTCOME_READ_NO_ADVANCE_OR_DEBT_ALLOCATION")) await b.record("ONE_OWNED_LARGE_RECEIPT_SAME_INTENT_OUTCOME_READ_NO_ADVANCE_OR_DEBT_ALLOCATION", { payment: payment.id, amount, outcome: lookup.status, ...effects });
  const expectedNet = await independentNet();
  assert.equal(expectedNet, (BigInt(r.documents.initialNet) + BigInt(amount)).toString());
  const summary = await client.rpc("cashbook_summary", { target_branch_id: d.branch }).select("net_cash_vnd::text,unmatched_count").single();
  assert.equal(summary.error, null); assert.equal(typeof summary.data.net_cash_vnd, "string"); assert.equal(summary.data.net_cash_vnd, expectedNet);
  await finance.goto(origin + "/admin/cashbook");
  const metric = finance.locator("article").filter({ has: finance.getByText("Dòng tiền ròng", { exact: true }) });
  await metric.waitFor({state:"visible"}); assert.ok((await metric.innerText()).includes(formatted(expectedNet)));
  // Reference is not rendered by the table; identify its canonical number instead.
  const [number] = await qa.sql`select payment_number from public.payments where id=${payment.id}`;
  const sourceRow = finance.getByRole("row").filter({ hasText: number.payment_number });
  await sourceRow.waitFor({state:"visible"}); assert.equal(await sourceRow.count(), 1); assert.ok((await sourceRow.innerText()).includes(formatted(amount)));
  await finance.reload(); await finance.getByText("Dòng tiền ròng",{exact:true}).waitFor(); assert.ok((await finance.locator("article").filter({ has: finance.getByText("Dòng tiền ròng", { exact: true }) }).innerText()).includes(formatted(expectedNet)));
  if (!done("CASHBOOK_TABLE_RPC_TEXT_AND_UI_NET_SUM_PAYMENT_ROW_RELOAD_EXACT")) await b.record("CASHBOOK_TABLE_RPC_TEXT_AND_UI_NET_SUM_PAYMENT_ROW_RELOAD_EXACT", { sourceNet: expectedNet, rpcNet: summary.data.net_cash_vnd, rpcNetType: typeof summary.data.net_cash_vnd, payment: number.payment_number, amount });
  await b.shot(finance, "qa-large-cash-net-and-receipt-exact");
  await reverseOwnedReceipt(); assert.equal(await independentNet(), r.documents.initialNet);
  if (!done("OWNED_LARGE_RECEIPT_REVERSED_ONCE_NET_RESTORED_NO_ADVANCE_RACE_REPLAY")) await b.record("OWNED_LARGE_RECEIPT_REVERSED_ONCE_NET_RESTORED_NO_ADVANCE_RACE_REPLAY", r.cleanup);
  await b.finish();
} catch (error) {
  failure = String(error?.message ?? "Money reader QA failed").split("\n")[0];
  if (/access_token|refresh_token|authorization|auth-token|eyJ[A-Za-z0-9_-]{30}|sb_secret_/i.test(failure)) failure = "Money reader QA failed; sensitive diagnostic omitted";
  r.status = "FAIL"; r.error = failure; await b.save();
} finally {
  try { await reverseOwnedReceipt(); }
  catch { failure ??= "Owned QA large-cash reversal cleanup needs attention"; r.status = "FAIL"; r.cleanupError = "Canonical owned-source reversal could not be confirmed"; await b.save(); }
  client.auth.stopAutoRefresh(); await b.close();
}
if (failure) throw new Error(failure);
