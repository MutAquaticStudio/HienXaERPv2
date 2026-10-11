import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import{readFile,writeFile}from'node:fs/promises';
import{argumentsForRun,openQA}from'./native-fixture.mjs';import{isolatedBranchFixture}from'./isolated-branch-fixture.mjs';import{deliveryExpenseScenario}from'./delivery-expense-fixture.mjs';import{realQAAuth}from'./auth.mjs';
const args=argumentsForRun(),qa=await openQA(args),p=JSON.parse(await readFile(args.personas,'utf8')).personas;
const auth=await realQAAuth(args['auth-env'],{owner:'hxqa-owner@example.test',finance:'hxqa-finance-employee@example.test',sales:'hxqa-sales@example.test'});
const report={scope:'G17_REAL_JWT_FAILED_REDELIVERY_COST_SOURCE_READBACK',productionAccess:'NONE',managedQaBusinessWrites:0,tokensRecorded:false,checks:[]};let observer;
try{
 const d=await qa.sql.begin(async tx=>{const b=await isolatedBranchFixture(tx,qa,[p.finance.subject,p.sales.subject]);return deliveryExpenseScenario(tx,b,{retry:true});});report.documents=d;
 await writeFile(args.out.replace(/\.json$/,'-sources.json'),JSON.stringify({documents:d},null,2));
 const create=(source,amount,ref)=>({target_branch_id:d.branch,target_assignment_id:source.assignment,target_category_id:d.category,target_supplier_id:d.supplier,amount_vnd:amount,effective_at:new Date(Date.now()-1000).toISOString(),due_date:'2030-01-01',description:'Chi phí riêng theo lần giao thật QA',cost_scope:'DIRECT_DELIVERY',supplier_reference:ref,target_evidence_id:null,expected_delivery_version:source.version,operation_id:randomUUID()});
 const amounts=['40000','60000'];const expenses=[];
 for(let i=0;i<d.deliveries.length;i++){
  const input=create(d.deliveries[i],amounts[i],d.stock.prefix+'_ATTEMPT'+i);
  const denial=await auth.api('sales','rpc/create_delivery_expense',input);assert.equal(denial.status,403);
  const created=await auth.api('owner','rpc/create_delivery_expense',input);assert.equal(created.status,200,JSON.stringify(created.data));
  const again=await auth.api('owner','rpc/create_delivery_expense',input);assert.equal(again.status,200);assert.equal(again.data,created.data);
  const approval={target_expense_id:created.data,expected_version:1,operation_id:randomUUID()};
  const approved=await auth.api('owner','rpc/approve_expense',approval);assert.equal(approved.status,200,JSON.stringify(approved.data));
  const repeat=await auth.api('owner','rpc/approve_expense',approval);assert.equal(repeat.status,200);
  expenses.push(created.data);report.checks.push({status:'PASS',failed:d.deliveries[i].failed,amount:amounts[i],createIntent:input.operation_id,approvalIntent:approval.operation_id,expense:created.data});
 }
 const read=await auth.api('finance','rpc/finance_dashboard_snapshot',{target_branch_id:d.branch,from_inclusive:'2000-01-01',to_exclusive:'2030-01-01',knowledge_cutoff:'2030-01-01'});assert.equal(read.status,200,JSON.stringify(read.data));
 assert.equal(read.data.revenue.value_vnd,'230000');assert.equal(read.data.direct_cost.value_vnd,'250000');assert.equal(read.data.gross_profit.value_vnd,'-20000');assert.equal(read.data.operating_expense.value_vnd,'0');report.snapshot=read.data;
 observer=await openQA(args);const [facts]=await observer.sql`select (select count(*)::int from public.payable_obligations where expense_id=any(${expenses}::uuid[])) ap,
 (select sum(amount_vnd)::text from public.expenses where id=any(${expenses}::uuid[])) fees,(select count(*)::int from public.earning_events where branch_id=${d.branch}) earnings,
 (select count(*)::int from public.delivery_expense_sources where expense_id=any(${expenses}::uuid[])) sources`;
 assert.deepEqual(facts,{ap:2,fees:'100000',earnings:0,sources:2});report.facts=facts;
 const hidden=await auth.api('sales',`delivery_expense_sources?branch_id=eq.${d.branch}`);assert.equal(hidden.status,200);assert.deepEqual(hidden.data,[]);
 const lookup=await auth.api('owner','rpc/lookup_command_outcome',{target_branch_id:d.branch,target_command:'create_delivery_expense',target_operation_id:report.checks[0].createIntent});assert.equal(lookup.data.status,'COMMITTED');
 report.status='PASS';await writeFile(args.out,JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,checks:report.checks.length,facts}));
}catch(error){await writeFile(args.out.replace(/\.json$/,'-failure.json'),JSON.stringify({...report,status:'FAIL',error:{message:error.message,code:error.code}},null,2));throw error;}finally{if(observer)await observer.sql.end({timeout:3});await qa.sql.end({timeout:3});}
