import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { chromium } from "@playwright/test";
import { argumentsForRun, openQA, stockFixture } from "../remediation/native-fixture.mjs";

const a = argumentsForRun(), q = await openQA(a);
assert.equal(a.database, "hx_remediation_go_live_browser175");
const d = JSON.parse(await readFile(a.documents, "utf8")).documents;
const env = parseEnv(await readFile(a["auth-env"], "utf8"));
assert.equal(env.HX_QA_PROJECT_REF, "ffrwiglcrlumfvhubaxg");
const origin = "http://127.0.0.1:3112";
let report;
try { report = JSON.parse(await readFile(a.out, "utf8")); }
catch (error) { if (error.code !== "ENOENT") throw error; }
report ??= { scope: "MULTI_MATERIAL_UOM_DELIVERY_WITH_REAL_LOST_RESPONSE_AND_SAME_INTENT_RETRY", productionAccess: "NONE", checks: [], documents: {} };
assert.notEqual(report.status, "PASS", "Completed acceptance must not be replayed");
const save = () => writeFile(a.out, JSON.stringify(report, null, 2));
const browser = await chromium.launch({ headless: true });
const contexts = [];
async function login(role, work = false) {
  const c = await browser.newContext({ viewport: { width: 1280, height: 900 } }); contexts.push(c);
  await c.addCookies([{ name: "hx_branch_id", value: d.branch, url: origin }]);
  const p = await c.newPage(); await p.goto(origin + (work ? "/work/login" : "/login"));
  await p.getByLabel("Thư điện tử").fill("hxqa-" + role + "@example.test");
  await p.getByLabel("Mật khẩu", { exact: true }).fill(env.HX_QA_PASSWORD);
  await p.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await p.waitForURL(u => u.pathname.startsWith(work ? "/work" : "/admin") && !u.pathname.endsWith("/login"));
  return p;
}
try {
  if (!report.documents.source) {
    report.documents.source = await q.sql.begin(async tx => {
      const s = await stockFixture(tx, { ...q, fixtures: d.fixtures }, "3", { prepareOnly: true });
      await tx.unsafe("set local role postgres");
      const kg = randomUUID(), bag = randomUUID(), material = randomUUID(), sale = randomUUID(), buy = randomUUID();
      const [group] = await tx`select group_id from public.materials where id=${s.material}`;
      await tx`insert into public.units_of_measure(id,code,name,symbol,decimal_scale) values
        (${kg},${s.prefix.toLowerCase() + "kg"},'Kilogram nghiệm thu','kg',6),(${bag},${s.prefix.toLowerCase() + "bag"},'Bao25kg nghiệm thu','bao25kg',0)`;
      await tx`insert into public.materials(id,group_id,code,name,base_uom_id) values
        (${material},${group.group_id},${s.prefix + "BAG"},'QA giao vật tư bao25kg',${kg})`;
      await tx`insert into public.material_uom_conversions(material_id,from_uom_id,to_uom_id,numerator,denominator,conversion_type,rounding_mode,settlement_allowed,effective_from,source_note) values
        (${material},${bag},${kg},25,1,'PACKAGING','HALF_UP',true,'2020-01-01','Bao QA định lượng25kg'),
        (${s.material},${s.uom},${kg},1600,1,'MEASURED','HALF_UP',false,'2020-01-01','Căn cứ QA riêng cho vật tư mới:1600kg/m3')`;
      await tx`insert into public.pricing_rules(id,branch_id,scope_type,material_id,price_uom_id,unit_price_vnd,version,source_type,effective_from,created_by)
        values(${sale},${d.branch},'DEFAULT',${material},${bag},25000,1,'LIST','2020-01-01',${d.fixtures.owner})`;
      await tx`insert into public.purchase_price_rules(id,branch_id,supplier_id,material_id,purchase_uom_id,unit_cost_vnd,version,source_type,effective_from,created_by)
        values(${buy},${d.branch},${d.fixtures.supplier},${material},${kg},1000,1,'CONTRACT','2020-01-01',${d.fixtures.owner})`;
      await q.rpc(tx, "confirm_purchase_order", [s.po, randomUUID()], d.personas.purchasing.subject);
      const [line] = await tx`select id from public.purchase_order_lines where purchase_order_id=${s.po}`;
      await q.rpc(tx, "receive_purchase_order", [s.po, [{ purchase_order_line_id: line.id, received_quantity: "3" }], null, new Date().toISOString(), randomUUID()], d.personas.warehouse.subject);
      const po = await q.rpc(tx, "create_purchase_order_draft", [d.branch, d.fixtures.supplier, d.fixtures.warehouse, null, "Nguồn mới cho ca giao nhiều đơn vị", [{ material_id: material, ordered_uom_id: kg, quantity: "50", conversion_numerator: "1", conversion_denominator: "1", rounding_mode: "HALF_UP", unit_cost_vnd: "1000", purchase_price_rule_id: buy, purchase_price_rule_version: 1, price_source_type: "CONTRACT" }], randomUUID()], d.personas.purchasing.subject);
      await q.rpc(tx, "confirm_purchase_order", [po, randomUUID()], d.personas.purchasing.subject);
      const [second] = await tx`select id from public.purchase_order_lines where purchase_order_id=${po}`;
      await q.rpc(tx, "receive_purchase_order", [po, [{ purchase_order_line_id: second.id, received_quantity: "50" }], null, new Date().toISOString(), randomUUID()], d.personas.warehouse.subject);
      const vehicle = randomUUID();
      await q.rpc(tx, "save_catalog_record", ["vehicles", vehicle, d.branch, { code: s.prefix, plate_number: s.prefix, capacity_quantity: "10000", capacity_uom_id: kg, capacity_source_note: "Xe QA riêng10t, căn cứ vật tư1600kg/m3 + bao25kg", active: true }, null, "Xe riêng cho ca nhiều đơn vị", randomUUID()], d.fixtures.owner);
      return { ...s, kg, bag, secondMaterial: material, secondPo: po, vehicle };
    }); await save();
  }
  const m = report.documents.source;
  const sales = await login("sales");
  if (!report.documents.so) {
    await sales.goto(origin + "/admin/orders/new");
    await sales.locator("select[name=customerId]").selectOption(m.customer);
    await sales.locator(`select[name=siteId] option[value="${m.site}"]`).waitFor({ state: "attached" });
    await sales.locator("select[name=siteId]").selectOption(m.site);
    await sales.locator("select[name=materialId]").selectOption(m.material);
    await sales.locator("select[name=orderedUomId]").selectOption(m.uom);
    await sales.locator("input[name=quantity]").fill("3");
    await sales.getByRole("button", { name: "+ Thêm dòng", exact: true }).click();
    await sales.locator("select[name=materialId]").nth(1).selectOption(m.secondMaterial);
    await sales.locator("select[name=orderedUomId]").nth(1).selectOption(m.bag);
    await sales.locator("input[name=quantity]").nth(1).fill("2");
    await sales.getByRole("button", { name: "Tính giá và xem trước", exact: true }).click();
    await sales.getByRole("button", { name: "Lưu bản nháp", exact: true }).click();
    await sales.waitForURL(u => /\/admin\/orders\/[0-9a-f-]{36}$/.test(u.pathname));
    report.documents.so = new URL(sales.url()).pathname.split("/").at(-1); await save();
    await sales.getByRole("button", { name: "Xác nhận & giữ hạn mức", exact: true }).click();
    await sales.getByRole("button", { name: "Xác nhận & giữ hạn mức", exact: true }).waitFor({ state: "detached" });
  }
  const so = report.documents.so, buyer = await login("purchasing"), wh = await login("warehouse-dispatch");
  if (!report.documents.delivery) {
    await buyer.goto(origin + "/admin/orders/" + so);
    for (const [material, amount] of [[m.material, "3"], [m.secondMaterial, "50"]]) {
      const [line] = await q.sql`select id from public.sales_order_lines where sales_order_id=${so} and material_id=${material}`;
      const form = buyer.locator("form").filter({ has: buyer.locator(`input[name=salesLineId][value="${line.id}"]`) });
      await form.locator("select").selectOption(d.fixtures.warehouse); await form.locator("input[name=quantity]").fill(amount);
      await form.getByRole("button", { name: "Chọn nguồn kho", exact: true }).click();
      await form.getByRole("button", { name: "Chọn nguồn kho", exact: true }).waitFor({ state: "detached" });
    }
    await wh.goto(origin + "/admin/orders/" + so);
    const form = wh.locator("form").filter({ has: wh.getByRole("button", { name: "Tạo phiếu giao nhiều dòng", exact: true }) });
    const allocs = await q.sql`select a.id,l.material_id from public.supply_allocations a join public.sales_order_lines l on l.id=a.sales_order_line_id where l.sales_order_id=${so}`;
    for (const x of allocs) await form.locator("#delivery-" + x.id).fill(x.material_id === m.material ? "3" : "50");
    await form.locator("input[name=scheduledAt]").fill("2200-01-04T07:00");
    await form.getByRole("button", { name: "Tạo phiếu giao nhiều dòng", exact: true }).click();
    await wh.waitForURL(u => /\/admin\/deliveries\/[0-9a-f-]{36}$/.test(u.pathname));
    report.documents.delivery = new URL(wh.url()).pathname.split("/").at(-1); await save();
    await wh.getByLabel("Người giao", { exact: true }).selectOption(d.personas.worker.employee);
    await wh.getByLabel("Xe", { exact: true }).selectOption(m.vehicle);
    await wh.getByLabel("Giờ bắt đầu giao", { exact: true }).fill("2200-01-04T07:00");
    await wh.getByLabel("Giờ kết thúc dự kiến", { exact: true }).fill("2200-01-04T08:00");
    await wh.getByRole("button", { name: "Phân người và xe", exact: true }).click();
    await wh.getByRole("button", { name: "Giao việc qua cổng thợ", exact: true }).click();
    await wh.getByRole("button", { name: "Giao việc qua cổng thợ", exact: true }).waitFor({ state: "detached" });
    const [work] = await q.sql`select id from public.work_items where delivery_id=${report.documents.delivery}`;
    report.documents.work = work.id; await save();
  }
  const delivery = report.documents.delivery;
  const worker = await login("worker", true);
  const [progress] = await q.sql`select execution_state from public.deliveries where id=${delivery}`;
  if (["ASSIGNED", "DISPATCHED", "ARRIVED"].includes(progress.execution_state)) {
    await worker.goto(origin + "/work/jobs/" + report.documents.work);
    const [currentWork] = await q.sql`select execution_state state from public.work_items where id=${report.documents.work}`;
    if (currentWork.state !== "IN_PROGRESS") {
      const start = worker.getByRole("button", { name: /Bắt đầu/ }); await start.waitFor(); await start.click();
      await start.waitFor({ state: "detached" });
    }
    await wh.goto(origin + "/admin/deliveries/" + delivery);
    if (progress.execution_state === "ASSIGNED") {
      await wh.getByRole("button", { name: "Bàn giao hàng lên xe", exact: true }).click();
      await wh.getByRole("button", { name: "Đã tới nơi giao", exact: true }).waitFor();
    }
    await worker.reload();
    const lines = await q.sql`select id,material_id from public.delivery_lines where delivery_id=${delivery}`;
    for (const line of lines) {
      const input = worker.locator("#actual-" + line.id);
      assert.equal(await input.getAttribute("max"), line.material_id === m.material ? "3.000000" : "50.000000");
      await input.fill(line.material_id === m.material ? "3" : "50");
    }
    await worker.getByLabel("Lý do chưa ghi nhận bước tới nơi").fill("QA mất phản hồi, báo đúng từng lượng thực lấy");
    await worker.getByLabel("Ghi chú hiện trường").fill("Giao đủ3m3 và50kg, chờ xác minh");
    let lost = false;
    await worker.route("**/api/portal/work-results", async route => {
      if (lost) return route.continue();
      const response = await route.fetch(); assert.equal(response.status(), 200);
      lost = true; await route.abort("connectionfailed");
    });
    await worker.getByRole("button", { name: "Gửi kết quả công việc", exact: true }).click();
    await worker.locator('[role="status"]').filter({ hasText: /Failed|fetch|thất bại|thử lại/i }).waitFor();
    const [first] = await q.sql`select count(*)::int n from public.delivery_results where delivery_id=${delivery}`;
    assert.equal(first.n, 1);
    await worker.getByRole("button", { name: "Gửi kết quả công việc", exact: true }).click();
    await worker.waitForURL(u => u.pathname === "/work");
    const [retry] = await q.sql`select count(*)::int n from public.delivery_results where delivery_id=${delivery}`;
    assert.equal(retry.n, 1);
    report.checks.push({ name: "REAL_SAVE_LOST_RESPONSE_SAME_INTENT_RETRY_MULTILINE", status: "PASS", results: retry.n }); await save();
  }
  await wh.goto(origin + "/admin/deliveries/" + delivery);
  const [pending] = await q.sql`select execution_state from public.deliveries where id=${delivery}`;
  const verify = wh.getByRole("button", { name: "Xác minh và ghi nhận", exact: true });
  if (pending.execution_state === "RESULT_SUBMITTED") { await verify.waitFor(); await verify.click(); await verify.waitFor({ state: "detached" }); }
  await wh.reload(); await sales.goto(origin + "/admin/orders/" + so);
  const [facts] = await q.sql`select
    (select sum(amount_vnd)::text from public.revenue_entries where sales_order_id=${so}) revenue,
    (select sum(r.original_amount_vnd)::text from public.receivable_obligations r join public.delivery_verifications v on v.id=r.delivery_verification_id where v.delivery_id=${delivery}) debt,
    (select sum(inventory_value_delta_vnd)::text from public.inventory_movements where delivery_id=${delivery} and location_kind='IN_TRANSIT') cargo_value,
    (select count(*)::int from public.delivery_verifications where delivery_id=${delivery}) verifications`;
  assert.deepEqual(facts, { revenue: "740000", debt: "740000", cargo_value: "0", verifications: 1 });
  const amounts = await q.sql`select material_id,sum(base_quantity_delta)::text quantity from public.inventory_movements where material_id in(${m.material},${m.secondMaterial}) and location_kind='WAREHOUSE' group by material_id`;
  assert.ok(amounts.every(x => x.quantity === "0.000000"));
  report.checks.push({ name: "MULTI_UOM_3M3_2BAGS50KG_STOCK_REVENUE_AR_SINGLE_VERIFICATION", status: "PASS", facts, amounts });
  const image = a.screenshots + "/multi-delivery-verified-retry.png";
  await wh.screenshot({ path: image, fullPage: true }); report.screenshot = image;
  report.status = "PASS"; report.checkedAt = new Date().toISOString(); await save();
  console.log(JSON.stringify({ status: "PASS", checks: report.checks.length, facts }));
} catch (error) {
  report.failures ??= []; report.failures.push({ at: new Date().toISOString(), message: error.message });
  report.lastFailure = error.message; await save(); throw error;
}
finally { for (const c of contexts) await c.close(); await browser.close(); await q.sql.end({ timeout: 3 }); }
