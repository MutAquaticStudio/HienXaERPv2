import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { browserQA } from "./browser-kit.mjs";
const b = await browserQA("CATALOG_OWNER_CREATE_LOST_RESPONSE_RELOAD_SAME_INTENT_NO_DUPLICATE"), { qa, d, report: r, origin } = b;
r.documents.code ??= "GWH" + randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase(); await b.save();
try {
  const owner = await b.login("owner"), sales = await b.login("sales"), url = origin + "/admin/inventory/warehouses?kind=warehouses";
  await owner.goto(url);
  const existing = r.documents.intent && (await qa.sql`select id from public.warehouses where id=${r.documents.intent}`)[0];
  if (!existing) {
    const stored = r.documents.intent && (await qa.sql`select operation_id from private.command_drafts where operation_id=${r.documents.intent}`)[0];
    if (stored) {
      const key = `hx-intent-v1:${d.fixtures.owner}:${d.branch}:CATALOG:warehouses:NEW:save_catalog_record`;
      await owner.evaluate(([k,v]) => localStorage.setItem(k,v), [key,r.documents.intent]); await owner.reload();
    }
    await owner.getByText("Thêm kho", { exact: true }).click();
    const form = owner.locator("form").filter({ has: owner.locator('input[name=editing][value="false"]') });
    if (!stored) {
      await form.locator("input[name=code]").fill(r.documents.code); await form.locator("input[name=name]").fill("QA kho phục hồi thao tác");
      await form.locator("input[name=reason]").fill("QA mất phản hồi sau khi lưu, giữ mã ý định");
    }
    const intent = stored ? r.documents.intent : await form.locator("input[name=operationId]").inputValue(); r.documents.intent = intent; await b.save();
    let lost = false;
    await owner.route("**/admin/inventory/warehouses?*", async route => {
      try {
        if (lost || route.request().method() !== "POST") return route.continue();
        const response = await route.fetch();
        const [saved] = await qa.sql`select exists(select 1 from public.command_receipts where operation_id=${intent}) value`;
        if (saved.value) { lost = true; r.responseLostAfterCommit = true; await b.save(); await route.abort("connectionfailed"); }
        else await route.fulfill({ response });
      } catch(e) {
        r.routeFailure = e.message.split("\n")[0]; await b.save();
        try { await route.abort("failed"); } catch { /* Browser teardown; report already records the failed interception. */ }
      }
    });
    await form.getByRole("button", { name: stored ? "Thử lại cùng thao tác" : "Lưu thay đổi", exact: true }).click();
    await b.wait(async () => !!(await qa.sql`select id from public.warehouses where id=${intent}`)[0]);
    await owner.getByText(/Phản hồi bị gián đoạn|chưa xác định được kết quả/i).first().waitFor(); assert.equal(lost, true);
    await b.record("CATALOG_REAL_SERVER_COMMITTED_RESPONSE_LOST", { intent });
  } else {
    assert.ok(r.responseLostAfterCommit || r.undeliveredResponseConfirmedByIndependentReadback, "Existing source requires recorded uncertain-response evidence");
    const key = `hx-intent-v1:${d.fixtures.owner}:${d.branch}:CATALOG:warehouses:NEW:save_catalog_record`;
    await owner.evaluate(([k,v]) => localStorage.setItem(k,v), [key,r.documents.intent]);
  }
  await owner.reload(); await owner.getByText("Thêm kho", { exact: true }).click();
  const form = owner.locator("form").filter({ has: owner.locator('input[name=editing][value="false"]') });
  await form.getByText("Thao tác này đã được ghi nhận.", { exact: false }).waitFor();
  const open = form.getByRole("link", { name: "Mở bản ghi", exact: true }); await open.waitFor(); assert.ok((await open.getAttribute("href")).includes(r.documents.intent));
  const [fact] = await qa.sql`select (select count(*)::int from public.warehouses where branch_id=${d.branch} and code=${r.documents.code}) records,(select count(*)::int from public.command_receipts where operation_id=${r.documents.intent}) receipts,(select count(*)::int from public.audit_events where trace_id=${r.documents.intent}) audits`;
  assert.deepEqual(fact, { records: 1, receipts: 1, audits: 1 }); await b.record("CATALOG_RELOAD_RECOVERS_ONE_SOURCE_ONE_RECEIPT_ONE_AUDIT", fact);
  if (!r.checks.some(c => c.name === "CATALOG_EDIT_HTTP_RESPONSE_LOST_AFTER_COMMIT_RELOAD_RECOVERS_ORIGINAL_INTENT")) {
    await owner.goto(url + "&id=" + r.documents.intent);
    const edit = owner.locator("form").filter({ has: owner.locator(`input[name=id][value="${r.documents.intent}"]`) });
    await edit.locator("input[name=name]").fill("QA kho đã đối chiếu sau phục hồi"); await edit.locator("input[name=reason]").fill("QA sửa cùng nguồn và mất phản hồi sau lưu");
    const editIntent = await edit.locator("input[name=operationId]").inputValue(); r.documents.editIntent = editIntent; await b.save();
    await owner.exposeFunction("qaMasterEditCommitted", async () => !!(await qa.sql`select operation_id from public.command_receipts where operation_id=${editIntent}`)[0]);
    await owner.evaluate(() => {
      const originalFetch = window.fetch.bind(window);
      const state = window;
      state.qaMasterFaultInjected = false;
      window.fetch = async (...args) => {
        const response = await originalFetch(...args);
        const options = args[1];
        if (!state.qaMasterFaultInjected && options?.method === "POST" && await state.qaMasterEditCommitted()) {
          state.qaMasterFaultInjected = true; throw new TypeError("QA response lost after actual commit");
        }
        return response;
      };
    });
    await edit.getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
    await edit.getByText(/Phản hồi bị gián đoạn/).waitFor();
    assert.equal(await owner.evaluate(() => window.qaMasterFaultInjected), true);
    await owner.reload();
    const recovered = owner.locator("form").filter({ has: owner.locator(`input[name=id][value="${r.documents.intent}"]`) });
    await recovered.getByText("Thao tác này đã được ghi nhận.", { exact: false }).waitFor();
    const [after] = await qa.sql`select name,(select count(*)::int from public.command_receipts where operation_id=${editIntent}) receipts,(select count(*)::int from public.audit_events where trace_id=${editIntent}) audits from public.warehouses where id=${r.documents.intent}`;
    assert.equal(after.name, "QA kho đã đối chiếu sau phục hồi"); assert.equal(after.receipts, 1); assert.equal(after.audits, 1);
    await b.record("CATALOG_EDIT_HTTP_RESPONSE_LOST_AFTER_COMMIT_RELOAD_RECOVERS_ORIGINAL_INTENT", after);
  }
  await sales.goto(url); await sales.getByText("Không có quyền quản lý danh mục.", { exact: true }).waitFor();
  assert.equal(await sales.locator('input[name=kind]').count(), 0); await b.record("SALES_CANNOT_OPEN_ROLE_ADMIN_WAREHOUSE_WRITE");
  await b.shot(owner, "master-recovered-after-lost-response"); await b.finish();
} catch (e) { r.status = "FAIL"; r.error = e.message; await b.debug(); await b.save(); throw e; }
finally { await b.close(); }
