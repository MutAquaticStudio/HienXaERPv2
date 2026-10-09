import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';

const fixturePath=process.argv.find(x=>x.startsWith('--qa-fixture='))?.slice('--qa-fixture='.length);
assert.ok(fixturePath,'Explicit managed QA fixture manifest is required');
const fixture=JSON.parse(await fs.readFile(fixturePath,'utf8')).fixtures;
assert.ok(fixture?.prefix&&fixture.owner&&fixture.staff&&fixture.branches?.length===2);
process.loadEnvFile('/Users/nox/Downloads/HienXaERP/.env.qa.local');
const core=await import('../qa/core.mjs');
assert.equal(core.guard().ref,'ffrwiglcrlumfvhubaxg');
const migration=await fs.readFile(new URL('../../supabase/migrations/20261009205945_direct_purchase_draft_operational_gate.sql',import.meta.url),'utf8');
const original=await fs.readFile(new URL('../../supabase/migrations/20261009173806_secure_operational_posting_gate.sql',import.meta.url),'utf8');
const hash=x=>createHash('sha256').update(x).digest('hex');
assert.equal(hash(original),'f03146a6ad1b98003b34f0d6793ee51654bf763abf7f476668606c18cc60d50e');
const rehearse=process.argv.includes('--rehearse-forward');
const report={scope:'OP_GATE_DIRECT_PO_DRAFT_01',project:'ffrwiglcrlumfvhubaxg',runId:'DIRECT_DRAFT_'+Date.now(),migrationSha:hash(migration),originalMigrationUnchanged:true,mode:rehearse?'TRANSACTIONAL_FORWARD_REHEARSAL':'COMMITTED_FORWARD_TARGETED_VERIFICATION',productionWrites:0,qaPersistedBusinessWrites:0,checks:[]};
const branch=fixture.branches[0].id,foreignBranch=fixture.branches[1].id;
let db=await core.database();
const snapshot=async c=>(await c.unsafe("select jsonb_build_object('state',(select to_jsonb(s) from private.branch_operational_states s where branch_id=$1),'so',(select count(*) from public.sales_orders where branch_id=$1),'po',(select count(*) from public.purchase_orders where branch_id=$1),'allocations',(select count(*) from public.supply_allocations where branch_id=$1),'delivery',(select count(*) from public.deliveries where branch_id=$1),'audit',(select count(*) from public.audit_events where branch_id=$1)) value",[branch]))[0].value;
const economic=async tx=>(await tx.unsafe("select jsonb_build_object('stock',(select coalesce(sum(inventory_value_delta_vnd),0)::text from public.inventory_movements where branch_id=$1),'revenue',(select count(*) from public.revenue_entries where branch_id=$1),'cost',(select count(*) from public.direct_cost_entries where branch_id=$1),'ar',(select count(*) from public.receivable_obligations where branch_id=$1),'ap',(select count(*) from public.payable_obligations where branch_id=$1),'payment',(select count(*) from public.payments where branch_id=$1),'earning',(select count(*) from public.earning_events where branch_id=$1)) value",[branch]))[0].value;
const before=await snapshot(db);
async function actor(tx,id,fn){await tx.unsafe("select set_config('request.jwt.claim.sub',$1,true)",[id]);await tx.unsafe('set local role authenticated');const result=await fn();await tx.unsafe('reset role');return result;}
async function check(tx,name,fn,expectedCode=null){
 await tx.unsafe('savepoint draft_case');
 try{
  let error;try{await fn();}catch(e){error=e;}
  if(expectedCode){assert.equal(error?.code,expectedCode,name+': expected controlled denial');}
  else if(error)throw error;
  report.checks.push({name,status:'PASS',...(expectedCode?{denialCode:expectedCode}:{})});
 }finally{await tx.unsafe('rollback to savepoint draft_case');await tx.unsafe('reset role');await tx.unsafe('release savepoint draft_case');}
}
try{
 await db.begin(async tx=>{
  await tx.unsafe("set local statement_timeout='30s';set local lock_timeout='5s'");
  if(rehearse){
   assert.equal((await tx.unsafe("select count(*)::int n from supabase_migrations.schema_migrations where version='20261009205945'"))[0].n,0);
   await tx.unsafe(migration.replace(/\bbegin;\s*/,'').replace(/commit;\s*$/,''));
  }else{
   const applied=(await tx.unsafe("select encode(extensions.digest(convert_to(statements[1],'UTF8'),'sha256'),'hex') sha from supabase_migrations.schema_migrations where version='20261009205945'"))[0];
   assert.equal(applied?.sha,hash(migration));
  }
  const [{id:customer}]=await tx.unsafe('select id from public.customers where branch_id=$1 and code=$2 and active',[branch,fixture.prefix+'_CUST_A']);
  const [{id:site}]=await tx.unsafe('select id from public.customer_sites where customer_id=$1 and code=$2 and active',[customer,fixture.prefix+'_SITE']);
  const [{id:supplier}]=await tx.unsafe('select id from public.suppliers where branch_id=$1 and code=$2 and active',[branch,fixture.prefix+'_SUP']);
  const [{id:material,base_uom_id:uom}]=await tx.unsafe('select id,base_uom_id from public.materials where code=$1 and active',[fixture.prefix+'_CEMENT']);
  const [{id:warehouse}]=await tx.unsafe('select id from public.warehouses where branch_id=$1 and active order by code limit 1',[branch]);
  const sale=[{material_id:material,ordered_uom_id:uom,quantity:'20',conversion_numerator:'1',conversion_denominator:'1',rounding_mode:'HALF_UP',unit_price_vnd:'2000',price_source_type:'MANUAL_APPROVED',override_reason:'Synthetic rollback-only direct Draft control'}];
  const so=(await actor(tx,fixture.owner,()=>tx.unsafe('select public.create_sales_order_draft($1,$2,$3,$4,$5,$6::jsonb,$7) id',[branch,customer,site,null,'Synthetic direct Draft verification',sale,randomUUID()])))[0].id;
  const [{id:line}]=await tx.unsafe('select id from public.sales_order_lines where sales_order_id=$1',[so]);
  const purchase=[{material_id:material,ordered_uom_id:uom,quantity:'1',conversion_numerator:'1',conversion_denominator:'1',rounding_mode:'HALF_UP',unit_cost_vnd:'1000',price_source_type:'CONTRACT',purchase_price_rule_id:fixture.priceRuleId,purchase_price_rule_version:1,linked_sales_order_line_id:line}];
  const po=(await actor(tx,fixture.staff,()=>tx.unsafe('select public.create_direct_purchase_from_sales_order($1,$2,$3::jsonb,$4,$5) id',[so,supplier,purchase,null,randomUUID()])))[0].id;
  const [{id:pl}]=await tx.unsafe('select id from public.purchase_order_lines where purchase_order_id=$1',[po]);
  const [{id:allocation}]=await tx.unsafe('select id from public.supply_allocations where purchase_order_line_id=$1',[pl]);
  const baselineMoney=await economic(tx);
  for(const state of ['PENDING_OPENING','READY_FOR_ACTIVATION']){
   await tx.unsafe('update private.branch_operational_states set state=$1 where branch_id=$2',[state,branch]);
   await check(tx,state+'_DIRECT_DRAFT_CREATE',async()=>{
    const op=randomUUID(),args=[so,supplier,purchase,null,op];
    const result=(await actor(tx,fixture.staff,()=>tx.unsafe('select public.create_direct_purchase_from_sales_order($1,$2,$3::jsonb,$4,$5) id',args)))[0].id;
    assert.equal((await actor(tx,fixture.staff,()=>tx.unsafe('select public.create_direct_purchase_from_sales_order($1,$2,$3::jsonb,$4,$5) id',args)))[0].id,result);
    assert.equal((await tx.unsafe('select count(*)::int n from public.supply_allocations a join public.purchase_order_lines l on l.id=a.purchase_order_line_id where l.purchase_order_id=$1',[result]))[0].n,1);
   });
   await check(tx,state+'_DIRECT_DRAFT_UPDATE',async()=>{
    const op=randomUUID(),args=[po,1,null,'Synthetic Draft update',[{...purchase[0],source_line_id:pl,quantity:'2'}],op];
    await actor(tx,fixture.staff,()=>tx.unsafe('select public.update_purchase_order_draft($1,$2,$3,$4,$5::jsonb,$6)',args));
    await actor(tx,fixture.staff,()=>tx.unsafe('select public.update_purchase_order_draft($1,$2,$3,$4,$5::jsonb,$6)',args));
    assert.equal((await tx.unsafe('select draft_version from public.purchase_orders where id=$1',[po]))[0].draft_version,2);
    assert.equal((await tx.unsafe('select allocated_base_quantity::text q from public.supply_allocations where id=$1',[allocation]))[0].q,'2.000000');
   });
   await check(tx,state+'_DIRECT_DRAFT_CANCEL',async()=>{
    const args=[po,'Synthetic rollback-only Draft cancel',randomUUID()];
    await actor(tx,fixture.owner,()=>tx.unsafe('select public.cancel_purchase_order($1,$2,$3)',args));
    await actor(tx,fixture.owner,()=>tx.unsafe('select public.cancel_purchase_order($1,$2,$3)',args));
    assert.equal((await tx.unsafe('select state from public.purchase_orders where id=$1',[po]))[0].state,'CANCELLED');
    assert.equal((await tx.unsafe('select count(*)::int n from public.supply_allocations where id=$1',[allocation]))[0].n,0);
   });
   for(const [role,id] of [['OWNER',fixture.owner],['STAFF',fixture.staff]]){
    await check(tx,state+'_'+role+'_CONFIRM_DENIED',()=>actor(tx,id,()=>tx.unsafe('select public.confirm_purchase_order($1,$2)',[po,randomUUID()])),'PT423');
   }
   await check(tx,state+'_RAW_ALLOCATION_QUANTITY_MISMATCH_DENIED',()=>tx.unsafe('update public.supply_allocations set allocated_base_quantity=2 where id=$1',[allocation]),'PT423');
   await check(tx,state+'_ALLOCATION_BRANCH_REASSIGNMENT_DENIED',()=>tx.unsafe('update public.supply_allocations set branch_id=$1 where id=$2',[foreignBranch,allocation]),'42501');
   await check(tx,state+'_ALLOCATION_SOURCE_MUTATION_DENIED',()=>tx.unsafe('update public.supply_allocations set created_by=$1 where id=$2',[fixture.owner,allocation]),'PT423');
   await check(tx,state+'_WAREHOUSE_ALLOCATION_DENIED',()=>actor(tx,fixture.owner,()=>tx.unsafe('select public.upsert_supply_allocation($1,$2,$3,$4,$5,$6,$7,$8)',[line,'WAREHOUSE',null,warehouse,'1',null,null,randomUUID()])),'PT423');
   await check(tx,state+'_CONFIRMED_PO_ALLOCATION_DENIED',async()=>{
    await tx.unsafe("update private.branch_operational_states set state='ACTIVE' where branch_id=$1",[branch]);
    await actor(tx,fixture.owner,()=>tx.unsafe('select public.confirm_purchase_order($1,$2)',[po,randomUUID()]));
    await tx.unsafe('update private.branch_operational_states set state=$1 where branch_id=$2',[state,branch]);
    await actor(tx,fixture.staff,()=>tx.unsafe('select public.upsert_supply_allocation($1,$2,$3,$4,$5,$6,$7,$8)',[line,'SUPPLIER_DIRECT',pl,null,'1',allocation,1,randomUUID()]));
   },'PT423');
   await check(tx,state+'_DELIVERY_LINKED_DRAFT_DENIED',async()=>{
    const delivery=randomUUID();
    await tx.unsafe('insert into public.deliveries(id,branch_id,sales_order_id,delivery_number,customer_id,site_id,customer_name_snapshot,site_name_snapshot,delivery_address_snapshot,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[delivery,branch,so,'QA-GATE-'+delivery,customer,site,'Synthetic customer','Synthetic site','Synthetic address',fixture.owner]);
    await tx.unsafe("insert into public.delivery_lines(delivery_id,sales_order_line_id,supply_allocation_id,material_id,base_uom_id,source_mode,planned_base_quantity,conversion_numerator,conversion_denominator,unit_price_vnd) values($1,$2,$3,$4,$5,'SUPPLIER_DIRECT',1,1,1,2000)",[delivery,line,allocation,material,uom]);
    await actor(tx,fixture.owner,()=>tx.unsafe('select public.cancel_purchase_order($1,$2,$3)',[po,'Synthetic linked-delivery negative control',randomUUID()]));
   },'PT423');
   assert.deepEqual(await economic(tx),baselineMoney);
   report.checks.push({name:state+'_NO_ECONOMIC_EFFECT',status:'PASS'});
  }
  for(const role of ['anon','authenticated','service_role']){
   await check(tx,role+'_HELPER_EXECUTE_DENIED',async()=>{
    await tx.unsafe('set local role '+role);
    await tx.unsafe("select private.operational_direct_purchase_draft_allocation_allowed('{}'::jsonb)");
   },'42501');
  }
  const guards=Array.from(await tx.unsafe("select t.tgenabled,t.tgtype from pg_trigger t join pg_namespace n on n.oid=(select relnamespace from pg_class where oid=t.tgrelid) where n.nspname='public' and t.tgname='operational_posting_guard'"));
  assert.equal(guards.length,31);for(const g of guards){assert.equal(g.tgenabled,'O');assert.equal(g.tgtype,31);}
  report.checks.push({name:'31_POSTING_BOUNDARIES_UNCHANGED',status:'PASS'});
  throw Object.assign(new Error('ROLLBACK_TARGETED_FIXTURES'),{controlledRollback:true});
 });
 report.status='FAIL_EXPECTED_ROLLBACK_NOT_OBSERVED';process.exitCode=1;
}catch(e){if(e.controlledRollback)report.status='PASS_TARGETED_DRAFT_FORWARD';else{report.status='FAIL';report.error={code:e.code,message:e.message};process.exitCode=1;}}
finally{
 await db.end({timeout:5});db=await core.database();assert.deepEqual(await snapshot(db),before,'Fresh logical QA readback must match prestate');report.rollbackIndependentReadback='PASS';await db.end({timeout:5});
 const out=fixturePath.slice(0,fixturePath.lastIndexOf('/'))+'/'+report.runId+'-direct-draft.json';
 await fs.writeFile(out,JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify({status:report.status,passed:report.checks.length,error:report.error,migrationSha:report.migrationSha,rollback:report.rollbackIndependentReadback,artifact:out}));
}
