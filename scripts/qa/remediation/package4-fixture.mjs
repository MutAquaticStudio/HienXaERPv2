import { randomUUID } from "node:crypto";
import { salesFixture, stockFixture } from "./native-fixture.mjs";

export async function advanceScenario(tx, qa, finance) {
  const { fixtures: f, rpc } = qa;
  const s = await stockFixture(tx, qa, "1", { unitPriceVnd: "1000000" });
  const account = await rpc(tx, "create_finance_account", [f.branch, s.prefix, "Quỹ giả kiểm thử ứng trước", "CASH", randomUUID()]);
  const payment = await rpc(tx, "post_payment", [f.branch, "RECEIPT", s.customer, null, account, "1000000", new Date().toISOString(),
    "CASH", "Ứng trước trước khi giao", [], "1000000", randomUUID()], finance);
  const so = await salesFixture(tx, qa, s);
  const allocation = await rpc(tx, "upsert_supply_allocation", [so.line, "WAREHOUSE", null, f.warehouse, "1", null, null, randomUUID()]);
  const delivery = await rpc(tx, "create_delivery_from_allocations", [so.so, [{ supply_allocation_id: allocation, planned_base_quantity: "1" }],
    new Date().toISOString(), randomUUID()]);
  const [line] = await tx`select id from public.delivery_lines where delivery_id=${delivery}`;
  await rpc(tx, "assign_delivery", [delivery, null, null, "Xe giả QA", "", 1, randomUUID()]);
  await rpc(tx, "handoff_delivery", [delivery, 2, new Date().toISOString(), randomUUID()]);
  const result = await rpc(tx, "submit_delivery_result", [delivery, "FULL", [{ delivery_line_id: line.id, actual_base_quantity: "1" }],
    "QA", "", "Mạng yếu", null, 3, randomUUID()]);
  const verification = await rpc(tx, "verify_delivery", [result, [{ delivery_line_id: line.id, accepted_base_quantity: "1",
    billable_base_quantity: "1", billing_variance_reason: "" }], 4, randomUUID()]);
  const [ar] = await tx`select id from public.receivable_obligations where delivery_verification_id=${verification}`;
  await tx.unsafe("set local role postgres");
  const [advance] = await tx`select id from public.advances where payment_id=${payment}`;
  return { customer: s.customer, account, payment, advance: advance.id, obligation: ar.id, salesOrder: so.so, delivery };
}
