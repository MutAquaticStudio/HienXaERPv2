// Resume a committed synthetic QA run. Never applies a migration or imports A.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {database,guard} from '../qa/core.mjs';
import {importOpenings} from './import_openings.mjs';
import {postgresAdapter,assertIndependentReadback} from './qa_postgres_adapter.mjs';

assert.equal(guard().ref,'ffrwiglcrlumfvhubaxg');
const originalPath=process.argv[2];assert.ok(originalPath&&path.isAbsolute(originalPath));
const original=JSON.parse(await fs.readFile(originalPath,'utf8'));
assert.equal(original.target,guard().ref);assert.equal(original.transaction,'COMMITTED');
const out=path.dirname(originalPath),runId=original.runId;
const pkg=JSON.parse(await fs.readFile(path.join(out,'parsed-source.json'),'utf8'));
pkg.meta.qa_run_id=runId;
const hash=x=>createHash('sha256').update(x).digest('hex');
const raw=await fs.readFile(new URL('../../supabase/migrations/20261008224033_operational_opening_sources.sql',import.meta.url));
assert.equal(hash(raw),'5ea93da878981186fe6273ef887adcc052f04c35530cfa924ec9d144cebd9994');
const report={runId,target:guard().ref,migrationHash:hash(raw),productionWrites:0,checks:[],failures:[],
 migrationExecutionCountThisResume:0,initialOperationReexecuted:false,failedOperations:[]};
const save=()=>fs.writeFile(path.join(out,runId+'-resume.json'),JSON.stringify(report,null,2));
const pass=(name,details={})=>report.checks.push({name,status:'PASS',...details});
async function check(name,fn){try{await fn();pass(name);}catch(e){report.failures.push({name,code:e.code??null,message:e.message});}await save();}
const tables=Object.keys(original.afterCommit);
const branchIds=original.result.entities.filter(x=>x.section==='A').map(x=>x.id);
async function snapshot(tx){
 const result={};
 for(const table of tables)result[table]=(await tx.unsafe(`select count(*)::int n,md5(coalesce(string_agg(to_jsonb(t)::text,'|' order by t.id),'')) hash from public.${table} t where branch_id=any($1::uuid[])`,[branchIds]))[0];
 return result;
}
const writer=await database();let options,auditBefore;
try{
 const[receipt]=await writer.unsafe('select actor_id,source_payload,payload_hash,result from private.operational_import_receipts where operation_id=$1',[original.operationA]);
 assert.ok(receipt);assert.deepEqual(pkg,receipt.source_payload);
 const bindings={employees:{},transitUnitCosts:{SYN_SOURCE_O_01:'1500.25'}};
 for(const row of pkg.tables.B){
  const entity=receipt.result.entities.find(x=>x.section==='B'&&x.natural[0]===row.employee_code);
  const matches=await writer.unsafe('select e.auth_user_id,a.role_id from public.employees e join public.employee_branch_access a on a.employee_id=e.id where e.id=$1',[entity.id]);
  assert.equal(matches.length,1);bindings.employees[row.employee_code]={authUserId:matches[0].auth_user_id,roleId:matches[0].role_id};
 }
 options={actorId:receipt.actor_id,bindings,operationId:original.operationA,mode:'OPENINGS_AND_TRANSIT_ONLY'};
 const payloadHash=hash(JSON.stringify({tables:pkg.tables,meta:pkg.meta,provenance:pkg.provenance,bindings,mode:options.mode,actorId:options.actorId}));
 assert.equal(payloadHash,receipt.payload_hash,'Original payload order must match before retry');
 pass('ORIGINAL_CANONICAL_PAYLOAD_HASH_RESTORED');
 auditBefore=(await writer.unsafe("select count(*)::int n,md5(coalesce(string_agg(to_jsonb(a)::text,'|' order by id),'')) hash from public.audit_events a where branch_id=any($1::uuid[])",[branchIds]))[0];
 await check('SAME_OPERATION_IDEMPOTENCY',async()=>{
  await writer.begin(async tx=>{
   const result=await importOpenings(postgresAdapter(tx),pkg,options);
   assert.equal(result.replayed,true);assert.deepEqual(await snapshot(tx),original.afterCommit);
  });
 });
 await check('NEW_OPERATION_SAME_SOURCE_IDEMPOTENCY',async()=>{
  await writer.begin(async tx=>{
   report.operationB=original.operationB;
   const result=await importOpenings(postgresAdapter(tx),pkg,{...options,operationId:report.operationB});
   assert.deepEqual(result.sources,original.result.sources);
   assert.deepEqual(result.entities,original.result.entities);
   assert.deepEqual(await snapshot(tx),original.afterCommit);
  });
 });
 const negative=async(name,change,expected)=>check(name,async()=>{
  const p=structuredClone(pkg);change(p);const operationId=randomUUID();report.failedOperations.push(operationId);
  await assert.rejects(()=>writer.begin(tx=>importOpenings(postgresAdapter(tx),p,{...options,operationId})),expected);
 });
 await negative('CHANGED_MASTER_CONFLICT',p=>{p.tables.A[0].branch_name+=' changed';},/IMPORT_MASTER_CONFLICT:branches:name/);
 await negative('DIFFERENT_TIMESTAMP_CONFLICT',p=>{p.meta.test_cutover='2026-10-15T00:00:01+07:00';},/IMPORT_MASTER_CONFLICT:employees:deactivated_at/);
 await negative('CHANGED_ECONOMIC_SOURCE_CONFLICT',p=>{
  p.tables.H[0].quantity='3';p.tables.H[0].base_quantity='150';p.tables.H[0].inventory_value_vnd='225038';
 },e=>e.code==='PT409');
 await negative('INVALID_UOM_ROLLBACK',p=>{p.tables.H[1].uom_code='syn_missing';},/IMPORT_UOM_UNMAPPED/);
 await negative('DUPLICATE_SOURCE_CONFLICT_ROLLBACK',p=>{p.tables.H[1].source_ref=p.tables.H[0].source_ref;},e=>e.code==='PT409');
}catch(e){report.failures.push({name:'RESUME_SETUP',code:e.code??null,message:e.message});}
finally{await writer.end({timeout:5});await save();}

