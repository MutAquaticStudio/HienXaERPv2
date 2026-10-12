import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { argumentsForRun, openQA, rejected } from "../remediation/native-fixture.mjs";
const a = argumentsForRun(), q = await openQA(a), d = JSON.parse(await readFile(a.documents, "utf8")).documents;
const r = { scope: "MASTER_ALL_CURRENT_CATALOG_KINDS_CREATE_EDIT_STALE_RIGHTS_AND_NO_LEDGER", productionAccess: "NONE", checks: [] }, rollback = new Error("ROLLBACK_MASTER_ACCEPTANCE");
try {
  try { await q.sql.begin(async tx => {
    const prefix = "GM" + randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase(), ids = Object.fromEntries(["groups", "units", "materials", "conversions", "warehouses", "vehicles", "machines", "customers", "suppliers", "sites", "branches"].map(k => [k, randomUUID()]));
    const kinds = [
      ["groups", "material_groups", { code: prefix + "G", name: "QA nhóm vật tư", active: true }],
      ["units", "units_of_measure", { code: prefix.toLowerCase(), name: "QA đơn vị", symbol: "QA", decimal_scale: "6", active: true }],
      ["materials", "materials", { code: prefix + "M", name: "QA vật tư", group_id: ids.groups, base_uom_id: ids.units, sale_enabled: true, purchase_enabled: true, active: true }],
      ["conversions", "material_uom_conversions", { material_id: ids.materials, from_uom_id: ids.units, to_uom_id: d.uom, numerator: "2", denominator: "1", conversion_type: "PACKAGING", settlement_allowed: true, rounding_scale: "6", rounding_mode: "HALF_UP", source_note: "QA căn cứ đóng gói riêng", active: true }],
      ["warehouses", "warehouses", { code: prefix + "W", name: "QA kho mới không tồn đầu kỳ", address_text: "QA", active: true }],
      ["vehicles", "vehicles", { code: prefix + "V", plate_number: prefix, capacity_quantity: "20", capacity_uom_id: ids.units, capacity_source_note: "QA hồ sơ tải trọng cô lập", active: true }],
      ["machines", "machines", { code: prefix + "MC", name: "QA máy", machine_type: "QA", active: true }],
      ["customers", "customers", { code: prefix + "C", display_name: "QA khách mới", customer_type: "BUSINESS", phone: null, email: null, address_text: "QA", sales_owner_employee_id: d.personas.sales.employee, tier_code: null, payment_terms_days: "0", credit_limit_vnd: "10000000", internal_note: "QA nội bộ không được lộ", active: true }],
      ["suppliers", "suppliers", { code: prefix + "S", name: "QA NCC mới", phone: null, email: null, address_text: "QA", payment_terms_days: "0", active: true }],
      ["sites", "customer_sites", { customer_id: ids.customers, code: prefix + "CS", name: "QA công trình", address_text: "QA địa chỉ nguồn", receiver_name: "QA", receiver_phone: null, sales_owner_employee_id: d.personas.sales.employee, latitude: null, longitude: null, access_note: null, receiving_window: null, active: true }],
      ["branches", "branches", { code: prefix + "B", name: "QA chi nhánh mới không opening", active: true }],
    ];
    const call = (tx, kind, id, values, expected, op, uid = d.fixtures.owner) => {
      const name = kind === "branches" ? "save_branch_config" : ["customers", "sites"].includes(kind) ? "save_customer_site_profile" : "save_catalog_record";
      return q.rpc(tx, name, kind === "branches" ? [id, d.branch, values, expected, "QA nguồn cấu hình có lý do", op] : [kind, id, d.branch, values, expected, "QA nguồn cấu hình có lý do", op], uid);
    };
    const [before] = await tx`select (select count(*) from public.inventory_movements) stock,(select count(*) from public.payments) cash,(select count(*) from public.receivable_obligations) ar,(select count(*) from public.payable_obligations) ap`;
    for (const [kind, table, values] of kinds) {
      const op = randomUUID(), id = ids[kind];
      await rejected(tx, sp => call(sp, kind, id, values, null, randomUUID(), d.personas.worker.subject), null, "42501");
      assert.equal(await call(tx, kind, id, values, null, op), id); assert.equal(await call(tx, kind, id, values, null, op), id);
      await tx.unsafe("set local role postgres");
      const [row] = await tx.unsafe(`select to_jsonb(x) value from public.${table} x where id=$1`, [id]);
      const original = kind === "conversions" ? { active: row.value.active } : Object.fromEntries(Object.keys(values).map(key => [key, row.value[key] ?? null]));
      const changed = kind === "conversions" ? { active: false } : kind === "customers" ? { ...values, display_name: values.display_name + " cập nhật" } : kind === "vehicles" ? { ...values, plate_number: values.plate_number + "A" } : { ...values, name: values.name + " cập nhật" };
      assert.equal(await call(tx, kind, id, changed, original, randomUUID()), id);
      const stale = await rejected(tx, sp => call(sp, kind, id, changed, original, randomUUID()));
      assert.ok(["40001", "PT409"].includes(stale.code), kind + " stale expected values must be rejected");
      await tx.unsafe("set local role postgres");
      const [audit] = await tx`select count(*)::int n from public.audit_events where trace_id=${op}`; assert.equal(audit.n, ["customers", "sites"].includes(kind) ? 2 : 1);
      r.checks.push({ kind, status: "PASS", source: table, createRetryAudits: audit.n, staleCode: stale.code, workerDenied: true });
    }
    await tx.unsafe("set local role postgres");
    const [after] = await tx`select (select count(*) from public.inventory_movements) stock,(select count(*) from public.payments) cash,(select count(*) from public.receivable_obligations) ar,(select count(*) from public.payable_obligations) ap`;
    assert.deepEqual(after, before); r.ledgerUnchanged = true;
    const [state] = await tx`select state,activation_operation_id from private.branch_operational_states where branch_id=${ids.branches}`;
    assert.equal(state.state, "PENDING_OPENING"); assert.equal(state.activation_operation_id, null); r.newBranchState = state;
    throw rollback;
  }); } catch (error) { if (error !== rollback) throw error; }
  r.status = "PASS"; r.rolledBack = true; r.checkedAt = new Date().toISOString(); await writeFile(a.out, JSON.stringify(r, null, 2));
  console.log(JSON.stringify({ status: "PASS", kinds: r.checks.length, noLedger: true, rolledBack: true }));
} catch (e) { r.status = "FAIL"; r.error = e.message; await writeFile(a.out, JSON.stringify(r, null, 2)); throw e; }
finally { await q.sql.end({ timeout: 3 }); }
