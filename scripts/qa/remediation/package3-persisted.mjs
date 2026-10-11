import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { argumentsForRun, openQA, salesFixture, stockFixture } from "./native-fixture.mjs";

const args = argumentsForRun(), qa = await openQA(args);
const { sql, fixtures: f, rpc } = qa;
const personas = JSON.parse(await readFile(args.personas, "utf8")).personas;
try {
  const documents = await sql.begin(async tx => {
    const [{ pid }] = await tx`select pg_backend_pid() pid`;
    const [{ slot }] = await tx`select count(*)::int slot from public.deliveries`;
    const scheduleStart = new Date(Date.UTC(2099, 0, 1) + (slot + 100) * 7 * 86400000).toISOString();
    const scheduleEnd = new Date(Date.parse(scheduleStart) + 4 * 3600000).toISOString();
    const nextStart = new Date(Date.parse(scheduleStart) + 86400000).toISOString();
    const nextEnd = new Date(Date.parse(nextStart) + 4 * 3600000).toISOString();
    const stock = await stockFixture(tx, qa, "120");
    const sales = await salesFixture(tx, qa, stock);
    const allocation = await rpc(tx, "upsert_supply_allocation", [sales.line, "WAREHOUSE", null, f.warehouse, "120", null, null, randomUUID()]);
    const vehicle = randomUUID();
    await rpc(tx, "save_catalog_record", ["vehicles", vehicle, f.branch, { code: stock.prefix,
      plate_number: stock.prefix, capacity_quantity: "20", capacity_uom_id: stock.uom,
      capacity_source_note: "Hồ sơ tải xe giả QA riêng", active: true }, null, "Tạo xe giả cho kiểm chứng trình duyệt", randomUUID()]);
    const [{ id: ownerEmployee }] = await tx`select id from public.employees where auth_user_id=${f.owner} and active`;
    const docs = {};
    for (const name of ["load", "reassign", "http", "exception"]) {
      const d = await rpc(tx, "create_delivery_from_allocations", [sales.so,
        [{ supply_allocation_id: allocation, planned_base_quantity: "15" }], scheduleStart, randomUUID()]);
      const [line] = await tx`select id from public.delivery_lines where delivery_id=${d}`;
      docs[name] = { delivery: d, line: line.id };
    }
    const d = docs.exception;
    await rpc(tx, "assign_delivery", [d.delivery, null, null, "Nhà xe giả QA", "000", 1, randomUUID()]);
    await rpc(tx, "handoff_delivery_actual", [d.delivery, 2, new Date().toISOString(), randomUUID(),
      [{ delivery_line_id: d.line, loaded_base_quantity: "15" }]], personas.warehouse.subject);
    const result = await rpc(tx, "submit_delivery_result", [d.delivery, "FULL", [{ delivery_line_id: d.line, actual_base_quantity: "15" }],
      "Người nhận giả QA", "", "Ghi nhận thiếu bước tới nơi", null, 3, randomUUID()], personas.warehouse.subject);
    d.result = result;
    return { ...docs, branch: f.branch, stock, sales, allocation, vehicle, worker: personas.worker.employee,
      newAssignee: ownerEmployee, scheduleStart, scheduleEnd, nextStart, nextEnd, writerPid: pid };
  });
  const observer = await openQA(args);
  try {
    const [{ pid }] = await observer.sql`select pg_backend_pid() pid`;
    assert.notEqual(pid, documents.writerPid);
    const rows = await observer.sql`select id,execution_state from public.deliveries
      where id in(${documents.load.delivery},${documents.reassign.delivery},${documents.http.delivery},${documents.exception.delivery})`;
    assert.equal(rows.length, 4);
    assert.equal(rows.find(r => r.id === documents.exception.delivery).execution_state, "RESULT_SUBMITTED");
    await writeFile(args.out, JSON.stringify({ scope: "PACKAGE3_FRESH_COMMITTED_SYNTHETIC_DOCUMENTS", status: "PASS_PERSISTED_SETUP",
      database: args.database, readerPid: pid, documents, stateReadback: rows, productionAccess: "NONE" }, null, 2));
    console.log(JSON.stringify({ status: "PASS_PERSISTED_SETUP", distinctConnections: true, documents: rows.length }));
  } finally { await observer.sql.end({ timeout: 3 }); }
} finally { await sql.end({ timeout: 3 }); }
