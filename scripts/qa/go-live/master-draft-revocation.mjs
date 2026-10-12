import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile,writeFile } from 'node:fs/promises';
import { argumentsForRun,openQA,rejected } from '../remediation/native-fixture.mjs';
const a=argumentsForRun(),q=await openQA(a),d=JSON.parse(await readFile(a.documents,'utf8')).documents;
assert.ok(['before','after'].includes(a.phase));
const r={scope:'MASTER_CUSTOMER_DRAFT_CURRENT_FIELD_PERMISSIONS',phase:a.phase,productionAccess:'NONE',checks:[]},rollback=new Error('ROLLBACK_DRAFT_FIELD_ACL');
try{
 try{await q.sql.begin(async tx=>{
  const intent=randomUUID(), command='save_customer_site_profile', entries=[['kind','customers'],['operationId',intent],['original',JSON.stringify({id:d.customer,credit_limit_vnd:'9007199254740993',internal_note:'QA owned private draft'})],['reason','QA source-only draft without business mutation']];
  await q.rpc(tx,'save_command_draft',[intent,command,d.branch,entries],d.fixtures.owner);
  assert.deepEqual((await q.rpc(tx,'get_command_draft',[intent,command,d.branch],d.fixtures.owner)).entries,entries);
  await tx.unsafe('set local role postgres');
  const [employee]=await tx`select id from public.employees where auth_user_id=${d.fixtures.owner}`;
  const role=randomUUID();await tx`insert into public.roles(id,code,name)values(${role},${'qa_draft_'+role.slice(0,8)},'QA revoked financial field')`;
  await tx`insert into public.role_permissions(role_id,permission_code)values(${role},'customers.manage'),(${role},'customers.read')`;
  await tx`update public.employee_branch_access set active=false,revoked_at=now() where employee_id=${employee.id} and branch_id=${d.branch}`;
  await tx`delete from public.employee_permission_grants where employee_id=${employee.id} and branch_id=${d.branch}`;
  await tx`insert into public.employee_branch_access(employee_id,branch_id,role_id,active)values(${employee.id},${d.branch},${role},true)`;
  await q.actor(tx,d.fixtures.owner); const [privateField]=await tx`select credit_limit_vnd from public.customer_private_fields(array[${d.customer}]::uuid[])`; assert.equal(privateField.credit_limit_vnd,null);
  if(a.phase==='before'){
   const leaked=await q.rpc(tx,'get_command_draft',[intent,command,d.branch],d.fixtures.owner);
   assert.equal(JSON.parse(leaked.entries.find(x=>x[0]==='original')[1]).credit_limit_vnd,'9007199254740993');
   r.checks.push({name:'REPRODUCED_DRAFT_RETURNS_FINANCIAL_FIELD_AFTER_REVOCATION',status:'DEFECT_REPRODUCED'});
  }else{
   await rejected(tx,sp=>q.rpc(sp,'get_command_draft',[intent,command,d.branch],d.fixtures.owner),null,'42501');
   r.checks.push({name:'CUSTOMER_MANAGE_RETAINED_CREDIT_FIELD_DRAFT_DENIED_AFTER_FINANCE_REVOCATION',status:'PASS'});
   const safeOp=randomUUID(),safeEntries=[['kind','customers'],['original',JSON.stringify({id:d.customer,credit_limit_vnd:null,internal_note:'QA permitted internal note'})]];
   await q.rpc(tx,'save_command_draft',[safeOp,command,d.branch,safeEntries],d.fixtures.owner);
   assert.deepEqual((await q.rpc(tx,'get_command_draft',[safeOp,command,d.branch],d.fixtures.owner)).entries,safeEntries);
   r.checks.push({name:'SAFE_CUSTOMER_DRAFT_REMAINS_READABLE_WITH_CUSTOMERS_MANAGE',status:'PASS'});
   await tx.unsafe('set local role postgres');await tx`insert into public.role_permissions(role_id,permission_code)values(${role},'finance.ar.read')`;
   assert.deepEqual((await q.rpc(tx,'get_command_draft',[intent,command,d.branch],d.fixtures.owner)).entries,entries);
   r.checks.push({name:'REGRANTED_FIELD_RIGHT_RECOVERS_IDENTICAL_PAYLOAD_AND_INTENT',status:'PASS'});
  }
  throw rollback;
 });}catch(e){if(e!==rollback)throw e;}
 r.status=a.phase==='before'?'DEFECT_REPRODUCED':'PASS';r.rolledBack=true;r.checkedAt=new Date().toISOString();await writeFile(a.out,JSON.stringify(r,null,2));console.log(JSON.stringify({status:r.status,checks:r.checks.length,rolledBack:true}));
}catch(e){r.status='FAIL';r.error=e.message.split('\n')[0];await writeFile(a.out,JSON.stringify(r,null,2));throw e;}finally{await q.sql.end({timeout:3});}
