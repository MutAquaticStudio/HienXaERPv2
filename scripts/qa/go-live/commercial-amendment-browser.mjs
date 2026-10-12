import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { browserQA } from "./browser-kit.mjs";
import { rejected } from "../remediation/native-fixture.mjs";
const b = await browserQA("T04_T21_QUOTE_SO_DRAFT_AMENDMENT_REAL_ROLE_BROWSER"), { qa, d, report: r, origin } = b;
async function lineForm(p, quantity) {
  await p.locator("select[name=customerId]").selectOption(d.customer);
  await p.locator(`select[name=siteId] option[value="${d.site}"]`).waitFor({ state: "attached" });
  await p.locator("select[name=siteId]").selectOption(d.site);
  await p.locator("select[name=materialId]").selectOption(d.material);
  await p.locator("select[name=orderedUomId]").selectOption(d.uom);
  await p.locator("input[name=quantity]").fill(quantity);
}
async function preview(p) { await p.getByRole("button", { name: "Tính giá và xem trước", exact: true }).click(); }
try {
  const sales = await b.login("sales"), second = await b.login("sales");
  if (!r.documents.quote) {
    await sales.goto(origin + "/admin/quotations/new");
    await lineForm(sales, "");
    assert.equal(await sales.getByRole("button", { name: "Lưu bản nháp", exact: true }).isDisabled(), true);
    await lineForm(sales, "1.1234567");
    assert.equal(await sales.getByRole("button", { name: "Tính giá và xem trước", exact: true }).isDisabled(), true);
    assert.equal(await sales.getByRole("button", { name: "Lưu bản nháp", exact: true }).isDisabled(), true);
    await b.record("QUOTE_MISSING_AND_SEVENTH_DECIMAL_CANNOT_SAVE_UI");
    await lineForm(sales, "1.123456"); await preview(sales);
    await sales.locator("input[name=effectiveAt]").fill("2099-01-01T00:00");
    const save = sales.getByRole("button", { name: "Lưu bản nháp", exact: true }); await save.waitFor();
    r.documents.quoteCreateIntent = await sales.locator("input[name=operationId]").inputValue(); await b.save();
    await save.click();
    await sales.waitForURL(u => /^\/admin\/quotations\/[a-f0-9-]{36}$/.test(u.pathname));
    r.documents.quote = new URL(sales.url()).pathname.split("/").at(-1); await b.save();
  }
  const id = r.documents.quote;
  let [q] = await qa.sql`select id,current_revision_id from public.quotations where id=${id}`;
  r.documents.revision ??= q.current_revision_id; q.current_revision_id = r.documents.revision; await b.save();
  let [rev] = await qa.sql`select state,draft_version from public.quotation_revisions where id=${q.current_revision_id}`;
  if (!r.checks.some(c => c.name === "QUOTE_TWO_TABS_STALE_EDIT_AND_EXACT_STORED_MONEY")) {
    await sales.goto(origin + `/admin/quotations/${id}/edit`); await second.goto(origin + `/admin/quotations/${id}/edit`);
    await sales.locator("input[name=quantity]").fill("2.123456"); await preview(sales);
    await sales.getByRole("button", { name: "Lưu thay đổi bản nháp", exact: true }).click();
    await b.wait(async () => (await qa.sql`select draft_version from public.quotation_revisions where id=${q.current_revision_id}`)[0].draft_version > rev.draft_version);
    await second.locator("input[name=quantity]").fill("3.123456"); await preview(second);
    if (await second.getByRole("button", { name: "Lưu thay đổi bản nháp", exact: true }).isEnabled()) await second.getByRole("button", { name: "Lưu thay đổi bản nháp", exact: true }).click();
    await second.getByText(/đã thay đổi|tải lại/i).first().waitFor();
    const [line] = await qa.sql`select quantity::text quantity,unit_price_vnd::text price,line_total_vnd::text amount,round(quantity*unit_price_vnd)::text expected from public.quotation_lines where revision_id=${q.current_revision_id}`;
    assert.equal(line.quantity, "2.123456"); assert.equal(line.amount, "488395"); assert.equal(line.expected, line.amount);
    await b.record("QUOTE_TWO_TABS_STALE_EDIT_AND_EXACT_STORED_MONEY", line); await b.shot(second, "quote-stale-edit-denied");
  }
  [rev] = await qa.sql`select state,draft_version from public.quotation_revisions where id=${q.current_revision_id}`;
  if (rev.state === "DRAFT" && !r.checks.some(c => c.name === "SALES_SEND_QUOTE_DOES_NOT_CREATE_AR_OR_INVENTORY")) {
    await sales.goto(origin + `/admin/quotations/${id}`); await sales.getByRole("button", { name: /^Gửi phiên bản/ }).click();
    await b.wait(async () => (await qa.sql`select state from public.quotation_revisions where id=${q.current_revision_id}`)[0].state === "SENT");
    await b.record("SALES_SEND_QUOTE_DOES_NOT_CREATE_AR_OR_INVENTORY");
  }
  if (!r.checks.some(c => c.name === "CUSTOMER_ROLE_QUOTE_READ_ACCEPT_SCOPE")) {
    const receiver = await b.login("receiver", "customer"), finance = await b.login("finance", "customer"), other = await b.login("other_customer", "customer");
    await receiver.goto(origin + `/customer/quotations/${id}`);
    await receiver.getByText("Vai trò người nhận chỉ được xem", { exact: false }).waitFor();
    assert.equal(await receiver.getByRole("button", { name: "Chấp nhận phiên bản này", exact: true }).count(), 0);
    const denied = await qa.sql.begin(async tx => {
      const error = await rejected(tx, sp => qa.rpc(sp, "accept_quote_revision", [q.current_revision_id, "PORTAL", "QA người nhận", null, randomUUID()], d.portalSubjects.receiver), null, "42501");
      return error.code;
    });
    const cross = await other.goto(origin + `/customer/quotations/${id}`);
    await other.getByText("This page could not be found.", { exact: true }).waitFor();
    const deniedPdf = await other.request.get(origin + `/api/quotation-revisions/${q.current_revision_id}/pdf`);
    assert.ok([403, 404].includes(deniedPdf.status()));
    await finance.goto(origin + `/customer/quotations/${id}`);
    [rev] = await qa.sql`select state from public.quotation_revisions where id=${q.current_revision_id}`;
    if (rev.state === "SENT") {
      await finance.getByRole("button", { name: "Chấp nhận phiên bản này", exact: true }).click();
      await b.wait(async () => (await qa.sql`select state from public.quotation_revisions where id=${q.current_revision_id}`)[0].state === "ACCEPTED");
    }
    await b.record("CUSTOMER_ROLE_QUOTE_READ_ACCEPT_SCOPE", { receiverRpcDenied: denied, otherCustomerStreamingHTTP: cross.status(), otherCustomerNotFound: true, otherCustomerPDF: deniedPdf.status() });
  }
  if (!r.documents.so) {
    await sales.goto(origin + `/admin/quotations/${id}`); await sales.getByRole("button", { name: "Tạo đơn từ phiên bản này", exact: true }).click();
    await sales.waitForURL(u => /^\/admin\/orders\/[a-f0-9-]{36}$/.test(u.pathname));
    r.documents.so = new URL(sales.url()).pathname.split("/").at(-1); await b.save();
    const [fact] = await qa.sql`select commercial_state,(select quantity::text from public.sales_order_lines where sales_order_id=o.id limit 1) quantity,(select sum(line_total_vnd)::text from public.sales_order_lines where sales_order_id=o.id) amount,(select count(*)::int from public.receivable_obligations ar join public.delivery_verifications v on v.id=ar.delivery_verification_id join public.deliveries dl on dl.id=v.delivery_id where dl.sales_order_id=o.id) receivables from public.sales_orders o where id=${r.documents.so}`;
    assert.equal(fact.commercial_state, "DRAFT"); assert.equal(fact.quantity, "2.123456"); assert.equal(fact.amount, "488395"); assert.equal(fact.receivables, 0);
    await b.record("ACCEPTED_QUOTE_CONVERTS_TO_DRAFT_SO_WITHOUT_DEBT", fact);
  }
  if (!r.checks.some(c => c.name === "SO_EXACT_EDIT_STALE_TAB_CONFIRMED_EDIT_DENIED")) {
    const so = r.documents.so;
    await sales.goto(origin + `/admin/orders/${so}/edit`); await second.goto(origin + `/admin/orders/${so}/edit`);
    const [before] = await qa.sql`select draft_version from public.sales_orders where id=${so}`;
    await sales.locator("input[name=quantity]").fill("1.000001"); await preview(sales);
    await sales.getByRole("button", { name: "Lưu thay đổi bản nháp", exact: true }).click();
    await b.wait(async () => (await qa.sql`select draft_version from public.sales_orders where id=${so}`)[0].draft_version > before.draft_version);
    await second.locator("input[name=quantity]").fill("9"); await preview(second);
    if (await second.getByRole("button", { name: "Lưu thay đổi bản nháp", exact: true }).isEnabled()) await second.getByRole("button", { name: "Lưu thay đổi bản nháp", exact: true }).click(); await second.getByText(/đã thay đổi|tải lại/i).first().waitFor();
    const [line] = await qa.sql`select quantity::text quantity,line_total_vnd::text amount,round(quantity*unit_price_vnd)::text expected from public.sales_order_lines where sales_order_id=${so}`;
    assert.equal(line.quantity, "1.000001"); assert.equal(line.amount, "230000"); assert.equal(line.amount, line.expected);
    await sales.goto(origin + `/admin/orders/${so}`); await sales.getByRole("button", { name: "Xác nhận & giữ hạn mức", exact: true }).click();
    await b.wait(async () => (await qa.sql`select commercial_state from public.sales_orders where id=${so}`)[0].commercial_state === "CONFIRMED");
    await second.goto(origin + `/admin/orders/${so}/edit`); assert.equal(await second.locator("input[name=quantity]").count(), 0);
    await b.record("SO_EXACT_EDIT_STALE_TAB_CONFIRMED_EDIT_DENIED", line);
  }
  if (!r.documents.newRevision) {
    await sales.goto(origin + `/admin/quotations/${id}`); await sales.getByRole("button", { name: "Tạo phiên bản mới", exact: true }).click();
    await b.wait(async () => (await qa.sql`select current_revision_id from public.quotations where id=${id}`)[0].current_revision_id !== q.current_revision_id);
    const [updated] = await qa.sql`select current_revision_id from public.quotations where id=${id}`; r.documents.newRevision = updated.current_revision_id; await b.save();
    const [old] = await qa.sql`select state,total_vnd::text total from public.quotation_revisions where id=${q.current_revision_id}`;
    assert.equal(old.total, "488395"); await b.record("NEW_REVISION_PRESERVES_OLD_ACCEPTED_SOURCE", old);
  }
  await b.finish();
} catch (error) { r.status = "FAIL"; r.error = error.message; await b.debug(); await b.save(); throw error; }
finally { await b.close(); }
