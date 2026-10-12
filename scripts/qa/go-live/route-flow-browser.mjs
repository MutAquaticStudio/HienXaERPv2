import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { stockFixture, salesFixture } from "../remediation/native-fixture.mjs";
import { browserQA } from "./browser-kit.mjs";
const b = await browserQA("DISPATCH_ROUTE_TWO_DELIVERY_SOURCES_CREATE_APPLY_RELOAD"), { qa, d, report: r, origin } = b;
try {
  if (!r.documents.deliveries) {
    r.documents = await qa.sql.begin(async tx => {
      const stock = await stockFixture(tx, qa, "5"), sale = await salesFixture(tx, qa, stock, d.personas.sales.subject);
      const allocation = await qa.rpc(tx, "upsert_supply_allocation", [sale.line, "WAREHOUSE", null, d.fixtures.warehouse, "5", null, null, randomUUID()], d.personas.purchasing.subject);
      const vehicle = randomUUID(); await qa.rpc(tx, "save_catalog_record", ["vehicles", vehicle, d.branch, { code: stock.prefix + "RT", plate_number: stock.prefix, capacity_quantity: "20", capacity_uom_id: stock.uom, capacity_source_note: "QA hồ sơ xe cho lộ trình nguồn riêng", active: true }, null, "QA xe riêng không dùng nguồn doanh nghiệp", randomUUID()], d.fixtures.owner);
      const deliveries = [];
      for (const [quantity, date] of [["3", "2200-03-01T00:00:00Z"], ["2", "2200-03-01T01:00:00Z"]]) {
        const id = await qa.rpc(tx, "create_delivery_from_allocations", [sale.so, [{ supply_allocation_id: allocation, planned_base_quantity: quantity }], date, randomUUID()], d.personas.warehouse.subject);
        const [row] = await tx`select delivery_number from public.deliveries where id=${id}`; deliveries.push({ id, number: row.delivery_number, quantity });
      }
      return { sale: sale.so, material: stock.material, vehicle, deliveries };
    }); await b.save();
  }
  const dispatch = await b.login("warehouse-dispatch"), worker = await b.login("worker", "work");
  if (r.documents.plan && !r.documents.schedulesCorrected) {
    await dispatch.goto(origin + "/admin/routes?plan=" + r.documents.plan);
    await dispatch.getByRole("button", { name: "Áp dụng và phân giao", exact: true }).click();
    await dispatch.getByText(/^Khung giờ phân giao đang chồng lấn/).waitFor();
    const [p] = await qa.sql`select status,(select count(*)::int from public.delivery_assignments where delivery_id in ${qa.sql(r.documents.deliveries.map(x=>x.id))} and superseded_at is null) assignments from public.route_plans where id=${r.documents.plan}`;
    assert.equal(p.status,"DRAFT"); assert.equal(p.assignments,0);
    await b.record("OVERLAPPING_DEFAULT_WINDOWS_REJECT_ATOMICALLY_AND_SHOW_SOURCE_SCHEDULE_GUIDANCE",p);
    r.documents.oldPlan=r.documents.plan;
    for (const [index,x] of r.documents.deliveries.entries()) {
      await dispatch.goto(origin + "/admin/deliveries/" + x.id);
      await dispatch.getByLabel("Người giao", {exact:true}).selectOption(d.personas.worker.employee);
      await dispatch.getByLabel("Xe", {exact:true}).selectOption(r.documents.vehicle);
      await dispatch.getByLabel("Giờ bắt đầu giao", {exact:true}).fill(index===0?"2200-03-01T07:00":"2200-03-01T08:00");
      await dispatch.getByLabel("Giờ kết thúc dự kiến", {exact:true}).fill(index===0?"2200-03-01T08:00":"2200-03-01T09:00");
      await dispatch.getByRole("button", {name:"Phân người và xe",exact:true}).click();
      await b.wait(async()=> (await qa.sql`select execution_state from public.deliveries where id=${x.id}`)[0].execution_state==="ASSIGNED");
    }
    r.documents.schedulesCorrected=true; delete r.documents.plan; await b.save();
    await b.record("DISPATCH_UI_SETS_REAL_NONOVERLAPPING_WINDOWS_NO_LIMIT_BYPASS");
  }
  if (!r.documents.plan) {
    await dispatch.goto(origin + "/admin/routes");
    await dispatch.getByLabel("Giờ khởi hành thực tế (giờ địa phương)").fill("2200-03-01T07:00");
    await dispatch.locator("select[name=vehicle_id]").selectOption(r.documents.vehicle); await dispatch.locator("select[name=driver_employee_id]").selectOption(d.personas.worker.employee);
    for (const x of r.documents.deliveries) await dispatch.getByLabel("Chọn " + x.number, { exact: true }).check();
    // The controlled date needs its hydrated state, not only the streamed SSR input.
    await dispatch.getByLabel("Giờ khởi hành thực tế (giờ địa phương)").fill("2200-03-01T07:00");
    await b.wait(async()=> Boolean(await dispatch.locator('input[name=departure_at_iso]').inputValue()));
    r.formBeforeSubmit = await dispatch.locator("form").filter({ has: dispatch.getByRole("button", { name: "Tạo đề xuất lộ trình", exact: true }) }).evaluate(form => ({ valid: form.checkValidity(), fields: [...form.elements].filter(x => (x.tagName === "INPUT" || x.tagName === "SELECT") && !x.name.startsWith("$")).map(x=>({name:x.name,type:x.type,value:x.value,validation:x.validationMessage})) })); await b.save();
    assert.equal(r.formBeforeSubmit.valid, true, "Route form must pass browser constraints before testing the action");
    await dispatch.getByRole("button", { name: "Tạo đề xuất lộ trình", exact: true }).click();
    const link = dispatch.getByRole("link", { name: "Xem lộ trình", exact: true }); await link.waitFor();
    r.documents.plan = new URL(await link.getAttribute("href"), origin).searchParams.get("plan"); await b.save();
    const [created] = await qa.sql`select status,provider_state,(select count(*)::int from public.route_plan_stops where route_plan_id=p.id) stops from public.route_plans p where id=${r.documents.plan}`;
    assert.equal(created.status, "DRAFT"); assert.equal(created.stops, 2); assert.equal(created.provider_state, "MANUAL_FALLBACK");
    await b.record("DISPATCH_CREATE_MANUAL_ROUTE_WITH_TWO_REAL_SOURCES_NO_ASSIGNMENT_YET", created);
  }
  const [state] = await qa.sql`select status from public.route_plans where id=${r.documents.plan}`;
  if (state.status === "DRAFT") {
    await dispatch.goto(origin + "/admin/routes?plan=" + r.documents.plan); await dispatch.getByRole("button", { name: "Áp dụng và phân giao", exact: true }).click();
    await b.wait(async () => (await qa.sql`select status from public.route_plans where id=${r.documents.plan}`)[0].status === "APPLIED");
  }
  await dispatch.reload();
  const assigned = await qa.sql`select a.delivery_id,a.employee_id,a.vehicle_id,d.execution_state from public.delivery_assignments a join public.deliveries d on d.id=a.delivery_id where a.delivery_id in ${qa.sql(r.documents.deliveries.map(x=>x.id))} and a.superseded_at is null order by a.delivery_id`;
  assert.equal(assigned.length, 2); assert.ok(assigned.every(x=>x.employee_id===d.personas.worker.employee && x.vehicle_id===r.documents.vehicle && x.execution_state==="ASSIGNED"));
  const [facts] = await qa.sql`select (select sum(base_quantity_delta)::text from public.inventory_movements where material_id=${r.documents.material} and location_kind='WAREHOUSE') warehouse,(select count(*)::int from public.inventory_movements where material_id=${r.documents.material} and location_kind='IN_TRANSIT') actual_cargo,(select count(*)::int from public.revenue_entries where sales_order_id=${r.documents.sale}) revenue`;
  assert.equal(facts.warehouse, "5.000000"); assert.equal(facts.actual_cargo, 0); assert.equal(facts.revenue, 0);
  await b.record("APPLY_ROUTE_ASSIGNMENTS_KEEP_EACH_DELIVERY_SOURCE_NO_PHANTOM_STOCK_OR_REVENUE", { deliveries: assigned.length, facts });
  await worker.goto(origin + "/admin/routes?plan=" + r.documents.plan); assert.equal(await worker.getByRole("button", { name: "Áp dụng và phân giao", exact: true }).count(), 0);
  await b.record("WORKER_CANNOT_APPLY_DISPATCH_ROUTE"); await b.shot(dispatch, "two-delivery-manual-route-applied"); await b.finish();
} catch (e) { r.status = "FAIL"; r.error = e.message.split("\n")[0]; await b.debug(); await b.save(); throw e; }
finally { await b.close(); }
