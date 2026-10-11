import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { argumentsForRun, openQA, stockFixture, salesFixture } from "./native-fixture.mjs";

const args = argumentsForRun(), qa = await openQA(args), { sql, rpc, fixtures: f } = qa;
const finance = JSON.parse(await readFile(args.personas, "utf8")).personas.finance.subject;
let observer;
try {
  const documents = await sql.begin(async tx => {
    const [{ pid: writerPid }] = await tx`select pg_backend_pid() pid`;
    const stock = await stockFixture(tx, qa, "14"), sale = await salesFixture(tx, qa, stock);
    const allocation = await rpc(tx, "upsert_supply_allocation", [sale.line, "WAREHOUSE", null, f.warehouse, "14", null, null, randomUUID()]);
    const delivery = await rpc(tx, "create_delivery_from_allocations", [sale.so,
      [{ supply_allocation_id: allocation, planned_base_quantity: "14" }], new Date().toISOString(), randomUUID()]);
    const [line] = await tx`select id from public.delivery_lines where delivery_id=${delivery}`;
    await rpc(tx, "assign_delivery", [delivery, null, null, "Xe ngoài kiểm thử paid return", "", 1, randomUUID()]);
    await rpc(tx, "handoff_delivery_actual", [delivery, 2, new Date().toISOString(), randomUUID(),
      [{ delivery_line_id: line.id, loaded_base_quantity: "14" }]]);
    const result = await rpc(tx, "submit_delivery_result", [delivery, "FULL", [{ delivery_line_id: line.id, actual_base_quantity: "14" }],
      "QA", "", "Ghi nhận QA", null, 3, randomUUID()]);
    const verification = await rpc(tx, "verify_delivery", [result, [{ delivery_line_id: line.id, accepted_base_quantity: "14",
      billable_base_quantity: "14", billing_variance_reason: "" }], 4, randomUUID()]);
    const [ar] = await tx`select id from public.receivable_obligations where delivery_verification_id=${verification}`;
    const [vl] = await tx`select id from public.delivery_verification_lines where delivery_verification_id=${verification}`;
    const account = await rpc(tx, "create_finance_account", [f.branch, stock.prefix, "Quỹ giả paid return QA", "CASH", randomUUID()]);
    const payment = await rpc(tx, "post_payment", [f.branch, "RECEIPT", stock.customer, null, account, "3220000", new Date().toISOString(),
      "CASH", "Thu đủ hàng14 đơn vị trên QA", [{ obligation_id: ar.id, amount_vnd: "3220000" }], "0", randomUUID()], finance);
    const returnCase = await rpc(tx, "open_return_case", [vl.id, "CUSTOMER_RETURN", "1", "Khách trả một đơn vị QA", null, randomUUID()]);
    await rpc(tx, "resolve_return_case", [returnCase, "RETURNED", f.warehouse, "Đã nhận lại một đơn vị", null, 1, randomUUID()]);
    const adjustment = await rpc(tx, "adjust_return_receivable", [returnCase, "230000", "Giảm theo snapshot230k cho1đơnvị", randomUUID()], finance);
    return { branch: f.branch, writerPid, customer: stock.customer, salesOrder: sale.so, payment, account, obligation: ar.id,
      returnCase, adjustment, verificationLine: vl.id, delivery };
  });
  observer = await openQA(args);
  const [{ pid: readerPid }] = await observer.sql`select pg_backend_pid() pid`;
  assert.notEqual(readerPid, documents.writerPid);
  const [facts] = await observer.sql`select private.current_receivable_outstanding(${documents.obligation})::text debt,
    (select sum(case when direction='RECEIPT' then amount_vnd else -amount_vnd end)::text from public.payments where customer_id=${documents.customer}) cash,
    (select count(*)::int from public.payments where customer_id=${documents.customer}) payments,
    (select sum(amount_delta_vnd)::text from public.direct_cost_entries where sales_order_id=${documents.salesOrder}) cost`;
  assert.deepEqual(facts, { debt: "-230000", cash: "3220000", payments: 1, cost: "1950000" });
  const upper = new Date(Date.now() + 86400000).toISOString();
  const snapshot = await observer.sql.begin(tx => observer.rpc(tx, "finance_dashboard_snapshot", [f.branch, "2000-01-01T00:00:00Z",
    upper, upper, documents.customer, null, null, "DELIVERY"]));
  assert.equal(String(snapshot.revenue.value_vnd), "3220000");
  assert.equal(String(snapshot.gross_profit.value_vnd), "1270000");
  assert.equal(snapshot.direct_cost.quality, "READY");
  await writeFile(args.out, JSON.stringify({ scope: "G08_G09_PAID_RETURN_COMMITTED_BEFORE", database: args.database,
    status: "REPRODUCED_NEGATIVE_AR_AND_UNREDUCED_REVENUE", documents, readerPid, facts,
    snapshot, requiredNetRevenue: "2990000", requiredGrossProfit: "1040000", managedAuthTested: false, productionAccess: "NONE" }, null, 2));
  console.log(JSON.stringify({ status: "REPRODUCED_NEGATIVE_AR_AND_UNREDUCED_REVENUE", facts,
    revenue: String(snapshot.revenue.value_vnd), grossProfit: String(snapshot.gross_profit.value_vnd), distinctReadbackConnection: true }));
} finally { if (observer) await observer.sql.end({ timeout: 3 }); await sql.end({ timeout: 3 }); }
