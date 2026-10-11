import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { argumentsForRun, openQA, stockFixture, salesFixture, rejected } from "./native-fixture.mjs";

const args = argumentsForRun(), qa = await openQA(args), { sql, rpc, fixtures: f } = qa;
const rollback = new Error("ROLLBACK_FINAL_RETURN_VALUE");
let facts;
try {
  try {
    await sql.begin(async tx => {
      const quantity = args.mode === "direct-multiple" ? "45" : "1.000003", direct = args.mode?.startsWith("direct"), stock = await stockFixture(tx, qa, quantity, { prepareOnly: direct });
      const sale = await salesFixture(tx, qa, stock);
      let allocation;
      if (direct) {
        const po = await rpc(tx, "create_direct_purchase_from_sales_line", [sale.line, f.supplier, quantity,
          { ...stock.common, unit_cost_vnd: "150000", purchase_price_rule_id: stock.cost, purchase_price_rule_version: 1, price_source_type: "CONTRACT" }, null, randomUUID()]);
        await rpc(tx, "confirm_purchase_order", [po, randomUUID()]);
        const [pl] = await tx`select id from public.purchase_order_lines where purchase_order_id=${po}`;
        const [sa] = await tx`select id from public.supply_allocations where purchase_order_line_id=${pl.id}`;
        allocation = sa.id;
        await rpc(tx, "verify_supplier_fulfillment", [po, [{ purchase_order_line_id: pl.id, supplier_quantity: quantity }], null, "Nguồn NCC kiểm giá vốn trả", randomUUID()]);
      } else allocation = await rpc(tx, "upsert_supply_allocation", [sale.line, "WAREHOUSE", null, f.warehouse, quantity, null, null, randomUUID()]);
      const cases = [], sources = [];
      const batches = args.mode === "direct-multiple" ? ["15.000003", "15.000003", "14.999994"] : [quantity];
      for (const batch of batches) {
        const delivery = await rpc(tx, "create_delivery_from_allocations", [sale.so, [{ supply_allocation_id: allocation, planned_base_quantity: batch }], new Date().toISOString(), randomUUID()]);
        const [line] = await tx`select id from public.delivery_lines where delivery_id=${delivery}`;
        await rpc(tx, "assign_delivery", [delivery, null, null, "Nhà xe QA nguồn trả nhiều đợt", "", 1, randomUUID()]);
        await rpc(tx, "handoff_delivery_actual", [delivery, 2, new Date().toISOString(), randomUUID(), [{ delivery_line_id: line.id, loaded_base_quantity: batch }]]);
        const result = await rpc(tx, "submit_delivery_result", [delivery, "FULL", [{ delivery_line_id: line.id, actual_base_quantity: batch }], "QA", "", "Nguồn trả nhiều đợt", null, 3, randomUUID()]);
        const verification = await rpc(tx, "verify_delivery", [result, [{ delivery_line_id: line.id, accepted_base_quantity: batch, billable_base_quantity: batch }], 4, randomUUID()]);
        await tx.unsafe("set local role postgres");
        const [verified] = await tx`select id,inventory_cost_vnd::text value,inventory_unit_cost_vnd_per_base::text unit from public.delivery_verification_lines where delivery_verification_id=${verification}`;
        sources.push(verified);
        for (const part of batches.length > 1 ? [batch] : ["0.1", "0.200004", "0.699999"]) {
          const id = await rpc(tx, "open_return_case", [verified.id, "CUSTOMER_RETURN", part, "Nhận lại từng phần từ cùng dòng nguồn", null, randomUUID()]);
          const input = [id, "RETURNED", f.warehouse, "Đã nhận đúng lượng thực trả", null, 1, randomUUID()];
          if (args.null_reason === "before") {
            input[3] = null;
            await rpc(tx, "resolve_return_case", input);
            await tx.unsafe("set local role postgres");
            const [event] = await tx`select reason from public.audit_events where trace_id=${input.at(-1)}`;
            assert.equal(event.reason, null); facts = { nullReasonWasAccepted: true, successfulAuditReason: event.reason }; throw rollback;
          }
          if (args.null_reason === "after" && cases.length === 0) {
            await rejected(tx, sp => rpc(sp, "resolve_return_case", [...input.slice(0,3), null, ...input.slice(4)]), "return_resolution_reason_required", "22023");
            await rejected(tx, sp => rpc(sp, "resolve_return_case", [...input.slice(0,3), "x".repeat(501), ...input.slice(4)]), "return_resolution_reason_required", "22023");
          }

          if (args.fault === "true" && cases.length === 0) {
            await tx.unsafe("set local role postgres");
            await tx.unsafe("create function pg_temp.fail_return_value() returns trigger language plpgsql as $$begin raise exception 'qa_return_value_fault' using errcode='P0001';end$$;create trigger qa_fail_return_value after insert on public.inventory_movements for each row when(new.source_return_case_id is not null) execute function pg_temp.fail_return_value();").simple();
            await rejected(tx, sp => rpc(sp, "resolve_return_case", input), "qa_return_value_fault", "P0001");
            await tx.unsafe("set local role postgres");
            const [failed] = await tx`select (select count(*)::int from public.inventory_movements where source_return_case_id=${id}) movements,
              (select count(*)::int from public.command_receipts where operation_id=${input.at(-1)}) receipts,
              (select count(*)::int from public.audit_events where trace_id=${input.at(-1)}) audits`;
            assert.deepEqual(failed, { movements: 0, receipts: 0, audits: 0 });
            await tx.unsafe("drop trigger qa_fail_return_value on public.inventory_movements");
          }
          if (args.defer !== "true") {
            await rpc(tx, "resolve_return_case", input);
            assert.equal(await rpc(tx, "resolve_return_case", input), id);
          }
          cases.push(id);
        }
      }
      if (args.defer === "true") { facts = { sale, material: stock.material, cases, quantity }; return; }
      await tx.unsafe("set local role postgres");
      const [returned] = await tx`select sum(base_quantity_delta)::text quantity,sum(inventory_value_delta_vnd)::text value
        from public.inventory_movements where source_return_case_id=any(${cases}) and location_kind='WAREHOUSE'`;
      assert.equal(returned.quantity, batches.length > 1 ? "45.000000" : "1.000003");
      const [cost] = await tx`select sum(amount_delta_vnd)::text value from public.direct_cost_entries where sales_order_id=${sale.so}`;
      assert.equal(cost.value, args.phase === "before" ? "-1" : "0");
      facts = { mode: direct ? "DIRECT" : "WAREHOUSE", sources, returned, remainingCost: cost.value, independentExpectedValue: batches.length > 1 ? "6750000" : "150000", cases: cases.length, faultRollbackTested: args.fault === "true" };
      if (args.phase === "before") assert.equal(returned.value, "150001");
      else assert.equal(returned.value, facts.independentExpectedValue);
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  await writeFile(args.out, JSON.stringify({ scope: "G03_CUSTOMER_PHYSICAL_RETURN_CUMULATIVE_SOURCE_VALUE", phase: args.phase,
    status: args.null_reason === "before" ? "REPRODUCED_NULL_RETURN_REASON_SUCCESS_AUDIT" : args.defer === "true" ? "PREPARED_NATIVE_SOURCES" : args.phase === "before" ? "REPRODUCED_ONE_VND_VALUE_CREATION" : "PASS", facts, rolledBack: args.defer !== "true", productionAccess: "NONE" }, null, 2));
  console.log(JSON.stringify({ phase: args.phase, facts }));
} finally { await sql.end({ timeout: 3 }); }
