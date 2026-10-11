import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { argumentsForRun, openQA, rejected, salesFixture, stockFixture } from "./native-fixture.mjs";

const args = argumentsForRun();
const qa = await openQA(args);
const { sql, fixtures: f, rpc } = qa;
const personas = JSON.parse(await readFile(args.personas, "utf8")).personas;
const [{ id: ownerEmployee }] = await sql`select id from public.employees where auth_user_id=${f.owner} and active`;
const rollback = new Error("ROLLBACK_PACKAGE3_FIXTURE");
const report = { scope: "ASSIGNMENT_SCHEDULE_CAPACITY_ACTUAL_LOADING", database: args.database,
  managedAuthTested: false, productionAccess: "NONE", checks: [] };
const start = "2099-01-01T08:00:00Z", end = "2099-01-01T12:00:00Z";
async function scenario(name, body) {
  try {
    await sql.begin(async tx => {
      const stock = await stockFixture(tx, qa, "45");
      const sales = await salesFixture(tx, qa, stock);
      const allocation = await rpc(tx, "upsert_supply_allocation", [sales.line, "WAREHOUSE", null, f.warehouse, "45", null, null, randomUUID()]);
      await tx.unsafe("set local role postgres");
      const vehicle = randomUUID();
      await rpc(tx, "save_catalog_record", ["vehicles", vehicle, f.branch, { code: stock.prefix,
        plate_number: stock.prefix, capacity_quantity: "20", capacity_uom_id: stock.uom,
        capacity_source_note: "Hồ sơ sức chứa tổng hợp QA; không phải xe doanh nghiệp", active: true }, null,
        "Tạo xe kiểm thử cục bộ có căn cứ tải", randomUUID()]);
      async function delivery(quantity = "15") {
        const id = await rpc(tx, "create_delivery_from_allocations", [sales.so,
          [{ supply_allocation_id: allocation, planned_base_quantity: quantity }], start, randomUUID()]);
        const [line] = await tx`select id from public.delivery_lines where delivery_id=${id}`;
        return { id, line: line.id };
      }
      const assign = (id, employee, version = 1, operation = randomUUID(), from = start, until = end) => rpc(tx,
        "assign_delivery_scheduled", [id, employee, vehicle, "", "", version, operation, from, until], personas.warehouse.subject);
      report.checks.push({ name, status: "PASS", ...await body(tx, { stock, sales, allocation, vehicle, delivery, assign }) });
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
}
try {
  await scenario("G06_REASSIGN_PUBLISHED_WORK_AND_REVOKE_OLD_ASSIGNEE", async (tx, x) => {
    const d = await x.delivery();
    await x.assign(d.id, personas.worker.employee);
    const work = await rpc(tx, "publish_work_item", [f.branch, "DELIVERY", d.id, "DIRECT", personas.worker.employee, randomUUID()], personas.warehouse.subject);
    const oldGps = await rpc(tx, "start_gps_tracking", [d.id, 1, randomUUID()], personas.worker.subject);
    const operation = randomUUID();
    await rejected(tx, () => x.assign(d.id, personas.warehouse.employee, 2), "delivery_employee_cannot_report_work", "23503");
    await x.assign(d.id, ownerEmployee, 2, operation);
    await x.assign(d.id, ownerEmployee, 2, operation);
    const [facts] = await tx`select d.version delivery_version,w.version work_version,w.execution_state work_state,
      da.employee_id delivery_employee,wa.employee_id work_employee,
      (select count(*)::int from public.delivery_assignments where delivery_id=d.id) assignments
      from public.deliveries d join public.work_items w on w.delivery_id=d.id
      join public.delivery_assignments da on da.delivery_id=d.id and da.superseded_at is null
      join public.work_item_assignments wa on wa.work_item_id=w.id and wa.superseded_at is null where d.id=${d.id}`;
    assert.equal(facts.delivery_employee, ownerEmployee);
    assert.equal(facts.work_employee, ownerEmployee);
    assert.equal(facts.assignments, 2);
    await tx.unsafe("set local role postgres");
    const [gpsState] = await tx`select status,stop_reason from public.gps_tracking_sessions where id=${oldGps}`;
    assert.deepEqual(gpsState, { status: "REVOKED", stop_reason: "assignment_superseded" });
    await rejected(tx, sp => rpc(sp, "start_gps_tracking", [d.id, 1, randomUUID()], personas.worker.subject), "gps_assignment_not_active", "42501");
    const newGps = await rpc(tx, "start_gps_tracking", [d.id, 2, randomUUID()], f.owner);
    assert.notEqual(oldGps, newGps);
    await tx.unsafe("set local role postgres");
    await rejected(tx, sp => sp`update public.work_item_assignments set employee_id=${personas.worker.employee}
      where work_item_id=${work} and superseded_at is null`, "work_assignment_history_immutable", "55000");
    const oldActor = await rejected(tx, sp => rpc(sp, "start_work_item", [work, facts.work_version, randomUUID()], personas.worker.subject), "not_current_assignee", "42501");
    await rpc(tx, "start_work_item", [work, facts.work_version, randomUUID()], f.owner);
    const afterStart = await rejected(tx, () => x.assign(d.id, personas.worker.employee, 3), "delivery_reassignment_after_work_started_forbidden", "PT409");
    return { facts, oldActor, afterStart, gpsState, newAssigneeGpsSession: "PASS" };
  });
  await scenario("G13_COLLISION_BEFORE_PUBLISH_CAPACITY_AND_WINDOW", async (tx, x) => {
    const a = await x.delivery(), b = await x.delivery();
    await x.assign(a.id, personas.worker.employee);
    await tx.unsafe("set local role postgres");
    const [rawVehicle] = await tx`select to_jsonb(v) value from public.vehicles v where id=${x.vehicle}`;
    const oldVehicle = rawVehicle.value;
    const catalogExpected = Object.fromEntries(["code", "plate_number", "capacity_quantity", "capacity_uom_id", "capacity_source_note", "active"].map(key => [key, oldVehicle[key]]));
    await rpc(tx, "save_catalog_record", ["vehicles", x.vehicle, f.branch, { ...catalogExpected, capacity_quantity: "20",
      capacity_source_note: "Xác minh lại hồ sơ xe; giữ nguyên sức chứa" }, catalogExpected, "Xác minh căn cứ khi phiếu đang mở", randomUUID()]);
    const lockedChange = await rejected(tx, sp => rpc(sp, "save_catalog_record", ["vehicles", x.vehicle, f.branch,
      { capacity_quantity: "21", capacity_uom_id: x.stock.uom, capacity_source_note: "Thử thay tải khi xe đã phân", active: true },
      { capacity_quantity: 20, capacity_uom_id: x.stock.uom, capacity_source_note: "Xác minh lại hồ sơ xe; giữ nguyên sức chứa", active: true },
      "Phải từ chối thay sức chứa xe đang bận", randomUUID()]), "vehicle_capacity_locked_by_assignment", "PT409");
    const collision = await rejected(tx, () => x.assign(b.id, personas.worker.employee), "work_resource_schedule_collision", "23P01");
    const badWindow = await rejected(tx, () => x.assign(b.id, personas.worker.employee, 1, randomUUID(), start, start), "delivery_schedule_window_required", "22023");
    await tx.unsafe("set local role postgres");
    await tx`update public.vehicles set capacity_quantity=10 where id=${x.vehicle}`;
    const overload = await rejected(tx, () => x.assign(b.id, personas.worker.employee, 1, randomUUID(), end, "2099-01-01T16:00:00Z"), "vehicle_capacity_exceeded", "23514");
    await tx.unsafe("set local role postgres");
    await tx`update public.vehicles set capacity_quantity=20,capacity_uom_id=${f.uom} where id=${x.vehicle}`;
    const missingConversion = await rejected(tx, () => x.assign(b.id, personas.worker.employee, 1, randomUUID(), end, "2099-01-01T16:00:00Z"), "vehicle_capacity_conversion_missing", "23514");
    await tx.unsafe("set local role postgres");
    await tx`update public.vehicles set capacity_uom_id=${x.stock.uom} where id=${x.vehicle}`;
    await x.assign(b.id, personas.worker.employee, 1, randomUUID(), end, "2099-01-01T16:00:00Z");
    return { collision, badWindow, overload, missingConversion, lockedChange, existingEvidenceConfirmation: "PASS", nonOverlappingAssignment: "PASS" };
  });
  await scenario("G14_ACTUAL14_PLAN15_CUSTODY_REMAINING_SOURCE_AND_G10_BOARD", async (tx, x) => {
    const d = await x.delivery();
    await x.assign(d.id, personas.worker.employee);
    const loaded = [{ delivery_line_id: d.line, loaded_base_quantity: "14" }];
    const operation = randomUUID(), when = new Date().toISOString();
    await rpc(tx, "handoff_delivery_actual", [d.id, 2, when, operation, loaded], personas.warehouse.subject);
    await rpc(tx, "handoff_delivery_actual", [d.id, 2, when, operation, loaded], personas.warehouse.subject);
    // Privileged observation only; every business write above uses the warehouse role.
    await tx.unsafe("set local role postgres");
    const [facts] = await tx`select l.planned_base_quantity::text planned,h.moved_base_quantity::text loaded,
      (select sum(base_quantity_delta)::text from public.inventory_movements where material_id=l.material_id and location_kind='WAREHOUSE') warehouse,
      (select sum(base_quantity_delta)::text from public.inventory_movements where delivery_id=l.delivery_id and location_kind='IN_TRANSIT') transit,
      (select state from public.inventory_reservations where delivery_line_id=l.id) reservation,
      private.delivery_allocation_consumed(l.supply_allocation_id)::text consumed from public.delivery_lines l
      join public.delivery_handoff_lines h on h.delivery_line_id=l.id where l.id=${d.line}`;
    assert.deepEqual(facts, { planned: "15.000000", loaded: "14.000000", warehouse: "31.000000", transit: "14.000000", reservation: "CONSUMED", consumed: "14.000000" });
    const remainder = await x.delivery("31");
    assert.ok(remainder.id);
    const overReported = await rejected(tx, sp => rpc(sp, "submit_delivery_result", [d.id, "FULL", [{ delivery_line_id: d.line, actual_base_quantity: "15" }], "QA", "", "Mạng yếu", null, 3, randomUUID()], personas.warehouse.subject), "invalid_delivery_result_line", "22023");
    const result = await rpc(tx, "submit_delivery_result", [d.id, "PARTIAL", [{ delivery_line_id: d.line, actual_base_quantity: "14" }], "QA", "", "Mạng yếu", null, 3, randomUUID()], personas.warehouse.subject);
    await rpc(tx, "verify_delivery", [result, [{ delivery_line_id: d.line, accepted_base_quantity: "13", billable_base_quantity: "13", billing_variance_reason: "" }], 4, randomUUID()], personas.warehouse.subject);
    const board = await rpc(tx, "dispatch_board_page", [f.branch, "exception", "", 0, 26], personas.warehouse.subject);
    // Table-returning RPC: use a normal SQL read to assert this source, without depending on result shape.
    const entries = await tx`select * from public.dispatch_board_page(${f.branch},'exception','',0,26)`;
    assert.ok(entries.some(row => row.id === d.id));
    return { facts, overReported, remainingDelivery: remainder.id, exceptionVisible: true, boardRpcExecuted: board !== undefined };
  });
  await scenario("G10_FULL15_ACCEPTED14_EXCEPTION_UNTIL_RETURN_RESOLVED", async (tx, x) => {
    const d = await x.delivery();
    await x.assign(d.id, personas.worker.employee);
    await rpc(tx, "handoff_delivery_actual", [d.id, 2, new Date().toISOString(), randomUUID(),
      [{ delivery_line_id: d.line, loaded_base_quantity: "15" }]], personas.warehouse.subject);
    const result = await rpc(tx, "submit_delivery_result", [d.id, "FULL", [{ delivery_line_id: d.line, actual_base_quantity: "15" }],
      "Người nhận QA", "", "Mạng yếu", null, 3, randomUUID()], personas.warehouse.subject);
    const verification = await rpc(tx, "verify_delivery", [result, [{ delivery_line_id: d.line, accepted_base_quantity: "14",
      billable_base_quantity: "14", billing_variance_reason: "" }], 4, randomUUID()], personas.warehouse.subject);
    const before = await tx`select * from public.dispatch_board_page(${f.branch},'exception','',0,26)`;
    assert.ok(before.some(row => row.id === d.id));
    const [line] = await tx`select id from public.delivery_verification_lines where delivery_verification_id=${verification}`;
    const returnCase = await rpc(tx, "open_return_case", [line.id, "TRANSIT_REMAINDER", "1", "Khách nhận 14; còn 1 trên xe", null, randomUUID()], personas.warehouse.subject);
    const open = await tx`select * from public.dispatch_board_page(${f.branch},'exception','',0,26)`;
    assert.ok(open.some(row => row.id === d.id));
    await rpc(tx, "resolve_return_case", [returnCase, "RETURNED", f.warehouse, "Đã nhận lại 1 m³ vào kho", null, 1, randomUUID()], personas.warehouse.subject);
    const after = await tx`select * from public.dispatch_board_page(${f.branch},'exception','',0,26)`;
    assert.ok(!after.some(row => row.id === d.id));
    const [fact] = await tx`select result_kind from public.deliveries where id=${d.id}`;
    assert.equal(fact.result_kind, "FULL");
    return { originalResultKept: "FULL", exceptionBeforeAndWhileOpen: true, resolvedDisappeared: true };
  });
  await scenario("G14_ONE_UNLOADED_LINE_NO_FALSE_STOCK_OR_COST", async (tx, x) => {
    const second = await stockFixture(tx, qa, "15");
    const makeLine = stock => ({ ...stock.common, quantity: "15", unit_price_vnd: "230000",
      pricing_rule_id: stock.price, pricing_rule_version: 1, price_source_type: "LIST" });
    const so = await rpc(tx, "create_sales_order_draft", [f.branch, x.stock.customer, x.stock.site, null,
      "Lấy một dòng, chưa lấy dòng còn lại", [makeLine(x.stock), makeLine(second)], randomUUID()]);
    await rpc(tx, "confirm_sales_order", [so, randomUUID()]);
    const lines = await tx`select id,material_id from public.sales_order_lines where sales_order_id=${so} order by id`;
    const planned = [];
    for (const line of lines) {
      const allocation = await rpc(tx, "upsert_supply_allocation", [line.id, "WAREHOUSE", null, f.warehouse, "15", null, null, randomUUID()]);
      planned.push({ supply_allocation_id: allocation, planned_base_quantity: "15" });
    }
    const d = await rpc(tx, "create_delivery_from_allocations", [so, planned, start, randomUUID()]);
    const deliveryLines = await tx`select id,material_id from public.delivery_lines where delivery_id=${d} order by id`;
    await rpc(tx, "assign_delivery", [d, null, null, "Xe ngoài giả QA", "", 1, randomUUID()]);
    const loading = deliveryLines.map((l, index) => ({ delivery_line_id: l.id, loaded_base_quantity: index === 0 ? "0" : "14" }));
    await rpc(tx, "handoff_delivery_actual", [d, 2, new Date().toISOString(), randomUUID(), loading], personas.warehouse.subject);
    const result = await rpc(tx, "submit_delivery_result", [d, "PARTIAL", loading.map(l => ({ delivery_line_id: l.delivery_line_id,
      actual_base_quantity: l.loaded_base_quantity })), "QA", "", "Mạng yếu", null, 3, randomUUID()], personas.warehouse.subject);
    const verification = await rpc(tx, "verify_delivery", [result, loading.map(l => ({ delivery_line_id: l.delivery_line_id,
      accepted_base_quantity: l.loaded_base_quantity, billable_base_quantity: l.loaded_base_quantity, billing_variance_reason: "" })), 4,
      randomUUID()], personas.warehouse.subject);
    await tx.unsafe("set local role postgres");
    const [facts] = await tx`select sum(receivable_amount_vnd)::text ar,sum(inventory_cost_vnd)::text cost
      from public.delivery_verification_lines where delivery_verification_id=${verification}`;
    assert.deepEqual(facts, { ar: "3220000", cost: "2100000" });
    const [zero] = await tx`select h.moved_base_quantity::text loaded,r.state,
      (select count(*)::int from public.inventory_movements where source_delivery_handoff_line_id=h.id) movements
      from public.delivery_handoff_lines h join public.inventory_reservations r on r.delivery_line_id=h.delivery_line_id
      where h.delivery_line_id=${deliveryLines[0].id}`;
    assert.deepEqual(zero, { loaded: "0.000000", state: "RELEASED", movements: 0 });
    return { facts, zero, planPreserved: "15 per line" };
  });
  await scenario("G14_FAULT_AFTER_CUSTODY_INSERT_ROLLS_BACK_ALL_EFFECTS", async (tx, x) => {
    const d = await x.delivery();
    await x.assign(d.id, personas.worker.employee);
    await tx.unsafe("set local role postgres");
    await tx.unsafe(`create function pg_temp.package3_loading_fault() returns trigger language plpgsql as $$
      begin if new.source_delivery_handoff_line_id is not null and new.location_kind='IN_TRANSIT'
        then raise exception 'package3_injected_after_custody' using errcode='PT500'; end if; return new; end $$;
      create trigger package3_loading_fault after insert on public.inventory_movements for each row
      execute function pg_temp.package3_loading_fault();`).simple();
    const op = randomUUID(), when = new Date().toISOString(), loaded = [{ delivery_line_id: d.line, loaded_base_quantity: "14" }];
    const failure = await rejected(tx, sp => rpc(sp, "handoff_delivery_actual", [d.id, 2, when, op, loaded], personas.warehouse.subject),
      "package3_injected_after_custody", "PT500");
    await tx.unsafe("set local role postgres");
    const [facts] = await tx`select d.execution_state,d.version,
      (select count(*)::int from public.delivery_handoffs where delivery_id=d.id) handoffs,
      (select count(*)::int from public.command_receipts where operation_id=${op}) receipts,
      (select count(*)::int from public.audit_events where trace_id=${op}) audit,
      (select sum(base_quantity_delta)::text from public.inventory_movements where material_id=${x.stock.material} and location_kind='WAREHOUSE') warehouse,
      (select state from public.inventory_reservations where delivery_line_id=${d.line}) reservation
      from public.deliveries d where id=${d.id}`;
    assert.deepEqual(facts, { execution_state: "ASSIGNED", version: 2, handoffs: 0, receipts: 0, audit: 0,
      warehouse: "45.000000", reservation: "ACTIVE" });
    await tx.unsafe("drop trigger package3_loading_fault on public.inventory_movements");
    await rpc(tx, "handoff_delivery_actual", [d.id, 2, when, op, loaded], personas.warehouse.subject);
    return { failure, rolledBackFacts: facts, sameIntentAfterAuthoritativeRollback: "PASS" };
  });
  report.status = "PASS_EXECUTED_DB_SCOPE";
  report.rolledBack = true;
  await writeFile(args.out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, scenarios: report.checks.length }));
} catch (error) {
  await writeFile(args.out.replace(/\.json$/, "-failure.json"), JSON.stringify({ ...report, status: "FAIL", error: { message: error.message, code: error.code } }, null, 2));
  throw error;
} finally { await sql.end({ timeout: 3 }); }
