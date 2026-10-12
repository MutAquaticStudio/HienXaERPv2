import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { argumentsForRun, openQA, rejected, salesFixture, stockFixture } from "./native-fixture.mjs";

const args = argumentsForRun(), qa = await openQA(args), { sql, rpc, fixtures: f } = qa;
const rollback = new Error("ROLLBACK_PACKAGE5_SEAMS");
const report = { scope: "G02_INPUT_AND_CONVERSION_SEAMS_G12_VERSION_G21_ATOMIC_AUDIT", database: args.database,
  productionAccess: "NONE", managedAuthTested: false, checks: [] };
try {
  try {
    await sql.begin(async tx => {
      const s = await stockFixture(tx, qa, "45");
      const saleLine = { ...s.common, quantity: "1.000001", unit_price_vnd: "230000", pricing_rule_id: s.price, pricing_rule_version: 1, price_source_type: "LIST" };
      const buyLine = { ...s.common, quantity: "5", unit_cost_vnd: "150000", purchase_price_rule_id: s.cost, purchase_price_rule_version: 1, price_source_type: "CONTRACT" };
      const sales = await salesFixture(tx, qa, s);
      const so = await rpc(tx, "create_sales_order_draft", [f.branch, s.customer, s.site, null, "Đơn kiểm tra cập nhật", [saleLine], randomUUID()]);
      const quoteExpires = new Date(Date.now() + 7 * 86400000).toISOString();
      const quote = await rpc(tx, "create_quote_draft", [f.branch, s.customer, s.site, quoteExpires, "Báo giá kiểm tra", [saleLine], randomUUID()]);
      const [revision] = await tx`select current_revision_id id from public.quotations where id=${quote}`;
      const po = await rpc(tx, "create_purchase_order_draft", [f.branch, f.supplier, f.warehouse, null, "Đơn mua kiểm tra", [buyLine], randomUUID()]);
      async function precision(name, inputs) {
        const error = await rejected(tx, sp => rpc(sp, name, inputs), "quantity_precision_exceeds_six", "22023");
        const op = inputs.at(-1);
        await tx.unsafe("set local role postgres");
        const [fact] = await tx`select (select count(*)::int from public.command_receipts where operation_id=${op}) receipts,
          (select count(*)::int from public.audit_events where trace_id=${op}) audits`;
        assert.deepEqual(fact, { receipts: 0, audits: 0 });
        report.checks.push({ name: name + "_PRECISION_BEFORE_EFFECT", status: "PASS", error, fact });
      }
      async function versions(name, values, index) {
        const failures = [];
        for (const version of [null, 0, 999]) {
          const inputs = [...values]; inputs[index] = version; inputs[inputs.length - 1] = randomUUID();
          const error = await rejected(tx, sp => rpc(sp, name, inputs));
          assert.ok(["PT409", "55000", "23514"].includes(error.code), JSON.stringify(error));
          assert.match(error.message, /version|stale|not_verifiable|not_handoff_ready/);
          failures.push({ version, ...error });
        }
        report.checks.push({ name: name + "_NULL_STALE_VERSION", status: "PASS", failures });
      }
      await precision("update_sales_order_draft", [so, 1, null, "Lượng không được làm tròn", [{ ...saleLine, quantity: "1.0000004" }], randomUUID()]);
      await precision("update_quote_draft", [revision.id, 1, quoteExpires, "Lượng không được làm tròn", [{ ...saleLine, quantity: "1.0000004" }], randomUUID()]);
      await precision("update_purchase_order_draft", [po, 1, null, "Lượng không được làm tròn", [{ ...buyLine, quantity: "1.0000004" }], randomUUID()]);
      await versions("update_sales_order_draft", [so, 1, null, "Đơn cập nhật hợp lệ", [saleLine], randomUUID()], 1);
      await versions("update_quote_draft", [revision.id, 1, quoteExpires, "Báo giá cập nhật hợp lệ", [saleLine], randomUUID()], 1);
      await versions("update_purchase_order_draft", [po, 1, null, "Mua cập nhật hợp lệ", [buyLine], randomUUID()], 1);
      await versions("update_purchase_order_warehouse", [po, 1, f.warehouse, "Kho nhận hợp lệ", randomUUID()], 1);
      for (const [name, inputs] of [
        ["update_sales_order_draft", [so, 1, null, "Đơn cập nhật hợp lệ", [saleLine], randomUUID()]],
        ["update_quote_draft", [revision.id, 1, quoteExpires, "Báo giá cập nhật hợp lệ", [saleLine], randomUUID()]],
        ["update_purchase_order_draft", [po, 1, null, "Mua cập nhật hợp lệ", [buyLine], randomUUID()]],
      ]) {
        const id = await rpc(tx, name, inputs); assert.equal(await rpc(tx, name, inputs), id);
        report.checks.push({ name: name + "_VALID_RETRY_OLD_VERSION", status: "PASS" });
      }
      await rpc(tx, "confirm_purchase_order", [po, randomUUID()]);
      const [pol] = await tx`select id from public.purchase_order_lines where purchase_order_id=${po}`;
      await precision("receive_purchase_order", [po, [{ purchase_order_line_id: pol.id, received_quantity: "1.0000004" }], null, new Date().toISOString(), randomUUID()]);
      const directPo = await rpc(tx, "create_direct_purchase_from_sales_line", [sales.line, f.supplier, "5", buyLine, null, randomUUID()]);
      await rpc(tx, "confirm_purchase_order", [directPo, randomUUID()]);
      const [dlp] = await tx`select id from public.purchase_order_lines where purchase_order_id=${directPo}`;
      await precision("verify_supplier_fulfillment", [directPo, [{ purchase_order_line_id: dlp.id, supplier_quantity: "1.0000004" }], null, "NCC QA", randomUUID()]);
      await precision("upsert_supply_allocation", [sales.line, "WAREHOUSE", null, f.warehouse, "1.0000004", null, null, randomUUID()]);
      await precision("reserve_inventory", [sales.line, f.warehouse, "1.0000004", randomUUID()]);
      await precision("create_delivery_from_allocations", [sales.so, [{ supply_allocation_id: await rpc(tx, "upsert_supply_allocation", [sales.line, "WAREHOUSE", null, f.warehouse, "5", null, null, randomUUID()]), planned_base_quantity: "1.0000004" }], new Date().toISOString(), randomUUID()]);
      const receiptIntent = randomUUID(), receivedAt = new Date().toISOString();
      const receiptInputs = [po, [{ purchase_order_line_id: pol.id, received_quantity: "1.000001" }], null, receivedAt, receiptIntent];
      const receipt = await rpc(tx, "receive_purchase_order", receiptInputs); assert.equal(await rpc(tx, "receive_purchase_order", receiptInputs), receipt);
      const fulfillmentIntent = randomUUID(), fulfillmentInputs = [directPo, [{ purchase_order_line_id: dlp.id, supplier_quantity: "1.000001" }], null, "NCC QA có nguồn", fulfillmentIntent];
      const fulfillment = await rpc(tx, "verify_supplier_fulfillment", fulfillmentInputs); assert.equal(await rpc(tx, "verify_supplier_fulfillment", fulfillmentInputs), fulfillment);
      await tx.unsafe("set local role postgres");
      const [receiptFact] = await tx`select received_quantity::text quantity,inventory_value_vnd::text money,round(received_quantity*unit_cost_vnd)::text expected from public.purchase_receipt_lines where purchase_receipt_id=${receipt}`;
      const [directFact] = await tx`select supplier_quantity::text quantity,payable_amount_vnd::text money,round(supplier_quantity*150000)::text expected from public.supplier_fulfillment_lines where supplier_fulfillment_id=${fulfillment}`;
      assert.equal(receiptFact.money, receiptFact.expected); assert.equal(directFact.money, directFact.expected);
      const [auditFact] = await tx`select count(*)::int audits from public.audit_events where trace_id=${fulfillmentIntent}`; assert.equal(auditFact.audits, 1);
      report.checks.push({ name: "RECEIPT_DIRECT_STORED_QTY_PRICE_AND_RETRY_AUDIT_ONCE", status: "PASS", receiptFact, directFact, auditFact });
      const [employee] = await tx`select id from public.employees where auth_user_id=${f.owner}`;
      await precision("create_service_job", [f.branch, s.customer, s.site, "Dịch vụ QA", "Dịch vụ lượng QA", "2099-02-01T08:00:00Z", "2099-02-01T12:00:00Z", "1.0000004", "giờ", employee.id, null, null, randomUUID()]);
      const job = await rpc(tx, "create_service_job", [f.branch, s.customer, s.site, "Dịch vụ QA", "Dịch vụ lượng QA", "2099-02-01T08:00:00Z", "2099-02-01T12:00:00Z", "1", "giờ", employee.id, null, null, randomUUID()]);
      const work = await rpc(tx, "publish_work_item", [f.branch, "SERVICE_JOB", job, "DIRECT", employee.id, randomUUID()]);
      await tx.unsafe("set local role postgres");
      const [w] = await tx`select version from public.work_items where id=${work}`;
      await versions("start_work_item", [work, w.version, randomUUID()], 1);
      const startIntent = randomUUID(); await rpc(tx, "start_work_item", [work, w.version, startIntent]); assert.equal(await rpc(tx, "start_work_item", [work, w.version, startIntent]), work);
      const [started] = await tx`select version from public.work_items where id=${work}`;
      await precision("submit_work_result", [work, "1.0000004", "Dịch vụ đã làm", "QA", null, started.version, randomUUID()]);
      await versions("submit_work_result", [work, "1", "Dịch vụ đã làm", "QA", null, started.version, randomUUID()], 5);
      const resultIntent = randomUUID(), resultInputs = [work, "1", "Dịch vụ đã làm", "QA", null, started.version, resultIntent];
      const result = await rpc(tx, "submit_work_result", resultInputs); assert.equal(await rpc(tx, "submit_work_result", resultInputs), result);
      const [jobNow] = await tx`select j.version job_version,w.version work_version from public.service_jobs j join public.work_items w on w.service_job_id=j.id where j.id=${job}`;
      await precision("verify_service_job", [job, "1.0000004", "1", "200000", "2026-10-11", "Lượng dịch vụ QA", jobNow.job_version, jobNow.work_version, randomUUID()]);
      await precision("verify_service_job", [job, "1", "1.0000004", "200000", "2026-10-11", "Lượng dịch vụ QA", jobNow.job_version, jobNow.work_version, randomUUID()]);
      await versions("verify_service_job", [job, "1", "1", "200000", "2026-10-11", "Lượng dịch vụ QA", jobNow.job_version, jobNow.work_version, randomUUID()], 6);
      await versions("verify_service_job", [job, "1", "1", "200000", "2026-10-11", "Lượng dịch vụ QA", jobNow.job_version, jobNow.work_version, randomUUID()], 7);
      const verificationInputs = [job, "1", "1", "200000", "2026-10-11", "Lượng dịch vụ QA", jobNow.job_version, jobNow.work_version, randomUUID()];
      const v = await rpc(tx, "verify_service_job", verificationInputs); assert.equal(await rpc(tx, "verify_service_job", verificationInputs), v);
      report.checks.push({ name: "SERVICE_SOURCE_VALID_RETRY_AFTER_VERSION_ADVANCES", status: "PASS" });
      await tx.unsafe("set local role postgres");
      const failedOp = randomUUID();
      await tx.unsafe("create function pg_temp.fail_command_audit() returns trigger language plpgsql as $$begin raise exception 'qa_audit_fault' using errcode='P0001';end$$; create trigger qa_fail_command_audit after insert on public.audit_events for each row when(new.action='command.record_compensation_basis') execute function pg_temp.fail_command_audit();").simple();
      const basisInputs = [f.branch, employee.id, "PER_DAY", "1.000001", "2026-01-01", "2026-01-01", "Căn cứ cùng giao dịch QA", null, null, failedOp];
      await rejected(tx, sp => rpc(sp, "record_compensation_basis", basisInputs), "qa_audit_fault", "P0001");
      await tx.unsafe("set local role postgres");
      const [rolled] = await tx`select (select count(*)::int from public.command_receipts where operation_id=${failedOp}) receipts,(select count(*)::int from public.audit_events where trace_id=${failedOp}) audits,(select count(*)::int from public.compensation_manual_bases where description='Căn cứ cùng giao dịch QA' and employee_id=${employee.id}) effects`;
      assert.deepEqual(rolled, { receipts: 0, audits: 0, effects: 0 });
      await tx.unsafe("drop trigger qa_fail_command_audit on public.audit_events");
      const basis = await rpc(tx, "record_compensation_basis", basisInputs); assert.equal(await rpc(tx, "record_compensation_basis", basisInputs), basis);
      const [one] = await tx`select count(*)::int n from public.audit_events where trace_id=${failedOp}`; assert.equal(one.n, 1);
      report.checks.push({ name: "AUDIT_FAULT_ROLLS_BACK_SOURCE_RECEIPT_AND_HISTORY_RETRY_ONCE", status: "PASS", rolled, retryAudits: one.n });
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  report.status = "PASS_EXECUTED_DB_SEAMS"; report.rolledBack = true;
  await writeFile(args.out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, rolledBack: true }));
} catch (error) {
  await writeFile(args.out.replace(/\.json$/, "-failure.json"), JSON.stringify({ ...report, status: "FAIL", error: { code: error.code, message: error.message } }, null, 2)); throw error;
} finally { await sql.end({ timeout: 3 }); }
