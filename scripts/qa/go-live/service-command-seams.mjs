import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile,writeFile } from "node:fs/promises";
import { argumentsForRun,openQA,rejected } from "../remediation/native-fixture.mjs";
const a=argumentsForRun(),q=await openQA(a),d=JSON.parse(await readFile(a.documents,"utf8")).documents,r={scope:"SERVICE_CANCEL_ASSIGN_START_HEARTBEAT_RIGHTS_RETRY",checks:[],productionAccess:"NONE"},rollback=new Error("ROLLBACK_SERVICE_COMMAND_SEAMS");
const call=(tx,name,args,uid=d.fixtures.owner)=>q.rpc(tx,name,args,uid);
try{
 try{await q.sql.begin(async tx=>{
  const args=[d.branch,d.customer,d.site,"QA dịch vụ quyền và trạng thái","QA nguồn lịch riêng không ghi sổ","2500-01-01T00:00:00Z","2500-01-01T01:00:00Z","1","giờ",null,null,null,randomUUID()];
  const cancelJob=await call(tx,"create_service_job",args);const cancel=[cancelJob,1,"QA hủy lịch chưa thực hiện",randomUUID()];
  await rejected(tx,sp=>call(sp,"cancel_scheduled_service_job",[cancelJob,null,cancel[2],randomUUID()]),null,"PT409");
  await rejected(tx,sp=>call(sp,"cancel_scheduled_service_job",cancel,d.personas.worker.subject),null,"42501");
  assert.equal(await call(tx,"cancel_scheduled_service_job",cancel),cancelJob);assert.equal(await call(tx,"cancel_scheduled_service_job",cancel),cancelJob);
  r.checks.push({name:"UNSTARTED_SERVICE_CANCEL_RIGHTS_NULL_VERSION_RETRY",status:"PASS"});
  const job=await call(tx,"create_service_job",[...args.slice(0,12),randomUUID()]),work=await call(tx,"publish_work_item",[d.branch,"SERVICE_JOB",job,"POOL_CLAIM",null,randomUUID()]);
  const assignment=[work,d.personas.worker.employee,1,randomUUID()];await rejected(tx,sp=>call(sp,"assign_work_item",assignment,d.personas.worker.subject),null,"42501");
  const assigned=await call(tx,"assign_work_item",assignment);assert.equal(await call(tx,"assign_work_item",assignment),assigned);
  await tx.unsafe("set local role postgres");const [audit]=await tx`select count(*)::int n from public.audit_events where trace_id=${assignment[3]}`;assert.equal(audit.n,1);
  r.checks.push({name:"MANAGER_ASSIGN_WORK_ITEM_CURRENT_SOURCE_RETRY_ONE_AUDIT",status:"PASS"});
  const [w]=await tx`select version from public.work_items where id=${work}`;await call(tx,"start_work_item",[work,w.version,randomUUID()],d.personas.worker.subject);
  const heartbeat=[work,"QA báo trạng thái công việc đang thực hiện",randomUUID()];
  await call(tx,"heartbeat_work_item",heartbeat,d.personas.worker.subject);await call(tx,"heartbeat_work_item",heartbeat,d.personas.worker.subject);
  await rejected(tx,sp=>call(sp,"heartbeat_work_item",[work,"QA người khác bị từ chối",randomUUID()],d.portalSubjects.customerFinance),null,"42501");
  const [version]=await tx`select version from public.service_jobs where id=${job}`;
  await rejected(tx,sp=>call(sp,"cancel_scheduled_service_job",[job,version.version,"QA không hủy lịch đã thực hiện",randomUUID()]));
  r.checks.push({name:"CURRENT_WORKER_HEARTBEAT_FOREIGN_DENIAL_STARTED_SERVICE_CANCEL_REJECTED",status:"PASS"});
  throw rollback;
 });}catch(e){if(e!==rollback)throw e;}
 r.status="PASS";r.rolledBack=true;r.checkedAt=new Date().toISOString();await writeFile(a.out,JSON.stringify(r,null,2));console.log(JSON.stringify({status:"PASS",checks:r.checks.length,rolledBack:true}));
}catch(e){r.status="FAIL";r.error=e.message.split("\n")[0];await writeFile(a.out,JSON.stringify(r,null,2));throw e;}finally{await q.sql.end({timeout:3});}
