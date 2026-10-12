import assert from 'node:assert/strict';import{randomUUID}from'node:crypto';import{readFile,writeFile}from'node:fs/promises';
import{argumentsForRun,openQA,stockFixture}from'../remediation/native-fixture.mjs';import{isolatedBranchFixture}from'../remediation/isolated-branch-fixture.mjs';import{realQAAuth}from'../remediation/auth.mjs';
const args=argumentsForRun(),qa=await openQA(args);assert.equal(args.database,'hx_remediation_go_live_browser175');
const p=JSON.parse(await readFile(args.personas,'utf8')).personas;
const auth=await realQAAuth(args['auth-env'],{receiver:'hxqa-receiver@example.test',customerFinance:'hxqa-finance@example.test',otherCustomer:'hxqa-other_customer@example.test'});
try{const documents=await qa.sql.begin(async tx=>{
 const local=await isolatedBranchFixture(tx,qa,Object.values(p).map(r=>r.subject)),f=local.fixtures;
 const stock=await stockFixture(tx,local,'15',{prepareOnly:true});
 await tx.unsafe('set local role postgres');
 const workerRole=randomUUID();await tx`insert into public.roles(id,code,name)values(${workerRole},${'gl_worker_'+randomUUID().replaceAll('-','').slice(0,8)},'QA cổng thợ tối thiểu')`;
 await tx`insert into public.role_permissions(role_id,permission_code) values(${workerRole},'work.read'),(${workerRole},'work.claim')`;
 await tx`update public.employee_branch_access set role_id=${workerRole} where branch_id=${f.branch} and employee_id=${p.worker.employee}`;
 for(const [key,role]of[['receiver','RECEIVER'],['customerFinance','FINANCE_CONTACT']]){
  await tx`insert into auth.users(id)values(${auth.accounts[key].subject})on conflict(id)do nothing`;
  await tx`insert into public.customer_portal_memberships(auth_user_id,customer_id,membership_role,active)values(${auth.accounts[key].subject},${stock.customer},${role},true)`;
 }
 await tx`insert into auth.users(id)values(${auth.accounts.otherCustomer.subject})on conflict(id)do nothing`;
 await tx`insert into public.customer_portal_memberships(auth_user_id,customer_id,membership_role,active)values(${auth.accounts.otherCustomer.subject},${qa.fixtures.customer},'OWNER',true)on conflict do nothing`;
 const vehicle=randomUUID();await qa.rpc(tx,'save_catalog_record',['vehicles',vehicle,f.branch,{code:stock.prefix,plate_number:stock.prefix,capacity_quantity:'20',capacity_uom_id:stock.uom,capacity_source_note:'Xe QA nghiệm thu vận hành',active:true},null,'Xe riêng QA, không dữ liệu doanh nghiệp',randomUUID()]);
 const account=await qa.rpc(tx,'create_finance_account',[f.branch,stock.prefix,'Quỹ QA không đầu kỳ','CASH',randomUUID()]);
 await tx.unsafe('set local role postgres');
 const [state]=await tx`select state,activation_operation_id from private.branch_operational_states where branch_id=${f.branch}`;
 assert.equal(state.state,'PENDING_OPENING');assert.equal(state.activation_operation_id,null);
 return{...stock,fixtures:f,personas:p,vehicle,account,branch:f.branch,portalSubjects:Object.fromEntries(Object.entries(auth.accounts).map(([k,v])=>[k,v.subject])),sourceSynthetic:true,productionAccess:'NONE'};
 });await writeFile(args.out,JSON.stringify({scope:'ISOLATED_NATIVE_BROWSER_CONFIGURATION_REAL_QA_AUTH_UIDS',documents,tokensRecorded:false,passwordsRecorded:false,cleanup:'Drop only the owned browser clone after evidence/readback, preserve original QA database'},null,2));console.log(JSON.stringify({status:'READY',branch:documents.branch,zeroOpening:true,database:args.database,productionAccess:'NONE'}));}finally{await qa.sql.end({timeout:3});}
