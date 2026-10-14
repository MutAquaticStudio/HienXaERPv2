import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import {nativeRpcParameters} from '../native-rpc-parameters.mjs';

const args=Object.fromEntries(process.argv.slice(2).reduce((a,v,i,all)=>{if(i%2===0)a.push([v.replace(/^--/,''),all[i+1]]);return a;},[]));
assert.ok(args.credentials&&args.out,'--credentials and --out required');
const config=JSON.parse(await readFile(args.credentials,'utf8'));
assert.equal(config.host,'127.0.0.1');assert.equal(config.port,49760);
const admin=postgres({...config,database:'postgres',max:1,prepare:false,connect_timeout:5,onnotice(){}});
const migrationNames=['20261014034026_bulk_import_draft_recovery_boundary.sql','20261014131000_bulk_so_po_import.sql'];
const baselineBoundary=migrationNames[0];
const migrationRoot=new URL('../../../supabase/migrations/',import.meta.url);
const migrations=await Promise.all(migrationNames.map(name=>readFile(new URL(name,migrationRoot),'utf8')));
const report={status:'RUNNING',scope:'PR1_AND_PR2_NATIVE_RECOVERY_AND_IMPORT_BOUNDARY',productionAccess:'NONE',managedQAAccess:'NONE',excludedAdvanceRacesRun:false,checks:[],migrationShas:Object.fromEntries(migrationNames.map((name,index)=>[name,createHash('sha256').update(migrations[index]).digest('hex')])),databases:[]};
const check=(name,detail={})=>report.checks.push({name,status:'PASS',...detail});
const knownErrors=[];let database;
async function installStorageMock(connection){
 await connection.unsafe(`create schema storage;
  create table storage.buckets(id text primary key,name text not null,public boolean not null default false,file_size_limit bigint,allowed_mime_types text[]);
  create table storage.objects(id uuid primary key default extensions.gen_random_uuid(),bucket_id text not null,name text not null,metadata jsonb not null default '{}'::jsonb,unique(bucket_id,name));
  alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,update,delete on storage.objects to authenticated;`).simple();
}
async function rpc(connection,actor,name,values){
 assert.match(name,/^[a-z_]+$/);
 const [m]=await connection`select p.proargnames names,array(select format_type(t,null) from unnest(p.proargtypes::oid[]) t) types from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=${name}`;
 assert.ok(m,`Missing RPC ${name}`);
 return connection.begin(async tx=>{
  await tx.unsafe("set local role authenticated;set local statement_timeout='15s'").simple();
  await tx`select set_config('request.jwt.claim.sub',${actor},true)`;
  const [r]=await tx.unsafe(`select public.${name}(${values.map((_,i)=>`${m.names[i]}=>$${i+1}::${m.types[i]}`).join(',')}) value`,nativeRpcParameters(tx,values,m.types.slice(0,values.length)));
  return r.value;
 });
}
async function denied(run,code){await assert.rejects(run,e=>{knownErrors.push({code:e.code,message:e.message});return e.code===code;});}
async function asAuthenticated(actor,work){return database.begin(async tx=>{await tx.unsafe('set local role authenticated').simple();await tx`select set_config('request.jwt.claim.sub',${actor},true),set_config('request.jwt.claim.role','authenticated',true)`;return work(tx);});}
async function asService(work){return database.begin(async tx=>{await tx.unsafe('set local role service_role').simple();await tx`select set_config('request.jwt.claim.role','service_role',true)`;return work(tx);});}
async function addUploadedFile(actor,kind,branchId,runId,fileId,fileName,size){
 const registered=await rpc(database,actor,'register_bulk_import_file',[runId,fileId,fileName,size,branchId,kind]);
 const permission=await asAuthenticated(actor,tx=>tx`select auth.uid() actor, public.bulk_import_feature_status(${branchId},${kind}) allowed`);
 const runCheck=await database`select actor_auth_user_id,branch_id,document_kind,state,expires_at>now() unexpired from private.bulk_import_runs where id=${runId}`;
 assert.equal(runCheck.length,1,`run disappeared after reconnect: ${JSON.stringify(runCheck)}`);
 assert.equal(permission[0].actor,actor,`JWT actor mismatch: ${JSON.stringify(permission)}`);
 assert.equal(permission[0].allowed,true,`import permission changed after reconnect: ${JSON.stringify(permission)}`);
 assert.equal(runCheck[0].actor_auth_user_id,actor,`run owner mismatch: ${JSON.stringify(runCheck)}`);
 assert.equal(runCheck[0].branch_id,branchId,`run branch mismatch: ${JSON.stringify(runCheck)}`);
 assert.equal(runCheck[0].document_kind,kind,`run kind mismatch: ${JSON.stringify(runCheck)}`);
 assert.equal(runCheck[0].state,'UPLOADING',`unexpected run state: ${JSON.stringify(runCheck)}`);
 assert.equal(runCheck[0].unexpired,true,`run expired: ${JSON.stringify(runCheck)}`);
 await asAuthenticated(actor,tx=>tx`insert into storage.objects(bucket_id,name,metadata) values(${registered.bucket_id},${registered.object_path},${JSON.stringify({size:String(size)})}::jsonb)`);
 const checksum=createHash('sha256').update(Buffer.alloc(size,7)).digest('hex');
 await rpc(database,actor,'finish_bulk_import_upload',[fileId,size,checksum]);
 return registered;
}
try{
 const [identity]=await admin`select version(),current_setting('data_directory') directory`;
 assert.equal(identity.directory,path.join(path.dirname(args.credentials),'cluster-data'));
 report.engine=identity.version;
 const owned='hx_remediation_bulk_recovery_'+randomUUID().replaceAll('-','').slice(0,10);
 assert.equal((await admin`select exists(select 1 from pg_database where datname=${owned}) present`)[0].present,false);
 await admin.unsafe(`create database "${owned}" template template0`);report.databases.push(owned);
 database=postgres({...config,database:owned,max:1,prepare:false,onnotice(){}});
 await database.unsafe(`create schema extensions;create extension pgcrypto with schema extensions;
 create schema auth;grant usage on schema auth to authenticated,service_role;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;`).simple();
 const oldFiles=(await readdir(migrationRoot)).filter(n=>n.endsWith('.sql')&&n<baselineBoundary).sort();
 for(const file of oldFiles)await database.unsafe(await readFile(new URL(file,migrationRoot),'utf8')).simple();
 await installStorageMock(database);
 check('BASELINE_FROM_MAIN_189',{migrationFiles:oldFiles.length});
 const f=Object.fromEntries(['a','b','ea','eb','branch','otherBranch','role','customer','site','supplier','warehouse','group','material','uom'].map(k=>[k,randomUUID()]));
 await database`insert into auth.users(id) values(${f.a}),(${f.b})`;
 await database`insert into public.branches(id,code,name) values(${f.branch},'BI_BRANCH','Chi nhánh import QA'),(${f.otherBranch},'BI_OTHER','Chi nhánh khác QA')`;
 await database`insert into public.roles(id,code,name) values(${f.role},'bulk_qa_full','Quyền import QA')`;
 await database`insert into public.role_permissions select ${f.role},code from public.permissions`;
 await database`insert into public.employees(id,auth_user_id,code,display_name) values(${f.ea},${f.a},'BI_ACTOR_A','Người import QA A'),(${f.eb},${f.b},'BI_ACTOR_B','Người import QA B')`;
 await database`insert into public.employee_branch_access(employee_id,branch_id,role_id) values(${f.ea},${f.branch},${f.role}),(${f.eb},${f.branch},${f.role})`;
 await database`insert into public.customers(id,branch_id,code,display_name,sales_owner_employee_id) values(${f.customer},${f.branch},'BI_CUSTOMER','Khách import QA',${f.ea})`;
 await database`insert into public.customer_sites(id,customer_id,code,name,address_text) values(${f.site},${f.customer},'BI_SITE','Điểm giao QA','Địa chỉ QA tổng hợp')`;
 await database`insert into public.suppliers(id,branch_id,code,name) values(${f.supplier},${f.branch},'BI_SUPPLIER','NCC import QA')`;
 await database`insert into public.warehouses(id,branch_id,code,name,address_text) values(${f.warehouse},${f.branch},'BI_WAREHOUSE','Kho import QA','Địa chỉ kho QA tổng hợp')`;
 await database`insert into public.material_groups(id,code,name) values(${f.group},'BI_GROUP','Nhóm QA')`;
 await database`insert into public.units_of_measure(id,code,name,symbol,decimal_scale) values(${f.uom},'bi_m3','Mét khối QA','m³',6)`;
 await database`insert into public.materials(id,group_id,code,name,base_uom_id) values(${f.material},${f.group},'BI_MATERIAL','Vật tư import QA',${f.uom})`;
 const common={material_id:f.material,ordered_uom_id:f.uom,quantity:'0.123456',conversion_numerator:'1',conversion_denominator:'1',rounding_mode:'HALF_UP',price_source_type:'MANUAL_APPROVED',override_reason:'Giá kiểm thử QA được duyệt'};
 const sale=[{...common,unit_price_vnd:'230000',pricing_rule_id:null,pricing_rule_version:null}];
 const buy=[{...common,unit_cost_vnd:'150000',purchase_price_rule_id:null,purchase_price_rule_version:null}];
 const oldOperation=randomUUID();
 const oldSalesArgs=[f.branch,f.customer,f.site,null,'Bản nháp QA trước nâng cấp',sale,oldOperation];
 const oldSO=await rpc(database,f.a,'create_sales_order_draft',oldSalesArgs);
 const replayByOtherActor=await rpc(database,f.b,'create_sales_order_draft',oldSalesArgs);
 assert.equal(replayByOtherActor,oldSO);
 report.baselineGap={name:'SO_RECEIPT_ACTOR_OWNERSHIP_MISSING',status:'REPRODUCED_BEFORE_FIX',productionExploit:'NOT_TESTED'};
 const beforeData=await database`select row_to_json(o)::text data from public.sales_orders o where id=${oldSO}`;
 const beforeAcl=await database`select n.nspname schema,p.proname name,pg_get_function_identity_arguments(p.oid) args,p.proacl::text acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by name,args`;
 for(const migration of migrations)await database.unsafe(migration).simple();
 await database.end({timeout:3});
 // Migration files contain explicit BEGIN/COMMIT; use max:1 there. The second pool
 // enables truly concurrent independent transactions for the source-key race below.
 database=postgres({...config,database:owned,max:5,prepare:false,onnotice(){}});
 await denied(()=>rpc(database,f.b,'create_sales_order_draft',oldSalesArgs),'23505');
 assert.equal(await rpc(database,f.a,'create_sales_order_draft',oldSalesArgs),oldSO);
 assert.deepEqual(await database`select row_to_json(o)::text data from public.sales_orders o where id=${oldSO}`,beforeData);
 const afterAcl=await database`select n.nspname schema,p.proname name,pg_get_function_identity_arguments(p.oid) args,p.proacl::text acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by name,args`;
 for(const prior of beforeAcl)assert.ok(afterAcl.some(current=>current.schema===prior.schema&&current.name===prior.name&&current.args===prior.args&&current.acl===prior.acl),`existing public grant changed: ${prior.name}(${prior.args})`);
 assert.equal(afterAcl.length-beforeAcl.length,9);
 check('UPGRADE_ACTOR_DENIAL_OLD_DOC_AND_PUBLIC_ACL_PRESERVED');
 const ledgers=(await database`select tablename from pg_tables where schemaname='public' and tablename=any(array['inventory_movements','receivable_obligations','payable_obligations','payments','payment_allocations','supply_allocations','inventory_reservations','revenue_entries']) order by tablename`).map(r=>r.tablename);
 async function ledgerCounts(){const counts={};for(const table of ledgers){assert.match(table,/^[a-z_]+$/);counts[table]=(await database.unsafe(`select count(*)::int n from public.${table}`))[0].n;}return counts;}
 const beforeCounts=await ledgerCounts();
 for(const kind of ['SO','PO']){
  const command=kind==='SO'?'create_sales_order_draft':'create_purchase_order_draft';
  const operation=randomUUID();
  const p=kind==='SO'?{target_branch_id:f.branch,target_customer_id:f.customer,target_site_id:f.site,requested_delivery_at:'2026-10-14T12:30:00+07:00',commercial_terms:'QA import recovery',order_lines:sale,operation_id:operation}:{target_branch_id:f.branch,target_supplier_id:f.supplier,target_warehouse_id:f.warehouse,expected_at:'2026-10-14T12:30:00+07:00',commercial_terms:'QA import recovery',purchase_lines:buy,operation_id:operation};
  const entries=[['canonicalPayload',JSON.stringify(p)]];
  assert.equal(await rpc(database,f.a,'save_command_draft',[operation,command,f.branch,entries]),operation);
  const draft=await rpc(database,f.a,'get_command_draft',[operation,command,f.branch]);assert.deepEqual(draft.entries,entries);
  await denied(()=>rpc(database,f.b,'save_command_draft',[operation,command,f.branch,entries]),'23505');
  assert.equal(await rpc(database,f.b,'get_command_draft',[operation,command,f.branch]),null);
  const changed=[['canonicalPayload',JSON.stringify({...p,commercial_terms:'Payload đã bị đổi'})]];
  await denied(()=>rpc(database,f.a,'save_command_draft',[operation,command,f.branch,changed]),'23505');
  assert.deepEqual(await rpc(database,f.a,'lookup_command_outcome',[operation,command,f.branch]),{status:'UNKNOWN'});
  const args=kind==='SO'?[f.branch,f.customer,f.site,p.requested_delivery_at,p.commercial_terms,sale,operation]:[f.branch,f.supplier,f.warehouse,p.expected_at,p.commercial_terms,buy,operation];
  const mutatedArgs=[...args];mutatedArgs[4]='Payload RPC khác với ý định đã giữ';
  await denied(()=>rpc(database,f.a,command,mutatedArgs),'23505');
  assert.equal((await database`select count(*)::int n from public.command_receipts where operation_id=${operation}`)[0].n,0);
  const wrongIntentDocCount=kind==='SO'
   ? (await database`select count(*)::int n from public.sales_orders where created_by=${f.a} and commercial_terms='Payload RPC khác với ý định đã giữ'`)[0].n
   : (await database`select count(*)::int n from public.purchase_orders where created_by=${f.a} and commercial_terms='Payload RPC khác với ý định đã giữ'`)[0].n;
  assert.equal(wrongIntentDocCount,0);
  assert.deepEqual((await rpc(database,f.a,'get_command_draft',[operation,command,f.branch])).entries,entries);
  check(kind+'_SAVED_INTENT_BOUND_TO_CANONICAL_RPC');
  const result=await rpc(database,f.a,command,args);
  assert.equal((await rpc(database,f.a,'lookup_command_outcome',[operation,command,f.branch])).result_id,result);
  await denied(()=>rpc(database,f.a,command,mutatedArgs),'23505');
  assert.deepEqual(await rpc(database,f.b,'lookup_command_outcome',[operation,command,f.branch]),{status:'UNKNOWN'});
  await denied(()=>rpc(database,f.a,'lookup_command_outcome',[operation,command,f.otherBranch]),'42501');
  await database`update public.materials set active=false where id=${f.material}`;
  assert.equal(await rpc(database,f.a,'save_command_draft',[operation,command,f.branch,entries]),operation);
  assert.equal((await rpc(database,f.a,'lookup_command_outcome',[operation,command,f.branch])).result_id,result);
  assert.equal(await rpc(database,f.a,command,args),result);
  await database`update public.materials set active=true where id=${f.material}`;
  check(kind+'_FROZEN_INTENT_CONFLICT_BRANCH_ACTOR_AND_LOOKUP_FIRST');
  if(kind==='PO'){
   await database`delete from public.role_permissions where role_id=${f.role} and permission_code='purchasing.price.read'`;
   await denied(()=>rpc(database,f.a,'get_command_draft',[operation,command,f.branch]),'42501');
   await denied(()=>rpc(database,f.a,'lookup_command_outcome',[operation,command,f.branch]),'42501');
   await database`insert into public.role_permissions values(${f.role},'purchasing.price.read')`;
   check('REVOKED_PO_COST_READ_DENIED_FOR_PERSISTED_INTENT_AND_OUTCOME');
  }
 }
 await denied(()=>rpc(database,f.a,'lookup_command_outcome',[randomUUID(),'unapproved_command',f.branch]),'22023');
 assert.deepEqual(await rpc(database,f.a,'lookup_command_outcome',[randomUUID(),'post_payment',f.branch]),{status:'UNKNOWN'});
 check('EXISTING_RECOVERY_ADAPTER_DELEGATION');
 // The import boundary is off by default and does not permit even run creation until enabled by an operator.
 const disabledRun=randomUUID();
 await denied(()=>rpc(database,f.a,'register_bulk_import_file',[disabledRun,randomUUID(),'disabled.xlsx',4,f.branch,'SO']),'42501');
 assert.equal((await database`select count(*)::int n from private.bulk_import_runs where id=${disabledRun}`)[0].n,0);
 check('BULK_IMPORT_DEFAULT_OFF');
 await database`update private.bulk_import_feature_settings set enabled=true where singleton`;
 const importRun=randomUUID(),importFile=randomUUID(),sourceOperation=randomUUID();
 const stored=await addUploadedFile(f.a,'SO',f.branch,importRun,importFile,'sales-source.xlsx',4);
 await denied(()=>rpc(database,f.b,'get_bulk_import_run',[importRun]),'42501');
 await denied(()=>asAuthenticated(f.b,tx=>tx`insert into storage.objects(bucket_id,name,metadata) values(${stored.bucket_id},${stored.object_path},'{}'::jsonb)`),'42501');
 const salesPayload={target_branch_id:f.branch,target_customer_id:f.customer,target_site_id:f.site,requested_delivery_at:null,commercial_terms:'Nguồn nhập thử nghiệm native',order_lines:sale,operation_id:sourceOperation};
 const salesGroup={group_key:'ref:SO-SOURCE-001',operation_id:sourceOperation,source_namespace:'NCC QA',source_period:'2026-10',source_reference:'SO-SOURCE-001',state:'READY',validation_issues:[],candidate_payload:salesPayload};
 const reviewOverrides=[{groupKey:salesGroup.group_key,entityCode:'BI_CUSTOMER',siteOrWarehouseCode:'BI_SITE',expectedAt:'',terms:'',lines:[{rowNumber:2,materialCode:'BI_MATERIAL',uomCode:'bi_m3',quantity:'0.123456',manualPriceVnd:'230000',manualReason:'Giá kiểm thử QA được duyệt'}]}];
 const review=await rpc(database,f.a,'save_bulk_import_review',[importFile,{sheet:'Don ban',reviewOverrides},[salesGroup]]);
 assert.equal(review.count,1);
 const runAfterReview=await rpc(database,f.a,'get_bulk_import_run',[importRun]);
 const savedDocument=runAfterReview.files[0].documents[0];
 assert.deepEqual(runAfterReview.files[0].review_overrides,reviewOverrides);
 check('REVIEW_SOURCE_CORRECTIONS_AND_PRICE_OVERRIDE_SURVIVE_RELOAD');
 assert.equal(savedDocument.operation_id,sourceOperation);
 const soCountBefore=(await database`select count(*)::int n from public.sales_orders`)[0].n;
 const created=await rpc(database,f.a,'create_bulk_import_document_draft',[savedDocument.document_id,salesPayload,null,null]);
 assert.equal(created.status,'CREATED');
 assert.equal(created.source_occurrence,1);
 const firstSO=created.result_id;
 assert.equal((await rpc(database,f.a,'create_bulk_import_document_draft',[savedDocument.document_id,salesPayload,null,null])).result_id,firstSO);
 assert.equal((await database`select count(*)::int n from public.sales_orders`)[0].n,soCountBefore+1);
 assert.equal((await rpc(database,f.a,'get_bulk_import_run',[importRun])).state,'COMPLETE');
 check('SO_IMPORT_CREATE_AND_RETRY_ONCE_PER_SOURCE_OPERATION');
 const duplicateRun=randomUUID(),duplicateFile=randomUUID(),duplicateOperation=randomUUID();
 await addUploadedFile(f.a,'SO',f.branch,duplicateRun,duplicateFile,'sales-source-copy.xlsx',4);
 const duplicatePayload={...salesPayload,commercial_terms:'Nguồn nhập lặp có chủ đích',operation_id:duplicateOperation};
 await rpc(database,f.a,'save_bulk_import_review',[duplicateFile,{sheet:'Don ban'},[{...salesGroup,group_key:'ref:SO-SOURCE-001-COPY',operation_id:duplicateOperation,candidate_payload:duplicatePayload}]]);
 const duplicateDoc=(await rpc(database,f.a,'get_bulk_import_run',[duplicateRun])).files[0].documents[0];
 assert.equal(duplicateDoc.state,'DUPLICATE');
 const noRepeat=await rpc(database,f.a,'create_bulk_import_document_draft',[duplicateDoc.document_id,duplicatePayload,null,null]);
 assert.equal(noRepeat.status,'DUPLICATE');
 assert.equal((await database`select count(*)::int n from public.sales_orders`)[0].n,soCountBefore+1);
 const repeatCreated=await rpc(database,f.a,'create_bulk_import_document_draft',[duplicateDoc.document_id,duplicatePayload,savedDocument.document_id,'Đơn mua tách chứng từ theo yêu cầu khách']);
 assert.equal(repeatCreated.status,'CREATED');
 assert.equal(repeatCreated.source_occurrence,2);
 assert.equal((await database`select count(*)::int n from public.sales_orders`)[0].n,soCountBefore+2);
 check('SOURCE_DUPLICATE_BLOCK_AND_EXPLICIT_REPEAT_AUDIT');
 const raceRun=randomUUID(),raceFile=randomUUID(),raceOperationA=randomUUID(),raceOperationB=randomUUID();
 await addUploadedFile(f.a,'SO',f.branch,raceRun,raceFile,'sales-race.xlsx',4);
 const racePayloadA={...salesPayload,commercial_terms:'Hai nhân viên cùng nhập A',operation_id:raceOperationA};
 const racePayloadB={...salesPayload,commercial_terms:'Hai nhân viên cùng nhập B',operation_id:raceOperationB};
 const raceGroups=[
  {...salesGroup,group_key:'race:A',operation_id:raceOperationA,candidate_payload:racePayloadA},
  {...salesGroup,group_key:'race:B',operation_id:raceOperationB,candidate_payload:racePayloadB},
 ];
 await rpc(database,f.a,'save_bulk_import_review',[raceFile,{sheet:'Don ban'},raceGroups]);
 const raceDocs=(await rpc(database,f.a,'get_bulk_import_run',[raceRun])).files.find(file=>file.file_id===raceFile).documents;
 const raceA=raceDocs.find(doc=>doc.group_key==='race:A'),raceB=raceDocs.find(doc=>doc.group_key==='race:B');
 const raceResults=await Promise.all([
  rpc(database,f.a,'create_bulk_import_document_draft',[raceA.document_id,racePayloadA,duplicateDoc.document_id,'Tách thêm đơn nguồn cùng mã A']),
  rpc(database,f.a,'create_bulk_import_document_draft',[raceB.document_id,racePayloadB,duplicateDoc.document_id,'Tách thêm đơn nguồn cùng mã B']),
 ]);
 assert.equal(raceResults.filter(result=>result.status==='CREATED').length,1);
 assert.equal(raceResults.filter(result=>result.status==='DUPLICATE').length,1);
 assert.equal((await database`select count(*)::int n from private.bulk_import_documents where branch_id=${f.branch} and document_kind='SO' and source_reference_key='SO-SOURCE-001' and source_occurrence=3`)[0].n,1);
 check('CONCURRENT_SAME_SOURCE_CREATION_SERIALIZED');
 await rpc(database,f.a,'save_bulk_import_review',[raceFile,{sheet:'Don ban'},raceGroups.map(group=>({group_key:group.group_key,operation_id:group.operation_id,
  source_namespace:'NCC QA',source_period:'2026-10',source_reference:'SO-SOURCE-001',state:'READY',validation_issues:[],candidate_payload:group.candidate_payload}))]);
 const afterPartialReview=(await rpc(database,f.a,'get_bulk_import_run',[raceRun])).files.find(file=>file.file_id===raceFile).documents;
 assert.equal(afterPartialReview.filter(doc=>doc.state==='CREATED').length,1);
 assert.equal(afterPartialReview.filter(doc=>doc.state==='DUPLICATE').length,1);
 check('PARTIAL_REVIEW_PRESERVES_CREATED_DOCUMENT_AND_DUPLICATE_STATE');
 const unresolvedOperation=randomUUID();
 const unresolvedGroup={group_key:'unresolved:row-8',operation_id:unresolvedOperation,source_namespace:'NCC QA',source_period:'2026-10',
  source_reference:'SO-UNRESOLVED-008',state:'NEEDS_REVIEW',validation_issues:[{code:'UNRESOLVED',message:'Mã vật tư chưa khớp'}],candidate_payload:null};
 await rpc(database,f.a,'save_bulk_import_review',[raceFile,{sheet:'Don ban'},[
  ...raceGroups.map(group=>({group_key:group.group_key,operation_id:group.operation_id,source_namespace:'NCC QA',source_period:'2026-10',source_reference:'SO-SOURCE-001',state:'READY',validation_issues:[],candidate_payload:group.candidate_payload})),
  unresolvedGroup,
 ]]);
 let afterInvalidReview=(await rpc(database,f.a,'get_bulk_import_run',[raceRun])).files.find(file=>file.file_id===raceFile).documents;
 assert.equal(afterInvalidReview.find(doc=>doc.group_key===unresolvedGroup.group_key).state,'NEEDS_REVIEW');
 const correctedPayload={...salesPayload,commercial_terms:'Đã sửa dữ liệu chưa khớp',operation_id:unresolvedOperation};
 await rpc(database,f.a,'save_bulk_import_review',[raceFile,{sheet:'Don ban'},[
  ...raceGroups.map(group=>({group_key:group.group_key,operation_id:group.operation_id,source_namespace:'NCC QA',source_period:'2026-10',source_reference:'SO-SOURCE-001',state:'READY',validation_issues:[],candidate_payload:group.candidate_payload})),
  {...unresolvedGroup,state:'READY',validation_issues:[],candidate_payload:correctedPayload},
 ]]);
 afterInvalidReview=(await rpc(database,f.a,'get_bulk_import_run',[raceRun])).files.find(file=>file.file_id===raceFile).documents;
 assert.equal(afterInvalidReview.find(doc=>doc.group_key===unresolvedGroup.group_key).state,'READY');
 check('INVALID_REVIEW_CAN_BE_SAVED_AND_CORRECTED_WITHOUT_RECREATING_RUN');
 await database`update private.bulk_import_runs set created_at=now()-interval '2 hours' where id=${importRun}`;
 const runCounts=await database`select count(*) filter(where created_at>now()-interval '30 days')::int recent_30d,count(*) filter(where created_at>now()-interval '1 hour')::int recent_hour from private.bulk_import_runs where actor_auth_user_id=${f.a} and branch_id=${f.branch}`;
 assert.ok(runCounts[0].recent_30d<10&&runCounts[0].recent_hour<3,`test harness would hit run rate limit early: ${JSON.stringify(runCounts)}`);
 const poRun=randomUUID(),poFile=randomUUID(),poOperation=randomUUID();
 await addUploadedFile(f.a,'PO',f.branch,poRun,poFile,'purchase-source.xlsx',4);
 const poPayload={target_branch_id:f.branch,target_supplier_id:f.supplier,target_warehouse_id:f.warehouse,expected_at:null,commercial_terms:'Nguồn PO native',purchase_lines:buy,operation_id:poOperation};
 const poGroup={group_key:'ref:PO-SOURCE-001',operation_id:poOperation,source_namespace:'NCC QA',source_period:'2026-10',source_reference:'PO-SOURCE-001',state:'READY',validation_issues:[],candidate_payload:poPayload};
 await rpc(database,f.a,'save_bulk_import_review',[poFile,{sheet:'Don mua'},[poGroup]]);
 const poDoc=(await rpc(database,f.a,'get_bulk_import_run',[poRun])).files[0].documents[0];
 const poCreated=await rpc(database,f.a,'create_bulk_import_document_draft',[poDoc.document_id,poPayload,null,null]);
 assert.equal(poCreated.status,'CREATED');
 const poCount=(await database`select count(*)::int n from public.purchase_orders where id=${poCreated.result_id}`)[0].n;
 assert.equal(poCount,1);
 check('PO_IMPORT_WAREHOUSE_DRAFT_USES_CANONICAL_RPC');
 const rateLimitedRun=randomUUID();
 await denied(()=>rpc(database,f.a,'register_bulk_import_file',[rateLimitedRun,randomUUID(),'rate-limited.xlsx',4,f.branch,'SO']),'55000');
 assert.equal((await database`select count(*)::int n from private.bulk_import_runs where id=${rateLimitedRun}`)[0].n,0);
 check('BULK_IMPORT_RUN_RATE_LIMIT');
 await denied(()=>rpc(database,f.a,'list_expired_bulk_import_files',[100]),'42501');
 await database`update private.bulk_import_runs set created_at=now()-interval '31 days',expires_at=now()-interval '1 second' where id=${importRun}`;
 await denied(()=>rpc(database,f.a,'finish_bulk_import_upload',[importFile,4,createHash('sha256').update(Buffer.alloc(4,7)).digest('hex')]),'42501');
 check('EXPIRED_UPLOAD_CANNOT_BE_REVERIFIED');
 const expiredFiles=await asService(tx=>tx`select * from public.list_expired_bulk_import_files(100)`);
 assert.equal(expiredFiles.length,1);
 assert.equal(expiredFiles[0].file_id,importFile);
 await asService(tx=>tx`select public.mark_bulk_import_file_deleted(${importFile})`);
 assert.equal((await database`select upload_state from private.bulk_import_files where id=${importFile}`)[0].upload_state,'EXPIRED');
 assert.equal((await database`select state from private.bulk_import_runs where id=${importRun}`)[0].state,'EXPIRED');
 await denied(()=>rpc(database,f.a,'get_bulk_import_run',[importRun]),'42501');
 await denied(()=>rpc(database,f.a,'get_bulk_import_document',[savedDocument.document_id]),'42501');
 check('EXPIRED_RUN_AND_DOCUMENT_NO_LONGER_READABLE');
 check('RETENTION_QUEUE_SERVICE_ROLE_ONLY_AND_MARKS_STORAGE_PURGED');
 await database`update public.employees set active=false,deactivated_at=now() where id=${f.ea}`;
 await denied(()=>rpc(database,f.a,'lookup_command_outcome',[oldOperation,'create_sales_order_draft',f.branch]),'42501');
 await denied(()=>rpc(database,f.a,'create_sales_order_draft',oldSalesArgs),'42501');
 await database`update public.employees set active=true,deactivated_at=null where id=${f.ea}`;
 check('REVOKED_EMPLOYEE_OLD_IDENTITY_DENIED');
 assert.deepEqual(await ledgerCounts(),beforeCounts);
 assert.equal((await database`select count(*)::int n from private.branch_operational_states`)[0].n,0);
 check('DRAFTS_NO_STOCK_AR_AP_CASH_ALLOCATION_OR_FAKE_OPENING',{counts:beforeCounts});
 // Fresh installation uses all repository migrations, separately from the upgrade target.
 const fresh='hx_remediation_bulk_fresh_'+randomUUID().replaceAll('-','').slice(0,10);
 await admin.unsafe(`create database "${fresh}" template template0`);report.databases.push(fresh);
 const freshSql=postgres({...config,database:fresh,max:1,prepare:false,onnotice(){}});
 try{
  await freshSql.unsafe(`create schema extensions;create extension pgcrypto with schema extensions;create schema auth;grant usage on schema auth to authenticated,service_role;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;`).simple();
  for(const file of oldFiles)await freshSql.unsafe(await readFile(new URL(file,migrationRoot),'utf8')).simple();
  await installStorageMock(freshSql);
  for(const migration of migrations)await freshSql.unsafe(migration).simple();
  const catalog=sql=>sql`select n.nspname schema,p.proname name,pg_get_function_identity_arguments(p.oid) args,pg_get_functiondef(p.oid) definition,p.proacl::text acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','private') and p.prokind='f' order by schema,name,args`;
  assert.deepEqual(await catalog(freshSql),await catalog(database));
  check('FRESH_UPGRADE_FUNCTION_AND_ACL_PARITY');
 }finally{await freshSql.end({timeout:3});}
 report.status='PASS';report.expectedDenials=knownErrors;
}catch(e){report.status='FAIL';report.error={code:e.code,message:e.message};throw e;}
finally{
 if(database)await database.end({timeout:3});
 // Only runner-created UUID-suffixed databases are removed; all pre-existing QA DBs remain intact.
 for(const name of report.databases){assert.match(name,/^hx_remediation_bulk_(recovery|fresh)_[a-f0-9]{10}$/);await admin.unsafe(`drop database "${name}"`);}
 report.cleanup='OWNED_DATABASES_REMOVED';await admin.end({timeout:3});
 await writeFile(args.out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:report.checks.length,cleanup:report.cleanup,error:report.error}));
}
