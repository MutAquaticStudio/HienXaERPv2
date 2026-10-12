import { randomUUID } from "node:crypto";
import { stockFixture, salesFixture } from "./native-fixture.mjs";

export async function paidReturnScenario(tx, qa, finance, { billable = "14", paid = "3220000", configureCommission = false, resolveReturn = true } = {}) {
  const { fixtures: f, rpc } = qa;
  const stock = await stockFixture(tx, qa, "14");
  let commissionRule, commissionEmployee, syntheticSalesSubject;
  if (configureCommission) {
    await tx.unsafe("set local role postgres");
    commissionEmployee = randomUUID();
    const syntheticAuthSubject = randomUUID();
    syntheticSalesSubject = syntheticAuthSubject;
    await tx`insert into auth.users(id) values(${syntheticAuthSubject})`;
    await tx`insert into public.employees(id,auth_user_id,code,display_name,active) values(${commissionEmployee},${syntheticAuthSubject},${stock.prefix + "_SALE"},'Nhân viên hoa hồng giả QA',true)`;
    const [role] = await tx`select distinct r.id from public.roles r join public.role_permissions rp on rp.role_id=r.id
      join public.employee_branch_access ba on ba.role_id=r.id where ba.branch_id=${f.branch} and ba.active and r.active
       and rp.permission_code='orders.create' and not exists(select 1 from public.role_permissions claim where claim.role_id=r.id and claim.permission_code='work.claim') limit 1`;
    if (!role) throw new Error("A local existing Sales role is required for the synthetic commission employee");
    await tx`insert into public.employee_branch_access(employee_id,branch_id,role_id,active) values(${commissionEmployee},${f.branch},${role.id},true)`;
    await tx`update public.customers set sales_owner_employee_id=${commissionEmployee} where id=${stock.customer}`;
    commissionRule = await rpc(tx, "create_compensation_rule", [f.branch, stock.prefix + "_COM", "Hoa hồng giả 5% trên nguồn thu QA", commissionEmployee,
      "SALES_COMMISSION", "PERCENT_BPS", null, 500, "SALES_COMMISSION", "2020-01-01", null, randomUUID()]);
    const [clock] = await tx`select now()::text now`;
    await rpc(tx, "configure_compensation_recognition", [commissionRule, "AR_PAYMENT_ALLOCATION", clock.now, randomUUID()]);
  }
  const sale = await salesFixture(tx, qa, stock, syntheticSalesSubject ?? f.owner);
  const allocation = await rpc(tx, "upsert_supply_allocation", [sale.line, "WAREHOUSE", null, f.warehouse, "14", null, null, randomUUID()]);
  const delivery = await rpc(tx, "create_delivery_from_allocations", [sale.so,
    [{ supply_allocation_id: allocation, planned_base_quantity: "14" }], new Date().toISOString(), randomUUID()]);
  const [line] = await tx`select id from public.delivery_lines where delivery_id=${delivery}`;
  await rpc(tx, "assign_delivery", [delivery, null, null, "Xe giả paid return QA", "", 1, randomUUID()]);
  await rpc(tx, "handoff_delivery_actual", [delivery, 2, new Date().toISOString(), randomUUID(), [{ delivery_line_id: line.id, loaded_base_quantity: "14" }]]);
  const result = await rpc(tx, "submit_delivery_result", [delivery, "FULL", [{ delivery_line_id: line.id, actual_base_quantity: "14" }],
    "QA", "", "Ghi nhận QA", null, 3, randomUUID()]);
  const verification = await rpc(tx, "verify_delivery", [result, [{ delivery_line_id: line.id, accepted_base_quantity: "14",
    billable_base_quantity: billable, billing_variance_reason: billable === "14" ? "" : "Hàng tặng ghi nhận trên QA" }], 4, randomUUID()]);
  const [ar] = await tx`select id from public.receivable_obligations where delivery_verification_id=${verification}`;
  const [vl] = await tx`select id from public.delivery_verification_lines where delivery_verification_id=${verification}`;
  const account = await rpc(tx, "create_finance_account", [f.branch, stock.prefix, "Quỹ giả paid return QA", "CASH", randomUUID()]);
  const payment = paid === "0" ? null : await rpc(tx, "post_payment", [f.branch, "RECEIPT", stock.customer, null, account, paid, new Date().toISOString(),
    "CASH", "Thu theo nguồn trên QA", [{ obligation_id: ar.id, amount_vnd: paid }], "0", randomUUID()], finance);
  const returnCase = await rpc(tx, "open_return_case", [vl.id, "CUSTOMER_RETURN", "1", "Khách trả một đơn vị QA", null, randomUUID()]);
  if (resolveReturn) await rpc(tx, "resolve_return_case", [returnCase, "RETURNED", f.warehouse, "Đã nhận lại một đơn vị", null, 1, randomUUID()]);
  await tx.unsafe("set local role postgres");
  return { stock, sale, account, payment, obligation: ar?.id ?? null, returnCase, verificationLine: vl.id, delivery, commissionRule, commissionEmployee };
}

export async function nextReceivableFromReturnedStock(tx, qa, doc, uid = qa.fixtures.owner) {
  const { fixtures: f, rpc } = qa;
  const sale = await salesFixture(tx, qa, { ...doc.stock, common: { ...doc.stock.common, quantity: "1" } }, uid);
  const source = await rpc(tx, "upsert_supply_allocation", [sale.line, "WAREHOUSE", null, f.warehouse, "1", null, null, randomUUID()]);
  const d = await rpc(tx, "create_delivery_from_allocations", [sale.so, [{ supply_allocation_id: source, planned_base_quantity: "1" }],
    new Date().toISOString(), randomUUID()]);
  const [line] = await tx`select id from public.delivery_lines where delivery_id=${d}`;
  await rpc(tx, "assign_delivery", [d, null, null, "Xe giả cho nghĩa vụ sau", "", 1, randomUUID()]);
  await rpc(tx, "handoff_delivery_actual", [d, 2, new Date().toISOString(), randomUUID(), [{ delivery_line_id: line.id, loaded_base_quantity: "1" }]]);
  const result = await rpc(tx, "submit_delivery_result", [d, "FULL", [{ delivery_line_id: line.id, actual_base_quantity: "1" }],
    "QA", "", "Ghi nhận QA", null, 3, randomUUID()]);
  const verification = await rpc(tx, "verify_delivery", [result, [{ delivery_line_id: line.id, accepted_base_quantity: "1",
    billable_base_quantity: "1", billing_variance_reason: "" }], 4, randomUUID()]);
  const [ar] = await tx`select id from public.receivable_obligations where delivery_verification_id=${verification}`;
  await tx.unsafe("set local role postgres");
  return ar.id;
}