const reader=await database();
try{
 report.lifecycle=assertIndependentReadback({client:writer,transactionEnded:true,closed:true},reader);
 await reader.begin(async tx=>{
  await tx.unsafe("set transaction read only;set local statement_timeout='30s'");
  report.readbackPid=(await tx.unsafe('select pg_backend_pid() pid'))[0].pid;
  assert.deepEqual(await snapshot(tx),original.afterCommit);
  const operations=Array.from(await tx.unsafe('select operation_id from private.operational_import_receipts where actor_id=$1 order by operation_id',[options.actorId]),x=>x.operation_id);
  assert.deepEqual(operations.sort(),[original.operationA,original.operationB].sort());
  assert.equal((await tx.unsafe('select count(*)::int n from private.operational_import_receipts where operation_id=any($1::uuid[])',[report.failedOperations]))[0].n,0);
  const auditAfter=(await tx.unsafe("select count(*)::int n,md5(coalesce(string_agg(to_jsonb(a)::text,'|' order by id),'')) hash from public.audit_events a where branch_id=any($1::uuid[])",[branchIds]))[0];
  assert.deepEqual(auditAfter,auditBefore);
  pass('COMMITTED_NEW_OPERATION_AND_FAILED_OPERATIONS_FRESH_READBACK_NO_ECONOMIC_OR_AUDIT_DUPLICATION');
  const[history]=await tx.unsafe('select statements from supabase_migrations.schema_migrations where version=$1',['20261008224033']);
  assert.equal(hash(history.statements[0]),hash(raw));
  assert.equal((await tx.unsafe("select md5(string_agg(to_jsonb(h)::text,'|' order by version)) hash from supabase_migrations.schema_migrations h where version<>'20261008224033'"))[0].hash,original.unrelatedHistoryBefore);
  pass('EXACT_HISTORY_ONCE_UNRELATED_HISTORY_UNCHANGED');
  await tx.unsafe("select set_config('request.jwt.claim.sub',$1,true)",[options.actorId]);
  await tx.unsafe('set local role authenticated');
  const totals={};
  const queries={inventory:'select sum(inventory_value_vnd::numeric)::text value from public.warehouse_inventory_read',transit:'select sum(inventory_value_vnd::numeric)::text value from public.inventory_opening_transit_read',ar:'select sum(outstanding_amount_vnd::numeric)::text value from public.receivable_read',ap:'select sum(outstanding_amount_vnd::numeric)::text value from public.payable_read where supplier_id is not null',employee:'select sum(outstanding_amount_vnd::numeric)::text value from public.payable_read where employee_id is not null',cash:'select sum(amount_vnd::numeric)::text value from public.cash_opening_read'};
  for(const[key,query]of Object.entries(queries))totals[key]=(await tx.unsafe(query))[0].value;
  assert.deepEqual(totals,{inventory:'171025',transit:'75013',ar:'750000',ap:'350000',employee:'80000',cash:'2000000'});report.totals=totals;
  const quantities=Array.from(await tx.unsafe('select w.code warehouse,m.code material,u.code base_uom,r.on_hand_base_quantity::text quantity,r.inventory_value_vnd::text value from public.warehouse_inventory_read r join public.warehouses w on w.id=r.warehouse_id join public.materials m on m.id=r.material_id join public.units_of_measure u on u.id=r.base_uom_id order by m.code'));
  assert.deepEqual(quantities,[{warehouse:'SYN_WH_A',material:'SYN_CEMENT',base_uom:'syn_kg',quantity:'100.000000',value:'150025'},{warehouse:'SYN_WH_A',material:'SYN_PACK',base_uom:'syn_bag',quantity:'3.000000',value:'21000'}]);report.quantities=quantities;
  pass('COMMITTED_REPORTING_READERS_SIX_BALANCES_AND_QUANTITIES');
  await tx.unsafe('reset role');
  for(const table of ['payments','revenue_entries','direct_cost_entries','earning_events','sales_orders','purchase_orders','deliveries'])assert.equal(original.afterCommit[table].n,0,table);
  assert.equal((await tx.unsafe("select count(*)::int n from public.inventory_movements where branch_id=any($1::uuid[]) and movement_type<>'OPENING'",[branchIds]))[0].n,0);
  assert.equal((await tx.unsafe('select count(*)::int n from public.payment_allocations a join public.payments p on p.id=a.payment_id where p.branch_id=any($1::uuid[])',[branchIds]))[0].n,0);
  const sources=Array.from(await tx.unsafe('select location_kind,base_quantity::text quantity,value_vnd::text value,jsonb_typeof(payload) payload_type from public.inventory_opening_sources where branch_id=any($1::uuid[]) order by source_ref',[branchIds]));
  assert.equal(sources.filter(x=>x.location_kind==='IN_TRANSIT').length,1);
  assert.equal(sources.find(x=>x.location_kind==='IN_TRANSIT').value,'75013');
  assert.ok(sources.every(x=>x.payload_type==='object'));report.inventorySources=sources;
  const amounts=Array.from(await tx.unsafe('select historical_original_amount_vnd::text original,outstanding_at_cutover_vnd::text outstanding from public.opening_balance_sources where branch_id=any($1::uuid[]) order by source_ref',[branchIds]));
  assert.deepEqual(amounts,[{original:'1000000',outstanding:'750000'},{original:'200000',outstanding:'0'},{original:'500000',outstanding:'300000'},{original:'100000',outstanding:'50000'},{original:'100000',outstanding:'80000'}]);
  report.historicalOriginalAndOutstanding=amounts;
  pass('OPENING_BUSINESS_INVARIANTS_NO_FAKE_LEDGER_COMPENSATION_OR_HISTORY_REWRITE');
  report.dashboard=[];
  for(const branch of branchIds){
   const[row]=await tx.unsafe('select public.finance_dashboard_snapshot($1,$2,$3,$4) result',[branch,'2026-10-01T00:00:00+07:00','2026-11-01T00:00:00+07:00','2050-01-01T00:00:00Z']);
   for(const key of ['revenue','direct_cost','operating_expense','commission_payable','salary_payable'])assert.equal(BigInt(row.result[key].value_vnd),0n);
   report.dashboard.push(row.result);
  }
  pass('COMMITTED_OPENINGS_DO_NOT_INFLATE_CURRENT_PERIOD_REVENUE_COGS_OR_EARNINGS');
 });
}catch(e){report.failures.push({name:'FRESH_COMMITTED_READBACK',code:e.code??null,message:e.message});}
finally{await reader.end({timeout:5});}
report.status=report.failures.length?'FAIL':'PASS_SUPPORTED_SCOPE';await save();
console.log(JSON.stringify(report));if(report.failures.length)process.exitCode=1;
