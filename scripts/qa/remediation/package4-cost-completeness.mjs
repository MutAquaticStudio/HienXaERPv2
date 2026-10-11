import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { argumentsForRun, openQA, stockFixture } from "./native-fixture.mjs";
const args = argumentsForRun(), qa = await openQA(args), { sql, rpc, fixtures: f } = qa;
let observer;
const report = { scope: "G16_COMMITTED_MIXED_WAREHOUSE_DIRECT_COST_GRAIN", phase: args.phase, database: args.database, productionAccess: "NONE", managedAuthTested: false };
try {
  const documents = await sql.begin(async tx => {
    const [{ pid: writerPid }] = await tx`select pg_backend_pid() pid`;
    const a = await stockFixture(tx, qa, "5"), b = await stockFixture(tx, qa, "5");
    const line = stock => ({ ...stock.common, unit_price_vnd: "230000", pricing_rule_id: stock.price,
      pricing_rule_version: 1, price_source_type: "LIST" });
    const so = await rpc(tx, "create_sales_order_draft", [f.branch, a.customer, a.site, null, "Đơn hỗn hợp kiểm tra giá vốn từng dòng", [line(a), line(b)], randomUUID()]);
    await rpc(tx, "confirm_sales_order", [so, randomUUID()]);
    const sales = await tx`select id,material_id from public.sales_order_lines where sales_order_id=${so}`;
    const warehouseLine = sales.find(row => row.material_id === a.material).id, directLine = sales.find(row => row.material_id === b.material).id;
    const warehouseAllocation = await rpc(tx, "upsert_supply_allocation", [warehouseLine, "WAREHOUSE", null, f.warehouse, "5", null, null, randomUUID()]);
    const po = await rpc(tx, "create_direct_purchase_from_sales_line", [directLine, f.supplier, "5", { ...b.common, unit_cost_vnd: "150000",
      purchase_price_rule_id: b.cost, purchase_price_rule_version: 1, price_source_type: "CONTRACT" }, null, randomUUID()]);
    await rpc(tx, "confirm_purchase_order", [po, randomUUID()]);
    const [pol] = await tx`select id from public.purchase_order_lines where purchase_order_id=${po}`;
    const [directAllocation] = await tx`select id from public.supply_allocations where purchase_order_line_id=${pol.id}`;
    const deliveries = [], verifications = [];
    // One SO has two source modes; the existing delivery contract requires separate pickup documents.
    for (const sourceId of [warehouseAllocation, directAllocation.id]) {
      const d = await rpc(tx, "create_delivery_from_allocations", [so, [{ supply_allocation_id: sourceId,
        planned_base_quantity: "5" }], new Date().toISOString(), randomUUID()]);
      const lines = await tx`select id from public.delivery_lines where delivery_id=${d}`;
      await rpc(tx, "assign_delivery", [d, null, null, "Xe ngoài QA từng nguồn", "", 1, randomUUID()]);
      await rpc(tx, "handoff_delivery_actual", [d, 2, new Date().toISOString(), randomUUID(), lines.map(row => ({ delivery_line_id: row.id, loaded_base_quantity: "5" }))]);
      const result = await rpc(tx, "submit_delivery_result", [d, "FULL", lines.map(row => ({ delivery_line_id: row.id, actual_base_quantity: "5" })),
        "QA", "", "Ghi nhận QA", null, 3, randomUUID()]);
      verifications.push(await rpc(tx, "verify_delivery", [result, lines.map(row => ({ delivery_line_id: row.id, accepted_base_quantity: "5",
        billable_base_quantity: "5", billing_variance_reason: "" })), 4, randomUUID()]));
      deliveries.push(d);
    }
    return { so, customer: a.customer, deliveries, verifications, po, purchaseLine: pol.id, writerPid };
  });
  observer = await openQA(args);
  const [{ pid: readerPid }] = await observer.sql`select pg_backend_pid() pid`; assert.notEqual(readerPid, documents.writerPid);
  const upper = new Date(Date.now() + 86400000).toISOString();
  const read = cutoff => observer.sql.begin(tx => observer.rpc(tx, "finance_dashboard_snapshot", [f.branch, "2000-01-01T00:00:00Z", upper, cutoff,
    documents.customer, null, null, "DELIVERY"]));
  const missingCutoff = new Date().toISOString();
  const missing = await read(upper);
  assert.equal(String(missing.revenue.value_vnd), "2300000");
  if (args.phase === "before") {
    assert.equal(missing.gross_profit.quality, "READY");
    assert.equal(String(missing.gross_profit.value_vnd), "1550000");
    report.status = "REPRODUCED_MIXED_COST_FALSE_READY";
  } else {
    assert.equal(missing.gross_profit.quality, "INCOMPLETE"); assert.equal(missing.gross_profit.value_vnd, null);
    if (args.phase !== "seed") {
    await sql.begin(tx => rpc(tx, "verify_supplier_fulfillment", [documents.po,
      [{ purchase_order_line_id: documents.purchaseLine, supplier_quantity: "5" }], null, "NCC nguồn5 đơn vị đã khớp", randomUUID()]));
    const complete = await read(new Date(Date.now() + 86400000).toISOString());
    assert.equal(complete.direct_cost.quality, "READY"); assert.equal(String(complete.direct_cost.value_vnd), "1500000");
    assert.equal(String(complete.gross_profit.value_vnd), "800000");
    const historical = await read(missingCutoff);
    assert.equal(historical.gross_profit.quality, "INCOMPLETE"); assert.equal(historical.gross_profit.value_vnd, null);
    report.complete = complete; report.historicalBeforeSupplierSource = historical; report.status = "PASS_MIXED_COST_SOURCE_COMPLETENESS";
    } else report.status = "PASS_PENDING_COST_BROWSER_SOURCE";
  }
  report.documents = documents; report.readerPid = readerPid; report.missing = missing;
  await writeFile(args.out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, missingQuality: missing.gross_profit.quality, distinctReadbackConnection: true }));
} catch (error) {
  await writeFile(args.out.replace(/\.json$/, "-failure.json"), JSON.stringify({ ...report, status: "FAIL", error: { code: error.code, message: error.message } }, null, 2));
  throw error;
} finally { if (observer) await observer.sql.end({ timeout: 3 }); await sql.end({ timeout: 3 }); }
