import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {prepareOperationalOpeningPackage,registerOperationalOpeningPackage,importAuthorizedOpenings,reconcileAuthorizedOpenings} from './authorized_openings.mjs';
import {postgresAdapter} from './qa_postgres_adapter.mjs';
import Decimal from 'decimal.js';

const resumePath=process.argv.find(arg=>arg.startsWith('--qa-resume='))?.slice('--qa-resume='.length);
const resume=resumePath?JSON.parse(await fs.readFile(resumePath,'utf8')):null;
if(resume){assert.equal(resume.mode,'MANAGED_QA');assert.equal(resume.status,'FAIL_CLOSED_NO_PRODUCTION_WRITE');assert.equal(resume.checks.length,2);assert.equal(resume.failures[0]?.message,'manual_purchase_price_requires_permission_and_reason');}
const managed=process.argv.includes('--qa')||Boolean(resume);
const runId=resume?.runId??'OP_GATE_'+Date.now();
const out=resumePath?path.dirname(resumePath):'/Users/nox/Downloads/HienXaERP/outputs/operational-posting-gate/'+runId+(managed?'-qa':'-native');
await fs.mkdir(out,{recursive:true,mode:0o700});
const report={scope:'SECURE_OPERATIONAL_POSTING_GATE',mode:managed?'MANAGED_QA':'ISOLATED_POSTGRES',runId,checks:[],productionWrites:0,productionConnection:'NONE',fixtures:{},failures:[]};
if(resume){report.checks=resume.checks.map(check=>({...check,evidence:'REUSED_FROM_PREVIOUS_RUN'}));report.previousFailures=resume.failures;}
const mark=(name,detail={})=>{report.checks.push({name,status:'PASS',...detail});console.log(name+' PASS');};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const gateFile=new URL('../../supabase/migrations/20261009173806_secure_operational_posting_gate.sql',import.meta.url);
const gateBytes=await fs.readFile(gateFile,'utf8');
const openingBytes=await fs.readFile(new URL('../../supabase/migrations/20261008224033_operational_opening_sources.sql',import.meta.url));
assert.equal(hash(openingBytes),'5ea93da878981186fe6273ef887adcc052f04c35530cfa924ec9d144cebd9994');
report.gateSha256=hash(gateBytes);report.openingBytesUnchanged=true;
assert.equal(report.gateSha256,'f03146a6ad1b98003b34f0d6793ee51654bf763abf7f476668606c18cc60d50e','Approved gate bytes must match before mutation');
let raw,db,qaDatabase;
const nativeAdapter=engine=>({query:(...args)=>engine.query(...args),transaction:fn=>engine.transaction(tx=>fn({query:(...args)=>tx.query(...args),exec:(...args)=>tx.exec(...args)}))});
const managedAdapter=sql=>({
 query:(...args)=>postgresAdapter(sql).query(...args),
 transaction:fn=>sql.begin(tx=>fn(postgresAdapter(tx))),
});
const q=async(text,args=[]) => (await db.query(text,args)).rows;
const result=async(text,args=[]) => (await q(text,args))[0].result;
async function denied(name,fn,codes=['42501','PT423','PT409','22023']){
 await assert.rejects(fn,e=>codes.includes(e.code));mark(name);
}
async function freshLogicalClient(){
 if(managed){const writer=raw;await raw.end({timeout:5});raw=await qaDatabase();assert.notEqual(raw,writer);db=managedAdapter(raw);}
 else{await raw.close();raw=await PGlite.create(path.join(out,'database'),{extensions:{pgcrypto}});db=nativeAdapter(raw);}
}
async function actorOn(adapter,auth,fn){
 return adapter.transaction(async tx=>{
  await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[auth]);
  await tx.query("set local role authenticated");return fn(tx);
 });
}
async function economicSnapshot(){
 return (await q(`select jsonb_build_object(
 'inventory_sources',(select count(*) from public.inventory_opening_sources where branch_id=any($1::uuid[])),
 'movements',(select count(*) from public.inventory_movements where branch_id=any($1::uuid[])),
 'inventory_value',(select coalesce(sum(value_vnd),0)::text from public.inventory_opening_sources where branch_id=any($1::uuid[])),
 'ar',(select count(*) from public.receivable_obligations where branch_id=any($1::uuid[])),
 'ar_value',(select coalesce(sum(original_amount_vnd),0)::text from public.receivable_obligations where branch_id=any($1::uuid[])),
 'ap',(select count(*) from public.payable_obligations where branch_id=any($1::uuid[])),
 'ap_value',(select coalesce(sum(original_amount_vnd),0)::text from public.payable_obligations where branch_id=any($1::uuid[])),
 'cash',(select count(*) from public.cash_opening_balances where branch_id=any($1::uuid[])),
 'cash_value',(select coalesce(sum(amount_vnd),0)::text from public.cash_opening_balances where branch_id=any($1::uuid[]))
 ) snapshot`,[report.fixtures.branches.map(x=>x.id)]))[0].snapshot;
}
async function actor(auth,fn){
 return db.transaction(async tx=>{
  await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[auth]);
  await tx.query("set local role authenticated");
  return fn(tx);
 });
}
try {
 if(managed){
  process.loadEnvFile('/Users/nox/Downloads/HienXaERP/.env.qa.local');
  const core=await import('../qa/core.mjs');assert.equal(core.guard().ref,'ffrwiglcrlumfvhubaxg');
  qaDatabase=core.database;raw=await qaDatabase();db=managedAdapter(raw);
  const existing=await q("select count(*)::int n from supabase_migrations.schema_migrations where version='20261009173806'");
  if(resume){
   assert.equal(existing[0].n,1,'Resume requires the previously committed migration');
   const [{sha}]=await q("select encode(extensions.digest(convert_to(statements[1],'UTF8'),'sha256'),'hex') sha from supabase_migrations.schema_migrations where version='20261009173806'");
   assert.equal(sha,report.gateSha256);
   mark('QA_COMMITTED_MIGRATION_REUSED_WITHOUT_REPLAY');
  }else{
   assert.equal(existing[0].n,0,'Do not replay a committed migration');
   await raw.begin(async tx=>{
    await tx.unsafe(gateBytes.replace(/\bbegin;\s*/,'').replace(/commit;\s*$/,''));
    await tx.unsafe("insert into supabase_migrations.schema_migrations(version,name,statements) values('20261009173806','secure_operational_posting_gate',$1)",[[gateBytes]]);
   });
   mark('QA_EXACT_FORWARD_COMMITTED_ONCE');
  }
 }else{
  const dir=path.join(out,'database');
  raw=await PGlite.create(dir,{extensions:{pgcrypto}});db=nativeAdapter(raw);
  await raw.exec("create role anon nologin;create role authenticated nologin;create role service_role nologin;create schema extensions;create extension pgcrypto with schema extensions;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;");
  const migrations=new URL('../../supabase/migrations/',import.meta.url);
  for(const file of (await fs.readdir(migrations)).filter(f=>f.endsWith('.sql')&&f<'20261009173806_secure_operational_posting_gate.sql').sort()){
   await raw.exec(await fs.readFile(new URL(file,migrations),'utf8'));
  }
  await raw.exec(gateBytes);
  mark('ISOLATED_EXACT_SCHEMA_GATE_APPLIED');
 }
 const original=JSON.parse(await fs.readFile('/Users/nox/Downloads/HienXaERP/outputs/synthetic-dry-run/importer-acceptance/parsed-source.json','utf8'));
 const prefix=resume?.fixtures.prefix??'G'+Date.now().toString(36).toUpperCase();
 const pkg=JSON.parse(JSON.stringify(original).replace(/SYN_/g,prefix+'_').replace(/syn_/g,prefix.toLowerCase()+'_'));
 pkg.meta.DATA_MODE='SYNTHETIC';pkg.meta.dataset=runId;pkg.meta.owner_decision=false;
 // This is a NEW synthetic JSON source bundle, not a claim to have changed its old CSV files.
 delete pkg.source_sha256;pkg.source_files=[];
 const sourceBytes=Buffer.from(JSON.stringify(pkg));pkg.source_sha256=hash(sourceBytes);
 if(resume)assert.equal(pkg.source_sha256,resume.fixtures.sourceSha256,'Reconstructed source must preserve the existing run hash');
 const owner=resume?.fixtures.owner??randomUUID(),staff=resume?.fixtures.staff??randomUUID();
 const employee=resume?(await q('select id from public.employees where auth_user_id=$1',[owner]))[0].id:randomUUID();
 const staffEmployee=resume?(await q('select id from public.employees where auth_user_id=$1',[staff]))[0].id:randomUUID();
 if(!resume)await q('insert into auth.users(id) values($1),($2)',[owner,staff]);
 let [ownerRole]=await q("select id from public.roles where code='owner'");
 if(!ownerRole){
  [ownerRole]=await q("insert into public.roles(code,name) values('owner','Canonical Owner control for isolated operational gate QA') returning id");
  await q('insert into public.role_permissions(role_id,permission_code) select $1,code from public.permissions',[ownerRole.id]);
 }
 const [staffRole]=await q("select id from public.roles where code in ('hxqa_mb_purchasing_fcd46a45','purchasing') and active limit 1");
 let staffRoleId=staffRole?.id;
 if(!staffRoleId){
  const [r]=await q('insert into public.roles(code,name) values($1,$2) returning id',[prefix.toLowerCase()+'_staff','Synthetic limited gate staff']);staffRoleId=r.id;
  await q("insert into public.role_permissions(role_id,permission_code) select $1,code from public.permissions where code in ('purchasing.create','purchasing.read','purchasing.confirm','purchasing.price.manage')",[staffRoleId]);
 }
 if(!resume)await q('insert into public.employees(id,auth_user_id,code,display_name) values($1,$2,$3,$4),($5,$6,$7,$8)',[employee,owner,prefix+'_OWNER','Synthetic Owner gate control',staffEmployee,staff,prefix+'_STAFF','Synthetic staff gate control']);
 const bindings={employees:{},transitUnitCosts:{[prefix+'_SOURCE_O_01']:'1500.25'}};
 for(const e of pkg.tables.B){
  const authUserId=resume?(await q('select auth_user_id from public.employees where code=$1',[e.employee_code]))[0].auth_user_id:randomUUID();
  if(!resume)await q('insert into auth.users(id) values($1)',[authUserId]);
  bindings.employees[e.employee_code]={authUserId,roleId:staffRoleId};
 }
 const options={actorId:owner,bindings,operationId:randomUUID(),mode:'OPENINGS_AND_TRANSIT_ONLY'};
 const planned=await prepareOperationalOpeningPackage(db,pkg,options);
 assert.ok(planned.manifest.length>0);
 if(!resume)mark('MASTER_PREPARATION_NO_OPENING_POST');else mark('EXISTING_MASTER_SCOPE_REUSED_FOR_MANIFEST');
 const branches=await q('select id,code from public.branches where code like $1 order by code',[prefix+'_%']);
 assert.equal(branches.length,2);if(resume)assert.deepEqual(Array.from(branches),resume.fixtures.branches);report.fixtures={prefix,branches,owner,staff,sourceSha256:pkg.source_sha256};
 for(const b of branches){
  if(!resume)await q('insert into public.employee_branch_access(employee_id,branch_id,role_id) values($1,$2,$3),($4,$2,$5)',[employee,b.id,ownerRole.id,staffEmployee,staffRoleId]);
  assert.equal(await result('select public.operational_branch_state($1) result',[b.id]).catch(()=>null),null,'No implicit actor on trusted writer');
 }
 const a=branches[0].id,b=branches[1].id;
 const [supplier]=await q('select id from public.suppliers where branch_id=$1 order by code limit 1',[a]);
 const [warehouse]=await q('select id from public.warehouses where branch_id=$1 order by code limit 1',[a]);
 const [customer]=await q('select id from public.customers where branch_id=$1 order by code limit 1',[a]);
 const [account]=await q('select id from public.finance_accounts where branch_id=$1 order by code limit 1',[a]);
 const [material]=await q('select id,base_uom_id from public.materials where code=$1',[prefix+'_CEMENT']);
 // Owner-approved trusted fixture setup; this is NOT an authenticated business price-rule write.
 const priceRuleId=randomUUID();
 await db.transaction(async tx=>{
  await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);
  assert.equal((await tx.query("select private.has_permission($1,'purchasing.price.manage') allowed",[a])).rows[0].allowed,true);
  await tx.query("insert into public.purchase_price_rules(id,branch_id,supplier_id,material_id,purchase_uom_id,unit_cost_vnd,version,source_type,effective_from,created_by) values($1,$2,$3,$4,$5,1000,1,'CONTRACT',clock_timestamp()-interval '1 day',$6)",[priceRuleId,a,supplier.id,material.id,material.base_uom_id,owner]);
 });
 report.fixtures.priceRuleId=priceRuleId;
 mark('SINGLE_TRUSTED_QA_PRICE_RULE_FIXTURE',{priceRuleId,businessActorWrite:false});
 const lines=[{material_id:material.id,ordered_uom_id:material.base_uom_id,quantity:'1',conversion_numerator:'1',conversion_denominator:'1',rounding_mode:'HALF_UP',unit_cost_vnd:'1000',price_source_type:'CONTRACT',purchase_price_rule_id:priceRuleId,purchase_price_rule_version:1}];
 const draftId=(await actor(staff,tx=>tx.query('select public.create_purchase_order_draft($1,$2,$3,$4,$5,$6::jsonb,$7) result',[a,supplier.id,warehouse.id,null,'Synthetic safe draft',lines,randomUUID()]))).rows[0].result;
 mark('STAFF_SAFE_PO_DRAFT_PENDING',{draftId});
 await actor(owner,tx=>tx.query('select public.save_catalog_record($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7)',[
  'customers',randomUUID(),a,{code:prefix+'_MASTER',display_name:'Synthetic pending master',customer_type:'BUSINESS',active:true},null,'Synthetic gate pending master',randomUUID()]));
 mark('OWNER_MASTER_RPC_PENDING');
 const [masterControl]=await q('select id,display_name,active from public.customers where code=$1 and branch_id=$2',[prefix+'_MASTER',a]);
 const readMaster=(await actor(owner,tx=>tx.query('select id from public.customers where id=$1',[masterControl.id]))).rows;
 assert.equal(readMaster.length,1);
 await actor(owner,tx=>tx.query('select public.save_catalog_record($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7)',[
 'customers',masterControl.id,a,{display_name:'Synthetic updated pending master'},{display_name:masterControl.display_name},'Synthetic master update',randomUUID()]));
 await actor(owner,tx=>tx.query('select public.save_catalog_record($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7)',[
 'customers',masterControl.id,a,{active:false},{active:true},'Synthetic master deactivation',randomUUID()]));
 assert.equal((await q('select active from public.customers where id=$1',[masterControl.id]))[0].active,false);
 mark('OWNER_MASTER_READ_UPDATE_CANONICAL_DEACTIVATION_PENDING');
 const paymentArgs=[a,'RECEIPT',customer.id,null,account.id,'1','2026-10-15T00:00:00+07:00','CASH',runId,[],'1',randomUUID(),null];
 const paymentSql='select public.post_payment($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13) result';
 await denied('OWNER_POST_PAYMENT_PENDING',()=>actor(owner,tx=>tx.query(paymentSql,paymentArgs)),['PT423']);
 await denied('STAFF_CONFIRM_PENDING',()=>actor(staff,tx=>tx.query('select public.confirm_purchase_order($1,$2)',[draftId,randomUUID()])),['PT423']);
 await denied('OWNER_CONFIRM_DEFINER_PENDING',()=>actor(owner,tx=>tx.query('select public.confirm_purchase_order($1,$2)',[draftId,randomUUID()])),['PT423']);
 await denied('POSTGRES_ROLE_NO_NORMAL_POSTING_BYPASS',()=>q('insert into public.payments(branch_id,payment_number,direction,customer_id,account_id,amount_vnd,method,effective_at,posted_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9)',[a,prefix+'_NO_BYPASS','RECEIPT',customer.id,account.id,'1','CASH','2026-10-15T00:00:00+07:00',owner]),['PT423']);
 const unknown=randomUUID();await denied('MISSING_BRANCH_STATE_FAIL_CLOSED',()=>q('select private.require_active_operations($1)',[unknown]),['PT423']);
 await denied('PRIVATE_IMPORT_ENTRY_NOT_CALLABLE_BY_BUSINESS_USER',()=>actor(owner,tx=>tx.query('select private.begin_authorized_opening_import($1,$2,$3,$4::jsonb,$5)',[randomUUID(),a,randomUUID(),pkg,owner])),['42501']);
 const authorizations=[];
 for(const branch of branches){
  const recovery=randomUUID();await q("insert into private.operational_recovery_checkpoints(id,branch_id,evidence_sha256,verified_at,expires_at) values($1,$2,$3,now(),now()+interval '2 days')",[recovery,branch.id,hash(Buffer.from(runId+branch.id))]);
  const auth=await registerOperationalOpeningPackage(db,pkg,{sourceBytes,manifest:planned.manifest,branchId:branch.id,runId:randomUUID(),actorId:owner,recoveryId:recovery,expiresAt:new Date(Date.now()+86400000).toISOString(),dataMode:'QA_SYNTHETIC'});
  authorizations.push(auth);
 }
 const auth=authorizations[0];
 report.fixtures.authorizationPackages=authorizations.map(x=>x.packageId);
 await denied('MISSING_FINAL_OWNER_APPROVAL',()=>q('select private.begin_authorized_opening_import($1,$2,$3,$4::jsonb,$5)',[auth.packageId,a,auth.runId,pkg,owner]));
 await denied('NON_OWNER_CANNOT_APPROVE_IMPORT',()=>actor(staff,tx=>tx.query('select public.approve_operational_opening_import($1,$2,$3,$4,$5,$6)',[auth.packageId,auth.packageSha256,0,true,'FINAL OWNER IMPORT AUTHORIZATION:'+auth.packageId+':'+auth.packageSha256,randomUUID()])),['42501']);
 await denied('WRONG_PACKAGE_HASH',()=>actor(owner,tx=>tx.query('select public.approve_operational_opening_import($1,$2,$3,$4,$5,$6)',[auth.packageId,'0'.repeat(64),0,true,'FINAL OWNER IMPORT AUTHORIZATION:'+auth.packageId+':'+auth.packageSha256,randomUUID()])),['22023']);
 for(const x of authorizations)await actor(owner,tx=>tx.query('select public.approve_operational_opening_import($1,$2,$3,$4,$5,$6)',[x.packageId,x.packageSha256,0,true,'FINAL OWNER IMPORT AUTHORIZATION:'+x.packageId+':'+x.packageSha256,randomUUID()]));
 mark('EXPLICIT_OWNER_APPROVAL_BOUND_PACKAGE');
 await denied('IMPORT_ACTOR_BINDING_STRICT',()=>q('select private.begin_authorized_opening_import($1,$2,$3,$4::jsonb,$5)',[auth.packageId,a,auth.runId,pkg,staff]),['42501']);
 await denied('EXPIRED_IMPORT_AUTHORIZATION',()=>db.transaction(async tx=>{
  await tx.query("update private.operational_opening_packages set expires_at=clock_timestamp()-interval '1 second' where id=$1",[auth.packageId]);
  await tx.query('select private.begin_authorized_opening_import($1,$2,$3,$4::jsonb,$5)',[auth.packageId,a,auth.runId,pkg,owner]);
 }),['42501']);
 await denied('EXPIRED_RECOVERY_CHECKPOINT',()=>db.transaction(async tx=>{
  await tx.query("update private.operational_recovery_checkpoints set verified_at=clock_timestamp()-interval '1 day',expires_at=clock_timestamp()-interval '1 second' where id=(select recovery_id from private.operational_opening_packages where id=$1)",[auth.packageId]);
  await tx.query('select private.begin_authorized_opening_import($1,$2,$3,$4::jsonb,$5)',[auth.packageId,a,auth.runId,pkg,owner]);
 }),['42501']);
 await denied('BUSINESS_USER_CANNOT_FORGE_PROTECTED_IMPORT_CONTEXT',()=>actor(owner,tx=>tx.query('insert into private.operational_opening_executions(package_id,transaction_id) values($1,pg_current_xact_id())',[auth.packageId])),['42501']);
 await denied('SERVICE_ROLE_CANNOT_INVOKE_PRIVATE_IMPORT_ENTRY',()=>db.transaction(async tx=>{
  await tx.query('set local role service_role');
  await tx.query('select private.begin_authorized_opening_import($1,$2,$3,$4::jsonb,$5)',[auth.packageId,a,auth.runId,pkg,owner]);
 }),['42501']);
 for(const [name,aa,rr,pp] of [
 ['WRONG_BRANCH',b,auth.runId,pkg],['WRONG_RUN_ID',a,randomUUID(),pkg],
 ['CHANGED_CANONICAL_PACKAGE',a,auth.runId,{...pkg,source_rows:33}]
 ])await denied(name,()=>q('select private.begin_authorized_opening_import($1,$2,$3,$4::jsonb,$5)',[auth.packageId,aa,rr,pp,owner]));
 await denied('UNSUPPORTED_OPENING_PAYLOAD',()=>db.transaction(async tx=>{
  await tx.query('select private.begin_authorized_opening_import($1,$2,$3,$4::jsonb,$5)',[auth.packageId,a,auth.runId,pkg,owner]);
  await tx.query('select private.require_authorized_opening($1,$2,$3::jsonb)',[a,'PAYMENT',{branch_id:a,source_ref:'UNSUPPORTED'}]);
 }));
 await denied('IMPORT_EXCEPTION_NOT_NORMAL_POSTING_BYPASS',()=>db.transaction(async tx=>{
  await tx.query('select private.begin_authorized_opening_import($1,$2,$3,$4::jsonb,$5)',[auth.packageId,a,auth.runId,pkg,owner]);
  await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);
  await tx.query(paymentSql,paymentArgs);
 }),['PT423']);
 await denied('PENDING_CANNOT_ACTIVATE',()=>actor(owner,tx=>tx.query('select public.activate_branch_operations($1,$2,$3,$4,$5)',[a,0,true,'ACTIVATE:'+a+':0',randomUUID()])),['PT409']);
 const beforeFailure=await economicSnapshot();
 let writerCalls=0;
 const injectedDb={transaction:fn=>db.transaction(tx=>fn({...tx,query:async(sql,args=[])=>{
  if(/^select private\.post_(inventory|finance|cash)_opening\(/i.test(sql)&&++writerCalls===2)
   return tx.query('select 1/0');
  return tx.query(sql,args);
 }}))};
 await denied('ACTUAL_IMPORT_WRITER_FAILURE_ROLLBACK',()=>importAuthorizedOpenings(injectedDb,pkg,{...options,authorizations}),['22012']);
 assert.equal(writerCalls,2);
 await freshLogicalClient();
 assert.deepEqual(await economicSnapshot(),beforeFailure);
 for(const p of await q('select status,writer_txid,result from private.operational_opening_packages where id=any($1::uuid[])',[authorizations.map(x=>x.packageId)])){
  assert.equal(p.status,'APPROVED');assert.equal(p.writer_txid,null);assert.equal(p.result,null);
 }
 mark('ROLLBACK_FRESH_LOGICAL_CLIENT_READBACK');
 const imported=await importAuthorizedOpenings(db,pkg,{...options,authorizations});
 mark('EXACT_AUTHORIZED_IMPORT_COMMITTED',{result:imported});
 await denied('SAME_WRITER_TRANSACTION_NOT_INDEPENDENT_READBACK',()=>db.transaction(async tx=>{
  // Newly imported run has a different writer xid: compare against a fabricated same-xid ONLY inside rolled-back test.
  await tx.query('update private.operational_opening_packages set writer_txid=pg_current_xact_id() where id=$1',[auth.packageId]);
  await tx.query('select private.record_independent_opening_readback($1)',[auth.packageId]);
 }),['42501']);
 await denied('READY_REQUIRES_COMMITTED_READBACK',()=>q('select private.mark_operational_ready($1,$2,$3)',[auth.packageId,randomUUID(),0]),['42501']);
 await freshLogicalClient();
 const readbacks=await reconcileAuthorizedOpenings(db,authorizations);
 mark('FRESH_LOGICAL_COMMITTED_READBACK',{readbacks,pidAcceptance:'INFORMATIONAL_ONLY'});
 const totals=(await q(`select
 (select coalesce(sum(value_vnd),0)::text from public.inventory_opening_sources where branch_id=any($1::uuid[]) and location_kind='WAREHOUSE') inventory,
 (select coalesce(sum(value_vnd),0)::text from public.inventory_opening_sources where branch_id=any($1::uuid[]) and location_kind<>'WAREHOUSE') transit,
 (select coalesce(sum(original_amount_vnd),0)::text from public.receivable_obligations where branch_id=any($1::uuid[])) ar,
 (select coalesce(sum(original_amount_vnd),0)::text from public.payable_obligations where branch_id=any($1::uuid[]) and supplier_id is not null) ap,
 (select coalesce(sum(amount_vnd),0)::text from public.cash_opening_balances where branch_id=any($1::uuid[])) cash,
 (select coalesce(sum(original_amount_vnd),0)::text from public.payable_obligations where branch_id=any($1::uuid[]) and employee_id is not null) employee`,[branches.map(x=>x.id)]))[0];
 assert.deepEqual(totals,{inventory:'171025',transit:'75013',ar:'750000',ap:'350000',cash:'2000000',employee:'80000'});
 report.totals=totals;mark('INDEPENDENT_SIX_TOTAL_RECONCILIATION',totals);
 const retry=await importAuthorizedOpenings(db,pkg,{...options,authorizations});
 assert.deepEqual(retry,imported);mark('COMMITTED_SAME_RUN_RETRY_READ_ONLY');
 for(const t of ['payments','revenue_entries','direct_cost_entries','earning_events','deliveries'])assert.equal((await q('select count(*)::int n from public.'+t+' where branch_id=any($1::uuid[])',[branches.map(x=>x.id)]))[0].n,0);
 mark('OPENING_NO_ORDINARY_LEDGER_EFFECTS');
 await denied('COMPLETED_AUTHORIZATION_CANNOT_REINSTALL_WRITE_CAPABILITY',()=>db.transaction(async tx=>{
  const completed=(await tx.query('select private.begin_authorized_opening_import($1,$2,$3,$4::jsonb,$5) result',[auth.packageId,a,auth.runId,pkg,owner])).rows[0].result;
  assert.equal(completed.completed,true);
  const [{n}]=(await tx.query('select count(*)::int n from private.operational_opening_executions where package_id=$1 and transaction_id=pg_current_xact_id()',[auth.packageId])).rows;
  assert.equal(n,0);
  const m=planned.manifest.find(m=>m.payload.branch_id===a);
  await tx.query('select private.require_authorized_opening($1,$2,$3::jsonb)',[a,m.kind,m.payload]);
 }),['42501']);
 async function authorizePackage(packageInput,bytes,manifest){
  const list=[];
  for(const original of authorizations){
   const [existing]=await q('select recovery_id,expires_at from private.operational_opening_packages where id=$1',[original.packageId]);
   const next=await registerOperationalOpeningPackage(db,packageInput,{sourceBytes:bytes,manifest,branchId:original.branchId,runId:randomUUID(),actorId:owner,recoveryId:existing.recovery_id,expiresAt:existing.expires_at,dataMode:'QA_SYNTHETIC'});
   await actor(owner,tx=>tx.query('select public.approve_operational_opening_import($1,$2,$3,$4,$5,$6)',[next.packageId,next.packageSha256,0,true,'FINAL OWNER IMPORT AUTHORIZATION:'+next.packageId+':'+next.packageSha256,randomUUID()]));
   list.push(next);report.fixtures.authorizationPackages.push(next.packageId);
  }
  return list;
 }
 const beforeNewRun=await economicSnapshot();
 const newAuthorizations=await authorizePackage(pkg,sourceBytes,planned.manifest);
 const newRun=await importAuthorizedOpenings(db,pkg,{...options,operationId:randomUUID(),authorizations:newAuthorizations});
 await freshLogicalClient();
 assert.deepEqual(await economicSnapshot(),beforeNewRun);
 assert.deepEqual(newRun.sources.map(x=>x.id).sort(),imported.sources.map(x=>x.id).sort());
 mark('NEW_APPROVED_RUN_SAME_SOURCE_NO_DUPLICATE_ECONOMIC_STATE');
 const changed=structuredClone(pkg),changedRow=changed.tables.H[0];
 changedRow.unit_cost_vnd_per_base=new Decimal(changedRow.unit_cost_vnd_per_base).plus(1).toFixed();
 changedRow.inventory_value_vnd=new Decimal(changedRow.unit_cost_vnd_per_base).mul(changedRow.base_quantity).toDecimalPlaces(0,Decimal.ROUND_HALF_UP).toFixed();
 delete changed.source_sha256;
 const changedBytes=Buffer.from(JSON.stringify(changed));changed.source_sha256=hash(changedBytes);
 const changedPlan=await prepareOperationalOpeningPackage(db,changed,{...options,operationId:randomUUID()});
 const conflictAuthorizations=await authorizePackage(changed,changedBytes,changedPlan.manifest);
 await denied('TRUE_STABLE_SOURCE_CHANGED_AMOUNT_CONFLICT',()=>importAuthorizedOpenings(db,changed,{...options,operationId:randomUUID(),authorizations:conflictAuthorizations}),['PT409']);
 await freshLogicalClient();assert.deepEqual(await economicSnapshot(),beforeNewRun);
 mark('SOURCE_CONFLICT_FRESH_CLIENT_NO_OVERWRITE_OR_DUPLICATE');
 for(const x of readbacks)await q('select private.mark_operational_ready($1,$2,$3)',[x.packageId,x.readbackId,0]);
 mark('READY_ONLY_AFTER_RECONCILIATION');
 await denied('READY_STILL_BLOCKS_OWNER_POSTING',()=>actor(owner,tx=>tx.query(paymentSql,paymentArgs)),['PT423']);
 await denied('STAFF_CANNOT_ACTIVATE',()=>actor(staff,tx=>tx.query('select public.activate_branch_operations($1,$2,$3,$4,$5)',[a,1,true,'ACTIVATE:'+a+':1',randomUUID()])),['42501']);
 await denied('STALE_ACTIVATION_VERSION',()=>actor(owner,tx=>tx.query('select public.activate_branch_operations($1,$2,$3,$4,$5)',[a,0,true,'ACTIVATE:'+a+':0',randomUUID()])),['PT409']);
 const activation=randomUUID();
 if(managed){
  const postingClient=await qaDatabase(),observer=await qaDatabase();
  const postingDb=managedAdapter(postingClient),observerDb=managedAdapter(observer);
  let postingOutcome;
  try{
   await actor(owner,async tx=>{
    await tx.query('select public.activate_branch_operations($1,$2,$3,$4,$5)',[a,1,true,'ACTIVATE:'+a+':1',activation]);
    const label=runId+'_concurrent_post';
    postingOutcome=actorOn(postingDb,owner,async ptx=>{
     await ptx.exec("set local lock_timeout='10s';set local statement_timeout='15s';");
     await ptx.query("select set_config('application_name',$1,true)",[label]);
     return ptx.query(paymentSql,paymentArgs);
    }).then(value=>({ok:true,value}),error=>({ok:false,error}));
    let observed=false;
    for(let attempt=0;attempt<12&&!observed;attempt++){
     const [{waiting}]=(await observerDb.query("select exists(select 1 from pg_stat_activity where application_name=$1 and wait_event_type='Lock') waiting",[label])).rows;
     observed=waiting;if(!observed)await new Promise(r=>setTimeout(r,100));
    }
    assert.equal(observed,true,'Concurrent posting must wait on uncommitted activation');
   });
   const completed=await postingOutcome;
   if(!completed.ok)throw completed.error;
   mark('CONCURRENT_ACTIVATION_POSTING_SERIALIZED_MANAGED');
  }finally{if(postingOutcome)await postingOutcome;await postingClient.end({timeout:5});await observer.end({timeout:5});}
 }else{
  await actor(owner,tx=>tx.query('select public.activate_branch_operations($1,$2,$3,$4,$5)',[a,1,true,'ACTIVATE:'+a+':1',activation]));
  report.concurrency='NOT_VERIFIED_SINGLE_BACKEND_ISOLATED';
 }
 await actor(owner,tx=>tx.query('select public.activate_branch_operations($1,$2,$3,$4,$5)',[a,1,true,'ACTIVATE:'+a+':1',activation]));
 mark('OWNER_ACTIVATION_IDEMPOTENT_AND_AUDITED');
 await denied('ACTIVE_DOES_NOT_GRANT_PAYMENT_PERMISSION_TO_STAFF',()=>actor(staff,tx=>tx.query(paymentSql,paymentArgs)),['42501']);
 await actor(owner,tx=>tx.query(paymentSql,paymentArgs));mark('ACTIVE_PRESERVES_AUTHORIZED_PAYMENT_RULES');
 const state=(await actor(owner,tx=>tx.query('select public.operational_branch_state($1) result',[a]))).rows[0].result;
 assert.equal(state.state,'ACTIVE');assert.equal(state.version,2);assert.equal(state.canActivate,false);
 mark('BRANCH_STATE_READ_MODEL');
 const guarded=(await q("select c.relname,t.tgenabled,t.tgtype from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_trigger t on t.tgrelid=c.oid where n.nspname='public' and t.tgname='operational_posting_guard' and t.tgfoid='private.enforce_operational_write()'::regprocedure order by c.relname"));
 assert.equal(guarded.length,31);for(const g of guarded){assert.equal(g.tgenabled,'O');assert.equal(g.tgtype,31);}
 mark('ALL_31_POSTING_TABLE_BOUNDARIES_PROTECTED');
 if(managed){
  const [{n,sha}]=await q("select count(*)::int n,min(encode(extensions.digest(convert_to(statements[1],'UTF8'),'sha256'),'hex')) sha from supabase_migrations.schema_migrations where version='20261009173806'");
  assert.equal(n,1);assert.equal(sha,report.gateSha256);
  mark('MANAGED_EXACT_MIGRATION_HASH_AND_HISTORY_ONCE');
 }
 report.status='PASS_TARGETED_GATE_CONTROLS';
}catch(e){
 report.status='FAIL_CLOSED_NO_PRODUCTION_WRITE';report.failures.push({message:e.message,code:e.code??null,stack:e.stack?.split('\n').slice(0,4)});process.exitCode=1;
}finally{
 if(raw){if(managed)await raw.end({timeout:5});else await raw.close();}
 const artifact=out+(resume?'/gate-acceptance-continuation.json':'/gate-acceptance.json');
 await fs.writeFile(artifact,JSON.stringify(report,null,2),{mode:0o600});
 console.log(JSON.stringify({status:report.status,checks:report.checks.length,failures:report.failures,artifact}));
}
