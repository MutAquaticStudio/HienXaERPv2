import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { browserQA } from "./browser-kit.mjs";
const b = await browserQA("T37_BONUS_RULE_BASIS_EARNING_APPROVAL_FINANCE_PAYMENT_WORKER_READ"), { qa, d, report: r, origin } = b;
r.documents.code ??= "GB" + randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase(); await b.save();
async function form(p, button) { return p.locator("form").filter({ has: p.getByRole("button", { name: button, exact: true }) }); }
try {
  const owner = await b.login("owner"), finance = await b.login("finance-employee"), worker = await b.login("worker", "work");
  await owner.goto(origin + "/admin/compensation");
  if (!r.documents.rule) {
    const [existing] = await qa.sql`select id from public.compensation_rules where branch_id=${d.branch} and code=${r.documents.code}`;
    if (existing) r.documents.rule = existing.id;
    else {
      await owner.getByText("Tạo phiên bản quy tắc", { exact: true }).click();
      const f = await form(owner, "Tạo phiên bản quy tắc mới");
      await f.locator("input[name=code]").fill(r.documents.code); await f.locator("input[name=name]").fill("QA thưởng có căn cứ nguồn");
      await f.locator("select[name=employeeId]").selectOption(d.personas.worker.employee);
      await f.locator("select[name=earningType]").selectOption("BONUS"); await f.locator("input[name=rate]").fill("100000");
      await f.locator("select[name=classification]").selectOption("OPEX");
      await f.getByRole("button", { name: "Tạo phiên bản quy tắc mới", exact: true }).click();
      await b.wait(async () => !!(await qa.sql`select id from public.compensation_rules where branch_id=${d.branch} and code=${r.documents.code}`)[0]);
      r.documents.rule = (await qa.sql`select id from public.compensation_rules where branch_id=${d.branch} and code=${r.documents.code}`)[0].id;
    }
    await b.save(); await b.record("OWNER_UI_CREATE_RULE", { rule: r.documents.rule });
  }
  if (!r.documents.basis) {
    const description = "QA thưởng theo căn cứ " + r.documents.code;
    const [existing] = await qa.sql`select id from public.compensation_manual_bases where branch_id=${d.branch} and description=${description}`;
    if (existing) r.documents.basis = existing.id;
    else {
      await owner.goto(origin + "/admin/compensation"); await owner.getByText("Ghi căn cứ tính thủ công", { exact: true }).click();
      const f = await form(owner, "Ghi căn cứ tính"); await f.locator("select[name=employeeId]").selectOption(d.personas.worker.employee);
      await f.locator("select[name=basisType]").selectOption("BONUS"); await f.locator("input[name=basisQuantity]").fill("1.234567");
      await f.locator("textarea[name=description]").fill(description); await f.getByRole("button", { name: "Ghi căn cứ tính", exact: true }).click();
      await b.wait(async () => !!(await qa.sql`select id from public.compensation_manual_bases where branch_id=${d.branch} and description=${description}`)[0]);
      r.documents.basis = (await qa.sql`select id from public.compensation_manual_bases where branch_id=${d.branch} and description=${description}`)[0].id;
    }
    await b.save(); await b.record("OWNER_UI_RECORD_EXACT_BONUS_BASIS", { basis: r.documents.basis });
  }
  if (!r.documents.earning) {
    await owner.goto(origin + "/admin/compensation");
    const f = owner.locator("form").filter({ has: owner.locator(`input[name=sourceId][value="${r.documents.basis}"]`) });
    await f.locator("select[name=ruleId]").selectOption(r.documents.rule); await f.getByRole("button", { name: "Tính thu nhập", exact: true }).click();
    await b.wait(async () => !!(await qa.sql`select id from public.earning_events where manual_basis_id=${r.documents.basis}`)[0]);
    r.documents.earning = (await qa.sql`select id from public.earning_events where manual_basis_id=${r.documents.basis}`)[0].id; await b.save();
    const [e] = await qa.sql`select basis_quantity::text qty,calculated_amount_vnd::text amount,approval_state from public.earning_events where id=${r.documents.earning}`;
    assert.equal(e.qty, "1.234567"); assert.equal(e.amount, "123457"); assert.equal(e.approval_state, "DRAFT");
    await b.record("OWNER_UI_CALCULATE_DRAFT_DOES_NOT_CREATE_PAYABLE", e);
  }
  let [e] = await qa.sql`select approval_state,payable_obligation_id from public.earning_events where id=${r.documents.earning}`;
  if (e.approval_state === "DRAFT") {
    await owner.goto(origin + "/admin/compensation");
    const f = owner.locator("form").filter({ has: owner.locator(`input[name=earningId][value="${r.documents.earning}"]`) });
    await f.getByRole("button", { name: "Duyệt và ghi công nợ phải trả", exact: true }).click();
    await b.wait(async () => (await qa.sql`select approval_state from public.earning_events where id=${r.documents.earning}`)[0].approval_state === "APPROVED");
  }
  [e] = await qa.sql`select payable_obligation_id from public.earning_events where id=${r.documents.earning}`;
  r.documents.obligation = e.payable_obligation_id; await b.save();
  if (!r.documents.payment) {
    await finance.goto(origin + "/admin/compensation");
    const f = finance.locator("form").filter({ has: finance.locator(`input[name=obligationId][value="${e.payable_obligation_id}"]`) });
    await f.locator("xpath=..").locator("summary").click();
    await f.locator("select[name=accountId]").selectOption(d.account); await f.locator("input[name=amount]").fill("23457");
    const intent = await f.locator("input[name=operationId]").inputValue(); r.documents.paymentIntent = intent; await b.save();
    await f.getByRole("button", { name: "Ghi chi trả", exact: true }).click();
    await b.wait(async () => !!(await qa.sql`select result_entity_id from public.command_receipts where operation_id=${intent}`)[0]);
    r.documents.payment = (await qa.sql`select result_entity_id from public.command_receipts where operation_id=${intent}`)[0].result_entity_id; await b.save();
  }
  const [fact] = await qa.sql`select private.current_payable_outstanding(${r.documents.obligation})::text remaining,(select amount_vnd::text from public.payments where id=${r.documents.payment}) paid,(select count(*)::int from public.audit_events where trace_id=${r.documents.paymentIntent}) audits`;
  assert.equal(fact.remaining, "100000"); assert.equal(fact.paid, "23457"); assert.equal(fact.audits, 1);
  await b.record("OWNER_APPROVE_FINANCE_PARTIAL_PAY_INDEPENDENT_AP_AND_CASH", fact);
  await worker.goto(origin + "/work/earnings"); await worker.getByText("123.457 ₫", { exact: true }).first().waitFor();
  assert.equal(await worker.getByRole("button", { name: "Duyệt và ghi công nợ phải trả", exact: true }).count(), 0);
  const denied = await worker.request.get(origin + "/api/finance/obligations?side=AP&party=" + d.fixtures.supplier); assert.equal(denied.status(), 403);
  await b.record("WORKER_SEES_OWN_EARNING_CANNOT_READ_FINANCE_API_OR_APPROVE", { api: denied.status() });
  await b.shot(worker, "worker-own-earned-bonus"); await b.shot(finance, "finance-partial-payroll"); await b.finish();
} catch (error) { r.status = "FAIL"; r.error = error.message; await b.debug(); await b.save(); throw error; }
finally { await b.close(); }
