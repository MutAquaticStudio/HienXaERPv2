import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile,access} from 'node:fs/promises';
import {argumentsForRun,openQA,stockFixture,salesFixture} from './remediation/native-fixture.mjs';
const a=argumentsForRun(),q=await openQA(a),d=JSON.parse(await readFile(a.documents,'utf8')).documents;
assert.equal(a.database,'hx_remediation_go_live_browser175');
try{await access(a.out);throw Error('Reuse prepared UX fixture; never create it twice');}catch(e){if(e.code!=='ENOENT')throw e;}
try{
 const schema=(await q.sql`select count(*)::int count,max(version) latest from supabase_migrations.schema_migrations`)[0];
 const source=await q.sql.begin(async tx=>{
  const scoped={...q,fixtures:d.fixtures};
  const stock=await stockFixture(tx,scoped,'15');
  const sale=await salesFixture(tx,scoped,{...stock,customer:d.customer,site:d.site},d.personas.sales.subject);
  const allocation=await q.rpc(tx,'upsert_supply_allocation',[sale.line,'WAREHOUSE',null,d.fixtures.warehouse,'15',null,null,randomUUID()],d.personas.purchasing.subject);
  const vehicle=randomUUID();await q.rpc(tx,'save_catalog_record',['vehicles',vehicle,d.branch,{code:stock.prefix+'UX',plate_number:stock.prefix+'UX',capacity_quantity:'20',capacity_uom_id:stock.uom,capacity_source_note:'QA xe riêng cho hồi quy giao diện15/14/13',active:true},null,'Nguồn QA riêng, không đổi hồ sơ doanh nghiệp',randomUUID()],d.fixtures.owner);
  const start='2600-04-01T00:00:00Z',end='2600-04-01T01:00:00Z';
  const delivery=await q.rpc(tx,'create_delivery_from_allocations',[sale.so,[{supply_allocation_id:allocation,planned_base_quantity:'15'}],start,randomUUID()],d.personas.warehouse.subject);
  const [line]=await tx`select id from public.delivery_lines where delivery_id=${delivery}`;
  await q.rpc(tx,'assign_delivery_scheduled',[delivery,d.personas.worker.employee,vehicle,'','',1,randomUUID(),start,end],d.personas.warehouse.subject);
  const work=await q.rpc(tx,'publish_work_item',[d.branch,'DELIVERY',delivery,'DIRECT',d.personas.worker.employee,randomUUID()],d.personas.warehouse.subject);
  const [w]=await tx`select version from public.work_items where id=${work}`;await q.rpc(tx,'start_work_item',[work,w.version,randomUUID()],d.personas.worker.subject);
  await q.rpc(tx,'handoff_delivery_actual',[delivery,2,new Date().toISOString(),randomUUID(),[{delivery_line_id:line.id,loaded_base_quantity:'14'}]],d.personas.warehouse.subject);
  const job=await q.rpc(tx,'worker_portal_job',[work],d.personas.worker.subject);
  assert.equal(job.delivery.lines[0].planned_base_quantity,'15.000000');assert.equal(job.delivery.lines[0].loaded_base_quantity,'14.000000');assert.equal(job.delivery.lines[0].reportable_base_quantity,'14.000000');
  await tx.unsafe('set local role postgres');
  const [facts]=await tx`select (select sum(base_quantity_delta)::text from public.inventory_movements where material_id=${stock.material} and warehouse_id=${d.fixtures.warehouse} and location_kind='WAREHOUSE') warehouse,(select sum(base_quantity_delta)::text from public.inventory_movements where delivery_id=${delivery} and location_kind='IN_TRANSIT') cargo,(select count(*)::int from public.revenue_entries where sales_order_id=${sale.so}) revenues`;
  assert.deepEqual(facts,{warehouse:'1.000000',cargo:'14.000000',revenues:0});
  return {so:sale.so,po:stock.po,material:stock.material,uom:stock.uom,delivery,deliveryLine:line.id,work,vehicle,branch:d.branch,customer:d.customer,site:d.site,account:d.account,warehouse:d.fixtures.warehouse,sourceFacts:facts};
 });
 await writeFile(a.out,JSON.stringify({status:'PREPARED_ONCE_QA_PENDING_RESULT',schema,productionAccess:'NONE',schemaChanges:0,excludedAdvanceRacesRun:false,source,actors:d.personas,portalSubjects:d.portalSubjects},null,2)+'\n');console.log(JSON.stringify({status:'PREPARED',schema,standard:'plan15_loaded14_reportable14',productionAccess:'NONE'}));
}finally{await q.sql.end({timeout:3});}
