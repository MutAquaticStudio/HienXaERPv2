import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { argumentsForRun, openQA, salesFixture, stockFixture } from "./native-fixture.mjs";

const args = argumentsForRun();
const qa = await openQA(args);
const { sql, fixtures: f, rpc } = qa;
try {
  const [{ pid: writerPid }] = await sql`select pg_backend_pid() pid`;
  const documents = await sql.begin(async (tx) => {
    const stock = await stockFixture(tx, qa);
    const staleCount = await rpc(tx, "open_stock_count", [f.branch, f.warehouse, stock.cutoff, randomUUID()]);
    await rpc(tx, "record_stock_count_line", [staleCount, stock.material, "15", "150000", "QA chênh lệch cần đối chiếu", null, 1, randomUUID()]);
    const sales = await salesFixture(tx, qa, stock);
    const allocation = await rpc(tx, "upsert_supply_allocation", [sales.line, "WAREHOUSE", null, f.warehouse, "45", null, null, randomUUID()]);
    const delivery = await rpc(tx, "create_delivery_from_allocations", [sales.so, [{ supply_allocation_id: allocation, planned_base_quantity: "45" }], new Date().toISOString(), randomUUID()]);
    await rpc(tx, "assign_delivery", [delivery, null, null, "Nhà xe QA", "000", 1, randomUUID()]);
    await rpc(tx, "handoff_delivery", [delivery, 2, new Date().toISOString(), randomUUID()]);
    const costStock = await stockFixture(tx, qa);
    const costSales = await salesFixture(tx, qa, costStock);
    const costAllocation = await rpc(tx, "upsert_supply_allocation", [costSales.line, "WAREHOUSE", null, f.warehouse, "45", null, null, randomUUID()]);
    const costDelivery = await rpc(tx, "create_delivery_from_allocations", [costSales.so, [{ supply_allocation_id: costAllocation, planned_base_quantity: "15" }], new Date().toISOString(), randomUUID()]);
    const [costLine] = await tx`select id from public.delivery_lines where delivery_id=${costDelivery}`;
    await rpc(tx, "assign_delivery", [costDelivery, null, null, "Nhà xe QA", "000", 1, randomUUID()]);
    await rpc(tx, "handoff_delivery", [costDelivery, 2, new Date().toISOString(), randomUUID()]);
    await rpc(tx, "mark_delivery_arrived", [costDelivery, 3, randomUUID()]);
    const result = await rpc(tx, "submit_delivery_result", [costDelivery, "FULL", [{ delivery_line_id: costLine.id, actual_base_quantity: "15" }], "Người nhận QA", "", null, null, 4, randomUUID()]);
    const verification = await rpc(tx, "verify_delivery", [result, [{ delivery_line_id: costLine.id, accepted_base_quantity: "15", billable_base_quantity: "15", billing_variance_reason: "" }], 5, randomUUID()]);
    const validStock = await stockFixture(tx, qa);
    const validCount = await rpc(tx, "open_stock_count", [f.branch, f.warehouse, validStock.cutoff, randomUUID()]);
    await rpc(tx, "record_stock_count_line", [validCount, validStock.material, "15", "150000", "QA chênh lệch có căn cứ", null, 1, randomUUID()]);
    return { branch: f.branch, staleCount, staleMaterial: stock.material, staleDelivery: delivery,
      costDelivery, costLine: costLine.id, verification, validCount, validMaterial: validStock.material };
  });
  // A fresh connection after COMMIT, not merely a second transaction on the writer.
  const reader = await openQA(args);
  const [{ pid: readerPid }] = await reader.sql`select pg_backend_pid() pid`;
  assert.notEqual(readerPid, writerPid);
  const [readback] = await reader.sql`select (select state from public.stock_counts where id=${documents.staleCount}) stale_state,
    (select sum(base_quantity_delta)::text from public.inventory_movements where warehouse_id=${f.warehouse} and material_id=${documents.staleMaterial}) warehouse_quantity,
    (select execution_state from public.deliveries where id=${documents.costDelivery}) delivery_state,
    (select inventory_cost_vnd::text from public.delivery_verification_lines where delivery_verification_id=${documents.verification}) cost_vnd`;
  assert.equal(readback.stale_state, "OPEN");
  assert.equal(readback.warehouse_quantity, "0.000000");
  assert.equal(readback.delivery_state, "VERIFIED");
  assert.equal(readback.cost_vnd, "2250000");
  await reader.sql.end({ timeout: 3 });
  await writeFile(args.out, JSON.stringify({ scope: "COMMITTED_SYNTHETIC_QA_CANONICAL_COMMANDS", database: args.database,
    productionAccess: "NONE", documents, writerPid, readerPid, independentCommittedReadback: readback, managedAuthTested: false }, null, 2));
  console.log(JSON.stringify({ committed: true, independentReadback: true, syntheticQaOnly: true }));
} finally { await sql.end({ timeout: 3 }); }
