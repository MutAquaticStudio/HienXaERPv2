import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { argumentsForRun, openQA, rejected, stockFixture, salesFixture } from "./native-fixture.mjs";

const args = argumentsForRun(), qa = await openQA(args), { sql, rpc, fixtures: f } = qa;
const personas = JSON.parse(await readFile(args.personas, "utf8")).personas;
const rollback = new Error("ROLLBACK_CARGO_CAPACITY_FIXTURE");
const report = { scope: "G13_ACTUAL_CARGO_ACROSS_NONOVERLAPPING_DELIVERIES", phase: args.phase,
  database: args.database, productionAccess: "NONE", managedAuthTested: false, checks: [] };
try {
  if (args.only !== undefined) assert.equal(args.only, "mixed");
  for (const mode of args.only === "mixed" ? [] : ["WAREHOUSE", "SUPPLIER_DIRECT"]) {
    try {
      await sql.begin(async tx => {
        const stock = await stockFixture(tx, qa, "75"), sale = await salesFixture(tx, qa, stock);
        let allocation;
        if (mode === "WAREHOUSE") allocation = await rpc(tx, "upsert_supply_allocation", [sale.line, mode, null, f.warehouse, "75", null, null, randomUUID()]);
        else {
          const po = await rpc(tx, "create_direct_purchase_from_sales_line", [sale.line, f.supplier, "75",
            { ...stock.common, unit_cost_vnd: "150000", purchase_price_rule_id: stock.cost,
              purchase_price_rule_version: 1, price_source_type: "CONTRACT" }, null, randomUUID()]);
          await rpc(tx, "confirm_purchase_order", [po, randomUUID()]);
          const [pol] = await tx`select id from public.purchase_order_lines where purchase_order_id=${po}`;
          await rpc(tx, "verify_supplier_fulfillment", [po, [{ purchase_order_line_id: pol.id, supplier_quantity: "75" }], null, "QA source only", randomUUID()]);
          const [source] = await tx`select id from public.supply_allocations where purchase_order_line_id=${pol.id}`;
          allocation = source.id;
        }
        const vehicle = randomUUID();
        await rpc(tx, "save_catalog_record", ["vehicles", vehicle, f.branch, { code: stock.prefix, plate_number: stock.prefix,
          capacity_quantity: "20", capacity_uom_id: stock.uom, capacity_source_note: "Hồ sơ tải xe giả QA", active: true }, null,
          "Tạo xe riêng cho test tổng hàng đang chở", randomUUID()]);
        async function delivery(slot) {
          const start = new Date(Date.UTC(2190, 0, slot, 8)).toISOString(), end = new Date(Date.UTC(2190, 0, slot, 12)).toISOString();
          const id = await rpc(tx, "create_delivery_from_allocations", [sale.so, [{ supply_allocation_id: allocation,
            planned_base_quantity: "15" }], start, randomUUID()]);
          const [line] = await tx`select id from public.delivery_lines where delivery_id=${id}`;
          await rpc(tx, "assign_delivery_scheduled", [id, personas.worker.employee, vehicle, "", "", 1,
            randomUUID(), start, end], personas.warehouse.subject);
          return { id, line: line.id };
        }
        const a = await delivery(1), b = await delivery(2);
        const load = (d, qty, op = randomUUID()) => rpc(tx, "handoff_delivery_actual", [d.id, 2, new Date().toISOString(), op,
          [{ delivery_line_id: d.line, loaded_base_quantity: qty }]], personas.warehouse.subject);
        await load(a, "14");
        if (args.phase === "before") {
          await load(b, "14");
          await tx.unsafe("set local role postgres");
          const [fact] = await tx`select sum(h.moved_base_quantity)::text loaded,20::text maximum
            from public.delivery_handoff_lines h join public.delivery_lines l on l.id=h.delivery_line_id where l.delivery_id in(${a.id},${b.id})`;
          assert.deepEqual(fact, { loaded: "28.000000", maximum: "20" });
          report.checks.push({ name: mode + "_28_ON_20_WITH_NONOVERLAPPING_SCHEDULES", status: "REPRODUCED", fact });
        } else {
          const actualRejected = await rejected(tx, () => load(b, "14"), "vehicle_actual_cargo_capacity_exceeded", "23514");
          const legacyRejected = await rejected(tx, sp => rpc(sp, "handoff_delivery", [b.id, 2, new Date().toISOString(), randomUUID()],
            personas.warehouse.subject), "vehicle_actual_cargo_capacity_exceeded", "23514");
          await tx.unsafe("set local role postgres");
          const [untouched] = await tx`select execution_state,version,
            (select count(*)::int from public.delivery_handoffs where delivery_id=${b.id}) handoffs from public.deliveries where id=${b.id}`;
          assert.deepEqual(untouched, { execution_state: "ASSIGNED", version: 2, handoffs: 0 });
          const result = await rpc(tx, "submit_delivery_result", [a.id, "PARTIAL", [{ delivery_line_id: a.line, actual_base_quantity: "14" }],
            "QA", "", "Ghi nhận QA", null, 3, randomUUID()], personas.warehouse.subject);
          const verified = await rpc(tx, "verify_delivery", [result, [{ delivery_line_id: a.line, accepted_base_quantity: "13",
            billable_base_quantity: "13", billing_variance_reason: "" }], 4, randomUUID()], personas.warehouse.subject);
          const [vl] = await tx`select id from public.delivery_verification_lines where delivery_verification_id=${verified}`;
          const bOp = randomUUID(), bTime = new Date().toISOString(), bLoad = [{ delivery_line_id: b.line, loaded_base_quantity: "14" }];
          const bHandoff = await rpc(tx, "handoff_delivery_actual", [b.id, 2, bTime, bOp, bLoad], personas.warehouse.subject);
          assert.equal(await rpc(tx, "handoff_delivery_actual", [b.id, 2, bTime, bOp, bLoad], personas.warehouse.subject), bHandoff);
          const c = await delivery(3), d = await delivery(4);
          await load(c, "5"); // One unresolved + fourteen + five = the configured maximum twenty.
          const residualRejected = await rejected(tx, () => load(d, "1"), "vehicle_actual_cargo_capacity_exceeded", "23514");
          await tx.unsafe("set local role postgres");
          const [old] = await tx`select to_jsonb(v) value from public.vehicles v where id=${vehicle}`;
          const expected = Object.fromEntries(["code", "plate_number", "capacity_quantity", "capacity_uom_id", "capacity_source_note", "active"].map(key => [key, old.value[key]]));
          const catalogRejected = await rejected(tx, sp => rpc(sp, "save_catalog_record", ["vehicles", vehicle, f.branch,
            { ...expected, capacity_quantity: "25" }, expected, "Không đổi tải khi còn hàng QA", randomUUID()]), undefined);
          assert.ok(["vehicle_capacity_locked_by_assignment", "vehicle_capacity_locked_by_cargo"].includes(catalogRejected.message));
          const returnCase = await rpc(tx, "open_return_case", [vl.id, "TRANSIT_REMAINDER", "1", "Một đơn vị còn trên xe", null, randomUUID()], personas.warehouse.subject);
          const resolveOp = randomUUID();
          await tx.unsafe("set local role postgres");
          await tx.unsafe(`create function pg_temp.fail_after_cargo_return() returns trigger language plpgsql as $$
            begin if new.source_return_case_id is not null and new.location_kind='WAREHOUSE'
              then raise exception 'QA_AFTER_PHYSICAL_CARGO_RETURN' using errcode='P0001';end if;return new;end $$;
            create trigger qa_fail_cargo_return after insert on public.inventory_movements
              for each row execute function pg_temp.fail_after_cargo_return();`).simple();
          const returnFault = await rejected(tx, sp => rpc(sp, "resolve_return_case", [returnCase, "RETURNED", f.warehouse,
            "Đã đưa một đơn vị về kho", null, 1, resolveOp], personas.warehouse.subject), "QA_AFTER_PHYSICAL_CARGO_RETURN", "P0001");
          await tx.unsafe("set local role postgres");
          const [returnRollback] = await tx`select state,
            (select count(*)::int from public.inventory_movements where source_return_case_id=${returnCase}) movements,
            (select count(*)::int from public.command_receipts where operation_id=${resolveOp}) receipts,
            (select count(*)::int from public.audit_events where trace_id=${resolveOp}) audits from public.return_cases where id=${returnCase}`;
          assert.deepEqual(returnRollback, { state: "OPEN", movements: 0, receipts: 0, audits: 0 });
          await tx.unsafe("drop trigger qa_fail_cargo_return on public.inventory_movements");
          const resolveArgs = [returnCase, "RETURNED", f.warehouse, "Đã đưa một đơn vị về kho", null, 1, resolveOp];
          await rpc(tx, "resolve_return_case", resolveArgs, personas.warehouse.subject);
          await rpc(tx, "resolve_return_case", resolveArgs, personas.warehouse.subject);
          await load(d, "1"); // Residual physically resolved; fourteen + five + one = twenty.
          await tx.unsafe("set local role postgres");
          const [directSource] = await tx`select
            (select count(*)::int from public.inventory_movements where source_return_case_id=${returnCase} and location_kind='IN_TRANSIT') transit,
            (select sum(base_quantity_delta)::text from public.inventory_movements where source_return_case_id=${returnCase} and location_kind='WAREHOUSE') returned,
            (select sum(amount_delta_vnd)::text from public.direct_cost_entries where return_case_id=${returnCase}) costCorrection`;
          assert.equal(directSource.transit, mode === "SUPPLIER_DIRECT" ? 0 : 1);
          assert.equal(directSource.returned, "1.000000");
          assert.equal(directSource.costcorrection, mode === "SUPPLIER_DIRECT" ? "-150000" : null);
          let remainingVerification;
          for (const [source, actual, accepted] of [[b, "14", "14"], [c, "5", "4"], [d, "1", "1"]]) {
            const resultId = await rpc(tx, "submit_delivery_result", [source.id, "PARTIAL", [{ delivery_line_id: source.line, actual_base_quantity: actual }],
              "QA", "", "Ghi nhận QA", null, 3, randomUUID()], personas.warehouse.subject);
            const v = await rpc(tx, "verify_delivery", [resultId, [{ delivery_line_id: source.line, accepted_base_quantity: accepted,
              billable_base_quantity: accepted, billing_variance_reason: "" }], 4, randomUUID()], personas.warehouse.subject);
            if (source.id === c.id) remainingVerification = v;
          }
          const verifiedCargoChange = await rejected(tx, sp => rpc(sp, "save_catalog_record", ["vehicles", vehicle, f.branch,
            { ...expected, capacity_quantity: "25" }, expected, "Còn hàng dù mọi phiếu đã VERIFIED", randomUUID()]), "vehicle_capacity_locked_by_cargo", "PT409");
          const [remainingLine] = await tx`select id from public.delivery_verification_lines where delivery_verification_id=${remainingVerification}`;
          const loss = await rpc(tx, "open_return_case", [remainingLine.id, "TRANSIT_LOSS", "1", "Một đơn vị mất đã xác minh", null, randomUUID()], personas.warehouse.subject);
          await rpc(tx, "resolve_return_case", [loss, "LOSS_APPROVED", null, "Duyệt mất một đơn vị trên QA", null, 1, randomUUID()], personas.warehouse.subject);
          await tx.unsafe("set local role postgres");
          const [lossSource] = await tx`select
            (select count(*)::int from public.inventory_movements where source_return_case_id=${loss}) movements,
            (select count(*)::int from public.direct_cost_entries where return_case_id=${loss}) costs`;
          assert.deepEqual(lossSource, { movements: mode === "SUPPLIER_DIRECT" ? 0 : 1, costs: mode === "SUPPLIER_DIRECT" ? 0 : 1 });
          await rpc(tx, "save_catalog_record", ["vehicles", vehicle, f.branch, { ...expected, capacity_quantity: "25" }, expected,
            "Đã xử lý hết hàng thực trên xe QA", randomUUID()]);
          report.checks.push({ name: mode + "_ACTUAL_TOTAL_AND_VERIFIED_RESIDUAL", status: "PASS", actualRejected, legacyRejected,
            residualRejected, catalogRejected, verifiedCargoChange, untouched, returnFault, returnRollback, directSource, lossSource,
            retryOneEffect: true, permitsAfterPhysicalResolution: true, permitsCapacityChangeAfterNoCargo: true });
        }
        throw rollback;
      });
    } catch (error) { if (error !== rollback) throw error; }
  }
  if (args.phase !== "before") {
    try {
      await sql.begin(async tx => {
        const aStock = await stockFixture(tx, qa, "45"), bStock = await stockFixture(tx, qa, "12");
        const aSale = await salesFixture(tx, qa, aStock), bSale = await salesFixture(tx, qa, bStock);
        const aSource = await rpc(tx, "upsert_supply_allocation", [aSale.line, "WAREHOUSE", null, f.warehouse, "45", null, null, randomUUID()]);
        const bSource = await rpc(tx, "upsert_supply_allocation", [bSale.line, "WAREHOUSE", null, f.warehouse, "12", null, null, randomUUID()]);
        const vehicle = randomUUID(), conversion = randomUUID();
        await rpc(tx, "save_catalog_record", ["vehicles", vehicle, f.branch, { code: aStock.prefix, plate_number: aStock.prefix,
          capacity_quantity: "20", capacity_uom_id: aStock.uom, capacity_source_note: "Hồ sơ tải hỗn hợp QA", active: true }, null,
          "Tạo xe kiểm thử quy đổi có căn cứ", randomUUID()]);
        await rpc(tx, "save_catalog_record", ["conversions", conversion, f.branch, { material_id: bStock.material,
          from_uom_id: bStock.uom, to_uom_id: aStock.uom, numerator: "2", denominator: "1", conversion_type: "MEASURED",
          source_note: "Phép đo giả QA: mỗi đơn vị B chiếm hai đơn vị sức chứa A", rounding_scale: 6, rounding_mode: "HALF_UP",
          settlement_allowed: false, active: true }, null, "Căn cứ đo riêng của vật tư QA", randomUUID()]);
        async function plan(sale, source, quantity, slot) {
          const start = new Date(Date.UTC(2198, 0, slot, 8)).toISOString(), end = new Date(Date.UTC(2198, 0, slot, 12)).toISOString();
          const id = await rpc(tx, "create_delivery_from_allocations", [sale.so, [{ supply_allocation_id: source, planned_base_quantity: quantity }], start, randomUUID()]);
          const [line] = await tx`select id from public.delivery_lines where delivery_id=${id}`;
          await rpc(tx, "assign_delivery_scheduled", [id, personas.worker.employee, vehicle, "", "", 1, randomUUID(), start, end], personas.warehouse.subject);
          return { id, line: line.id };
        }
        const a = await plan(aSale, aSource, "15", 1), b = await plan(bSale, bSource, "4", 2), c = await plan(aSale, aSource, "1", 3);
        const load = (d, quantity) => rpc(tx, "handoff_delivery_actual", [d.id, 2, new Date().toISOString(), randomUUID(),
          [{ delivery_line_id: d.line, loaded_base_quantity: quantity }]], personas.warehouse.subject);
        await load(a, "14");
        const measuredOverload = await rejected(tx, () => load(b, "4"), "vehicle_actual_cargo_capacity_exceeded", "23514");
        await load(b, "3"); // 14 A + 3 B * measured ratio 2 = 20; no raw mixed-unit addition.
        await rpc(tx, "save_catalog_record", ["conversions", conversion, f.branch, { active: false }, { active: true },
          "Tạm ngừng căn cứ đo QA", randomUUID()]);
        const missingCargoBasis = await rejected(tx, () => load(c, "1"), "vehicle_capacity_conversion_missing", "23514");
        await rpc(tx, "save_catalog_record", ["conversions", conversion, f.branch, { active: true }, { active: false },
          "Khôi phục căn cứ đo QA", randomUUID()]);
        const totalExcess = await rejected(tx, () => load(c, "1"), "vehicle_actual_cargo_capacity_exceeded", "23514");
        report.checks.push({ name: "MIXED_UNITS_USE_RECORDED_MEASUREMENT_AND_REQUIRE_EXISTING_CARGO_BASIS", status: "PASS",
          measuredOverload, missingCargoBasis, totalExcess, acceptedQuantity: "14 A + 3 B at 2:1 = 20 A" });
        throw rollback;
      });
    } catch (error) { if (error !== rollback) throw error; }
  }
  report.rolledBack = true;
  report.status = args.phase === "before" ? "REPRODUCED_G13_TOTAL_CARGO" : "PASS_G13_TOTAL_CARGO";
  await writeFile(args.out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length }));
} catch (error) {
  await writeFile(args.out.replace(/\.json$/, "-failure.json"), JSON.stringify({ ...report, status: "FAIL", error: { code: error.code, message: error.message } }, null, 2));
  throw error;
} finally { await sql.end({ timeout: 3 }); }
