import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {argumentsForRun,openQA,rejected} from './native-fixture.mjs';
import {paidReturnScenario} from './package4-return-fixture.mjs';
import {isolatedBranchFixture} from './isolated-branch-fixture.mjs';
const args=argumentsForRun(),qa=await openQA(args),{sql,rpc}=qa;
const personas=JSON.parse(await readFile(args.personas,'utf8')).personas;
const report={scope:'G17_SOURCE_TRIP_COST_DIRECT_OVERHEAD_AP_ATOMIC_RETRY_AND_G16',database:args.database,productionAccess:'NONE',managedAuthTested:false,checks:[]};
const rollback=new Error('ROLLBACK_G17');
try {
 try {await sql.begin(async tx=>{
  const b=await isolatedBranchFixture(tx,qa,[personas.finance.subject,personas.sales.subject]); const f=b.fixtures;
  const d=await paidReturnScenario(tx,b,personas.finance.subject,{paid:'0'});
  const category=await rpc(tx,'create_expense_category',[f.branch,d.stock.prefix,'Chi phí chuyến giả QA',randomUUID()]);
  await tx.unsafe('set local role postgres');
  const [assignment]=await tx`select a.id,d.version from public.delivery_assignments a join public.deliveries d on d.id=a.delivery_id where a.delivery_id=${d.delivery}`;
  const [clock]=await tx`select now()::text now`;
  const effectiveAt=new Date(Date.parse(clock.now)-1000).toISOString();
  const input=(scope,ref,amount='100000',op=randomUUID(),version=assignment.version)=>[f.branch,assignment.id,category,f.supplier,amount,effectiveAt,'2030-01-01','Chi phí nhà cung cấp chuyến QA',scope,ref,null,version,op];
  const reportInput=[f.branch,'2000-01-01','2030-01-01','2030-01-01',null,null,null,null];
  const baseline=await rpc(tx,'finance_dashboard_snapshot',reportInput);
  await rejected(tx,sp=>rpc(sp,'create_delivery_expense',input('DIRECT_DELIVERY','NULL-V',undefined,undefined,null)),'delivery_expense_source_version_conflict','40001');
  await rejected(tx,sp=>rpc(sp,'create_delivery_expense',input('DIRECT_DELIVERY','OLD-V',undefined,undefined,1)),'delivery_expense_source_version_conflict','40001');
  await rejected(tx,sp=>rpc(sp,'create_delivery_expense',input('DIRECT_DELIVERY','DENIED'),personas.sales.subject),'forbidden','42501');
  await tx.unsafe('set local role postgres');
  const [counts]=await tx`select count(*)::int expenses from public.expenses where branch_id=${f.branch}`;
  await tx.unsafe("create function pg_temp.fail_expense_source() returns trigger language plpgsql as $$begin raise exception 'qa_expense_source_fault' using errcode='P0001';end$$; create trigger qa_fail_expense_source after insert on public.delivery_expense_sources for each row execute function pg_temp.fail_expense_source();").simple();
  const directArgs=input('DIRECT_DELIVERY',d.stock.prefix+'_FEE');
  await rejected(tx,sp=>rpc(sp,'create_delivery_expense',directArgs),'qa_expense_source_fault','P0001');
  await tx.unsafe('set local role postgres');await tx.unsafe('drop trigger qa_fail_expense_source on public.delivery_expense_sources');
  assert.equal((await tx`select count(*)::int n from public.expenses where branch_id=${f.branch}`)[0].n,counts.expenses);
  const direct=await rpc(tx,'create_delivery_expense',directArgs);assert.equal(await rpc(tx,'create_delivery_expense',directArgs),direct);
  await rejected(tx,sp=>rpc(sp,'create_delivery_expense',input('OVERHEAD',directArgs[9], '30000')),undefined,'23505');
  await rejected(tx,sp=>rpc(sp,'approve_expense',[direct,null,randomUUID()]),'expense_version_conflict','PT409');
  await rejected(tx,sp=>rpc(sp,'approve_expense',[direct,999,randomUUID()]),'expense_version_conflict','PT409');
  await tx.unsafe('set local role postgres');
  await tx.unsafe("create function pg_temp.fail_expense_ap() returns trigger language plpgsql as $$begin if new.expense_id is not null then raise exception 'qa_expense_ap_fault' using errcode='P0001';end if;return new;end$$; create trigger qa_fail_expense_ap after insert on public.payable_obligations for each row execute function pg_temp.fail_expense_ap();").simple();
  const approveArgs=[direct,1,randomUUID()];await rejected(tx,sp=>rpc(sp,'approve_expense',approveArgs),'qa_expense_ap_fault','P0001');
  await tx.unsafe('set local role postgres');await tx.unsafe('drop trigger qa_fail_expense_ap on public.payable_obligations');
  assert.equal((await tx`select approval_state from public.expenses where id=${direct}`)[0].approval_state,'DRAFT');
  await rpc(tx,'approve_expense',approveArgs);assert.equal(await rpc(tx,'approve_expense',approveArgs),direct);
  const general=await rpc(tx,'create_delivery_expense',input('OVERHEAD',d.stock.prefix+'_COMMON','30000'));
  await rpc(tx,'approve_expense',[general,1,randomUUID()]);
  const after=await rpc(tx,'finance_dashboard_snapshot',reportInput);
  assert.equal(BigInt(after.direct_cost.value_vnd)-BigInt(baseline.direct_cost.value_vnd),100000n);
  assert.equal(BigInt(after.operating_expense.value_vnd)-BigInt(baseline.operating_expense.value_vnd),30000n);
  assert.equal(after.direct_cost.quality,'READY');
  await tx.unsafe('set local role postgres');
  const [facts]=await tx`select (select count(*)::int from public.payable_obligations where expense_id=${direct}) ap,
   (select count(*)::int from public.payments where branch_id=${f.branch}) payments,
   (select count(*)::int from public.earning_events where branch_id=${f.branch}) earnings,
   (select count(*)::int from public.audit_events where trace_id=${directArgs.at(-1)} and action='delivery_expense.created') create_audits,
   (select count(*)::int from public.audit_events where trace_id=${approveArgs.at(-1)} and action='expense.approved') approval_audits`;
  assert.deepEqual(facts,{ap:1,payments:0,earnings:0,create_audits:1,approval_audits:1});
  const [payable]=await tx`select id from public.payable_obligations where expense_id=${direct}`;
  const account=d.account;
  const payArgs=[f.branch,'DISBURSEMENT',null,f.supplier,account,'100000',clock.now,'CASH','Chi phí chuyến theo AP đã duyệt',[{obligation_id:payable.id,amount_vnd:'100000'}],'0',randomUUID()];
  const payment=await rpc(tx,'post_payment',payArgs,personas.finance.subject);assert.equal(await rpc(tx,'post_payment',payArgs,personas.finance.subject),payment);
  await tx.unsafe('set local role postgres');assert.equal((await tx`select private.current_payable_outstanding(${payable.id})::text amount`)[0].amount,'0');
  report.checks.push({status:'PASS',name:'DIRECT100K_OVERHEAD30K_NO_DOUBLE_REPORT_AP_PAYMENT_FAULT_VERSION_RETRY',facts,baseline,after});
  // The completed actual mixed-source G16 fixture is read separately, not rewritten.
  const g16=JSON.parse(await readFile(args.g16,'utf8')).documents;
  const sourceReport=await rpc(tx,'finance_dashboard_snapshot',[qa.fixtures.branch,'2000-01-01','2030-01-01','2030-01-01',g16.customer,null,null,'DELIVERY']);
  assert.equal(sourceReport.direct_cost.quality,'READY');assert.equal(sourceReport.direct_cost.value_vnd,'1500000');assert.equal(sourceReport.gross_profit.value_vnd,'800000');
  report.checks.push({name:'G16_PRIOR_MIXED_SOURCE_COMPLETE_EVIDENCE_READ_ONLY',status:'PASS',sourceReport});
  throw rollback;
 });}catch(e){if(e!==rollback)throw e;}
 report.status='PASS';report.rolledBack=true;await writeFile(args.out,JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,checks:report.checks.length}));
}catch(error){await writeFile(args.out.replace(/\.json$/,'-failure.json'),JSON.stringify({...report,status:'FAIL',error:{message:error.message,code:error.code}},null,2));throw error;}finally{await sql.end({timeout:3});}
