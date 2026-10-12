import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { argumentsForRun, openQA, stockFixture, salesFixture } from "./native-fixture.mjs";
const args = argumentsForRun(), qa = await openQA(args), { sql, rpc, fixtures: f } = qa;
const personas = JSON.parse(await readFile(args.personas, "utf8")).personas;
const rollback = new Error("ROLLBACK_DIRECT_BOARD_FIXTURE");
const report = { scope: "G10_DIRECT_UNREPORTED_CARGO_BOARD", phase: args.phase, database: args.database, productionAccess: "NONE" };
try {
  try {
    await sql.begin(async tx => {
      const stock = await stockFixture(tx, qa, "15"), sale = await salesFixture(tx, qa, stock);
      const po = await rpc(tx, "create_direct_purchase_from_sales_line", [sale.line, f.supplier, "15",
        { ...stock.common, unit_cost_vnd: "150000", purchase_price_rule_id: stock.cost, purchase_price_rule_version: 1,
          price_source_type: "CONTRACT" }, null, randomUUID()]);
      await rpc(tx, "confirm_purchase_order", [po, randomUUID()]);
      const [pol] = await tx`select id from public.purchase_order_lines where purchase_order_id=${po}`;
      await rpc(tx, "verify_supplier_fulfillment", [po, [{ purchase_order_line_id: pol.id, supplier_quantity: "15" }], null, "QA", randomUUID()]);
      const [source] = await tx`select id from public.supply_allocations where purchase_order_line_id=${pol.id}`;
      const d = await rpc(tx, "create_delivery_from_allocations", [sale.so, [{ supply_allocation_id: source.id, planned_base_quantity: "15" }],
        new Date().toISOString(), randomUUID()]);
      const [line] = await tx`select id from public.delivery_lines where delivery_id=${d}`;
      await rpc(tx, "assign_delivery", [d, null, null, "Xe ngoài QA", "", 1, randomUUID()]);
      await rpc(tx, "handoff_delivery_actual", [d, 2, new Date().toISOString(), randomUUID(),
        [{ delivery_line_id: line.id, loaded_base_quantity: "14" }]], personas.warehouse.subject);
      const result = await rpc(tx, "submit_delivery_result", [d, "PARTIAL", [{ delivery_line_id: line.id, actual_base_quantity: "13" }],
        "QA", "", "Báo 13 trên lượng lấy14", null, 3, randomUUID()], personas.warehouse.subject);
      const verification = await rpc(tx, "verify_delivery", [result, [{ delivery_line_id: line.id, accepted_base_quantity: "13",
        billable_base_quantity: "13", billing_variance_reason: "" }], 4, randomUUID()], personas.warehouse.subject);
      await tx.unsafe("set local role postgres");
      const [before] = await tx`select private.delivery_has_unresolved_exception(${d}) flagged`;
      assert.equal(before.flagged, args.phase !== "before");
      report.beforeResolution = before;
      if (args.phase !== "before") {
        const [vl] = await tx`select id from public.delivery_verification_lines where delivery_verification_id=${verification}`;
        const caseId = await rpc(tx, "open_return_case", [vl.id, "TRANSIT_REMAINDER", "1", "Một đơn vị thực chưa giao", null, randomUUID()], personas.warehouse.subject);
        await rpc(tx, "resolve_return_case", [caseId, "RETURNED", f.warehouse, "Đã nhận về kho trên QA", null, 1, randomUUID()], personas.warehouse.subject);
        await tx.unsafe("set local role postgres");
        const [after] = await tx`select private.delivery_has_unresolved_exception(${d}) flagged,
          (select count(*)::int from public.inventory_movements where delivery_id=${d}) syntheticTransitRows`;
        assert.deepEqual(after, { flagged: false, synthetictransitrows: 0 });
        report.afterResolution = after;
      }
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  report.status = args.phase === "before" ? "REPRODUCED_DIRECT_CARGO_BOARD_GAP" : "PASS_DIRECT_CARGO_BOARD";
  report.rolledBack = true;
  await writeFile(args.out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status }));
} finally { await sql.end({ timeout: 3 }); }
