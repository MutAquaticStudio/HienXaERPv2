import assert from "node:assert/strict";
import { browserQA } from "./browser-kit.mjs";
const b = await browserQA("MANAGER_POOL_PUBLICATION_WORKER_CLAIM_START_REPORT_ROLE_HANDOFF"), { qa, d, report: r, origin } = b;
try {
  const owner = await b.login("owner"), worker = await b.login("worker", "work"), customer = await b.login("finance", "customer");
  if (!r.documents.job) {
    await owner.goto(origin + "/admin/service-jobs"); await owner.getByText("Lập lịch công việc dịch vụ", { exact: true }).click();
    await owner.locator("select[name=customerId]").selectOption(d.customer);
    await owner.locator(`select[name=siteId] option[value="${d.site}"]`).waitFor({ state: "attached" }); await owner.locator("select[name=siteId]").selectOption(d.site);
    await owner.locator("input[name=serviceType]").fill("QA nhận việc từ kho việc"); await owner.locator("textarea[name=description]").fill("QA phát hành kho việc, nhận đúng vai trò");
    await owner.locator("input[name=scheduledStart]").fill("2200-02-01T07:00"); await owner.locator("input[name=scheduledEnd]").fill("2200-02-01T08:00");
    await owner.locator("input[name=plannedQuantity]").fill("1"); await owner.locator("input[name=unitLabel]").fill("giờ");
    await owner.getByRole("button", { name: "Lập lịch dịch vụ", exact: true }).click(); await owner.waitForURL(u => /^\/admin\/service-jobs\/[a-f0-9-]{36}$/.test(u.pathname));
    r.documents.job = new URL(owner.url()).pathname.split("/").at(-1); await b.save();
  }
  if (!r.documents.work) {
    await owner.goto(origin + "/admin/service-jobs/" + r.documents.job);
    await owner.locator("select[name=assignmentMode]").selectOption("POOL_CLAIM"); await owner.locator("select[name=employeeId]").selectOption(""); await owner.getByRole("button", { name: "Phát hành phiếu việc", exact: true }).click();
    await b.wait(async () => !!(await qa.sql`select id from public.work_items where service_job_id=${r.documents.job}`)[0]);
    r.documents.work = (await qa.sql`select id from public.work_items where service_job_id=${r.documents.job}`)[0].id; await b.save();
  }
  let [w] = await qa.sql`select execution_state,version from public.work_items where id=${r.documents.work}`;
  if (w.execution_state === "AVAILABLE") {
    const wrongRole = await customer.request.post(origin + "/api/portal/work-items/claim", { data: { workItemId: r.documents.work, version: w.version, operationId: crypto.randomUUID() } });
    assert.equal(wrongRole.status(), 403); await b.record("CUSTOMER_CANNOT_CLAIM_WORKER_POOL_JOB", { http: wrongRole.status() });
    await worker.goto(origin + "/work/pool");
    const card = worker.locator("article").filter({ has: worker.getByRole("heading", { name: /QA nhận việc từ kho việc/ }) });
    await card.getByRole("button", { name: "Nhận việc này", exact: true }).click(); await worker.waitForURL(u => u.pathname === "/work/jobs/" + r.documents.work);
    [w] = await qa.sql`select execution_state,version from public.work_items where id=${r.documents.work}`; assert.equal(w.execution_state, "CLAIMED");
    const [a] = await qa.sql`select employee_id from public.work_item_assignments where work_item_id=${r.documents.work} and superseded_at is null`; assert.equal(a.employee_id, d.personas.worker.employee);
    await b.record("WORKER_UI_CLAIMS_EXACT_POOL_SOURCE_CURRENT_ASSIGNMENT", { assignment: a.employee_id, state: w.execution_state });
  }
  [w] = await qa.sql`select execution_state from public.work_items where id=${r.documents.work}`;
  if (w.execution_state === "CLAIMED") {
    await worker.goto(origin + "/work/jobs/" + r.documents.work); await worker.getByRole("button", { name: /Bắt đầu/ }).click();
    await b.wait(async () => (await qa.sql`select execution_state from public.work_items where id=${r.documents.work}`)[0].execution_state === "IN_PROGRESS");
  }
  [w] = await qa.sql`select execution_state from public.work_items where id=${r.documents.work}`;
  if (w.execution_state === "IN_PROGRESS") {
    await worker.goto(origin + "/work/jobs/" + r.documents.work); await worker.getByLabel("Số lượng thực tế", { exact: true }).fill("1");
    await worker.getByLabel("Ghi chú hiện trường").fill("QA hoàn thành một giờ; quản lý xác minh riêng"); await worker.getByRole("button", { name: "Gửi kết quả công việc", exact: true }).click();
    await b.wait(async () => (await qa.sql`select execution_state from public.work_items where id=${r.documents.work}`)[0].execution_state === "DONE");
    const [fact] = await qa.sql`select (select count(*)::int from public.service_verifications where service_job_id=${r.documents.job}) verifications,(select count(*)::int from public.payments where customer_id=${d.customer}) cash`;
    assert.equal(fact.verifications, 0); await b.record("WORKER_RESULT_DOES_NOT_REPLACE_MANAGER_VERIFICATION", fact);
  }
  [w] = await qa.sql`select execution_state from public.work_items where id=${r.documents.work}`;
  if (w.execution_state === "DONE") {
    await owner.goto(origin + "/admin/service-jobs/" + r.documents.job);
    await owner.locator("input[name=billableQuantity]").fill("1"); await owner.locator("input[name=compensableQuantity]").fill("1");
    await owner.locator("input[name=billableAmount]").fill("111111"); await owner.locator("textarea[name=note]").fill("QA xác minh riêng cho nguồn kho việc, không tự thu tiền");
    await owner.getByRole("button", { name: "Xác minh và tạo khoản phải thu", exact: true }).click();
    await b.wait(async () => (await qa.sql`select execution_state from public.work_items where id=${r.documents.work}`)[0].execution_state === "VERIFIED");
  }
  const [fact] = await qa.sql`select (select count(*)::int from public.service_verifications where service_job_id=${r.documents.job}) verifications,(select original_amount_vnd::text from public.receivable_obligations ar join public.service_verifications v on v.id=ar.service_verification_id where v.service_job_id=${r.documents.job}) ar`;
  assert.deepEqual(fact, { verifications: 1, ar: "111111" }); await b.record("MANAGER_VERIFIES_POOL_RESULT_ONCE_AND_SOURCE_AR111111", fact);
  await b.finish();
} catch (e) { r.status = "FAIL"; r.error = e.message.split("\n")[0]; await b.debug(); await b.save(); throw e; }
finally { await b.close(); }
