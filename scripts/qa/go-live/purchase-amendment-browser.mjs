import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { browserQA } from "./browser-kit.mjs";
const b = await browserQA("BUYER_PO_EDIT_STALE_CONFIRM_CANCEL_NO_STOCK_AP_WITHOUT_RECEIPT"), { qa, report: r, origin } = b;
const quote = JSON.parse(await readFile("reports/go-live-acceptance/QUOTATION_MONEY183.json", "utf8")).documents;
r.documents.po ??= quote.po; await b.save();
try {
  const buyer = await b.login("purchasing"), second = await b.login("purchasing"); const id = r.documents.po;
  if (!r.checks.some(c=>c.name==="PO_TWO_TAB_EDIT_EXACT_QUANTITY_AND_PRICE_SNAPSHOT_STALE_DENIED")) {
    await buyer.goto(origin + `/admin/purchase-orders/${id}/edit`); await second.goto(origin + `/admin/purchase-orders/${id}/edit`);
    const [before] = await qa.sql`select draft_version from public.purchase_orders where id=${id}`;
    await buyer.locator("input[name=quantity]").fill("2.123456"); await buyer.getByRole("button", { name: "Tính giá mua và xem trước", exact: true }).click();
    await buyer.getByRole("button", { name: "Lưu thay đổi đơn mua nháp", exact: true }).click();
    await b.wait(async()=> (await qa.sql`select draft_version from public.purchase_orders where id=${id}`)[0].draft_version>before.draft_version);
    await second.locator("input[name=quantity]").fill("9"); await second.getByRole("button", { name: "Tính giá mua và xem trước", exact: true }).click();
    const save = second.getByRole("button", { name: "Lưu thay đổi đơn mua nháp", exact: true }); if(await save.isEnabled()) await save.click();
    await second.getByText(/đã thay đổi|tải lại/i).first().waitFor();
    const [line] = await qa.sql`select quantity::text quantity,unit_cost_vnd::text price,line_total_cost_vnd::text amount,round(quantity*unit_cost_vnd)::text expected from public.purchase_order_lines where purchase_order_id=${id}`;
    assert.equal(line.quantity,"2.123456"); assert.equal(line.price,"150000"); assert.equal(line.amount,"318518"); assert.equal(line.amount,line.expected);
    await b.record("PO_TWO_TAB_EDIT_EXACT_QUANTITY_AND_PRICE_SNAPSHOT_STALE_DENIED",line);
  }
  let [po] = await qa.sql`select state from public.purchase_orders where id=${id}`;
  if(po.state==="DRAFT"){
    await buyer.goto(origin+`/admin/purchase-orders/${id}`); await buyer.getByRole("button",{name:"Xác nhận đơn mua",exact:true}).click();
    await b.wait(async()=> (await qa.sql`select state from public.purchase_orders where id=${id}`)[0].state==="CONFIRMED");
    const [facts] = await qa.sql`select (select count(*)::int from public.purchase_receipts where purchase_order_id=${id}) receipts,(select count(*)::int from public.inventory_movements where material_id=${quote.material}) stock_movements`;
    assert.deepEqual(facts,{receipts:0,stock_movements:0}); await b.record("PO_CONFIRM_WITHOUT_RECEIPT_HAS_NO_PHANTOM_STOCK",facts);
  }
  [po] = await qa.sql`select state from public.purchase_orders where id=${id}`;
  if(po.state==="CONFIRMED"){
    await buyer.goto(origin+`/admin/purchase-orders/${id}`); const f=buyer.locator("form").filter({has:buyer.getByRole("button",{name:"Hủy đơn mua",exact:true})});
    await f.locator("input[name=reason]").fill("QA hủy nguồn mua chưa nhận, giữ lịch sử"); await f.locator('input[type=checkbox]').check(); await f.getByRole("button",{name:"Hủy đơn mua",exact:true}).click();
    await b.wait(async()=> (await qa.sql`select state from public.purchase_orders where id=${id}`)[0].state==="CANCELLED");
  }
  const [final] = await qa.sql`select state,(select count(*)::int from public.purchase_receipts where purchase_order_id=p.id) receipts,(select count(*)::int from public.inventory_movements where material_id=${quote.material}) movements from public.purchase_orders p where id=${id}`;
  assert.deepEqual(final,{state:"CANCELLED",receipts:0,movements:0}); await b.record("PO_CANCEL_UNRECEIVED_SOURCE_PRESERVES_HISTORY_NO_INVENTORY",final);
  await b.finish();
}catch(e){r.status="FAIL";r.error=e.message.split("\n")[0];await b.debug();await b.save();throw e;}finally{await b.close();}
