import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const root=path.resolve(import.meta.dirname,'../..');
const base=process.env.HX_MB_BASE_DIR,out=process.env.HX_MB_EVIDENCE_DIR;
assert.ok(base&&out&&base!==out,'Evidence must not overwrite baseline');
const previous=JSON.parse(await fs.readFile(base+'/business-http-evidence.json'));
const fixture=JSON.parse(await fs.readFile(base+'/fixture-manifest.json'));
const f=fixture.fixtureIds;
process.loadEnvFile(process.env.HX_MB_QA_ENV_FILE);
const core=await import('./core.mjs');const config=core.guard();
assert.equal(config.ref,'ffrwiglcrlumfvhubaxg');assert.equal(previous.target,config.ref);
const {createClient}=createRequire(root+'/package.json')('@supabase/supabase-js');
const sql=await core.database(),clients=[];
const report={scope:'MB_01_BIZ_05_07_SCOPED_RESUME',candidate:process.env.HX_MB_CANDIDATE,baseCandidate:previous.candidate,fixtureRunId:fixture.runId,target:config.ref,checks:[],operations:[],managedChanges:'NONE',production:'NOT_TOUCHED',browser:'NOT_RUN',status:'RUNNING'};
const payment=previous.operations.find(x=>x.group==='BIZ-05'&&x.rpc==='post_payment'&&!x.error).resultId;
const branch='a29d9f95-516a-4752-a67e-af3f5611d7bf';
const save=()=>fs.writeFile(out+'/finance-http-resume-evidence.json',JSON.stringify(report,null,2),{mode:0o600});
const query=(text,args=[])=>sql.unsafe(text,args);
const plain=rows=>Array.from(rows,r=>({...r}));
async function login(role){const client=createClient(config.url,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(u,o)=>fetch(u,{...o,signal:AbortSignal.timeout(15000)})}});const {data,error}=await client.auth.signInWithPassword({email:'hxqa-'+role+'@example.test',password:process.env.HX_QA_PASSWORD});assert.equal(error,null,'QA auth '+role);assert.equal(data.user.id,fixture.actors.find(x=>x.role===role).actorId);clients.push(client);return client;}
async function rpc(client,name,args,rejection=null){const r=await client.rpc(name,args);report.operations.push({name,operationId:args.operation_id??null,status:r.status,result:typeof r.data==='string'?r.data:null,error:r.error?{code:r.error.code,message:r.error.message}:null});await save();if(rejection){assert.ok(r.error);assert.equal(r.error.code,rejection.code);assert.match(r.error.message,rejection.message);return;}assert.equal(r.error,null,name+': '+r.error?.message);return r.data;}
async function effects(operation){const[row]=await query("select (select count(*)::int from public.payment_allocations where payment_id=$1) allocations,(select coalesce(sum(amount_delta_vnd),0)::text from public.payment_allocations where payment_id=$1) allocated,(select count(*)::int from public.command_receipts where operation_id=$2) receipt,(select count(*)::int from public.payments where reversal_of_payment_id=$1) reversals",[payment,operation]);return {...row};}
try{
 await core.capacity(sql);
 const[identity]=await query('select current_database() database,current_user actor');assert.equal(identity.database,'postgres');
 const functions=plain(await query("select p.proname,pg_get_function_identity_arguments(p.oid) signature,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('post_payment','allocate_payment','reverse_payment')"));
 assert.equal(functions.length,3);for(const r of functions)assert.doesNotMatch(r.definition,/\b(net\.|http_|pg_net|pgmq|send_sms|send_zalo|issue_invoice)/i);
 report.preconditions={functions:functions.map(r=>({name:r.proname,signature:r.signature,sha256:createHash('sha256').update(r.definition).digest('hex')})),target:config.ref};
 const[{employee_count}]=await query('select count(*)::int employee_count from public.employees where active');
 report.metadata={status:'PASS_AWAITED_DATABASE_FACTORY_AND_ACTIVE_COLUMN',identity,employeeCount:employee_count,buckets:plain(await query('select id,public from storage.buckets order by id')),storageRuntime:'NOT_RUN_STORAGE_WRITE_AUTHORIZATION_REQUIRED'};
 const owner=await login('owner'),sales=await login('sales');
 const[p]=await query('select amount_vnd::text amount,customer_id,account_id,posted_at from public.payments where id=$1',[payment]);assert.equal(p.amount,'2500000');assert.equal(p.customer_id,f.customer);assert.equal(p.account_id,f.account);
 const debtRows=()=>query('select id,original_amount_vnd::text original,private.current_receivable_outstanding(id)::text outstanding from public.receivable_obligations where id in ($1,$2) order by id',f.debts);
 const before=plain(await debtRows());assert.equal(before.find(x=>x.id===f.debts[0]).outstanding,'0');assert.equal(before.find(x=>x.id===f.debts[1]).outstanding,'500000');
 assert.equal((await query('select private.payment_available($1)::text amount',[payment]))[0].amount,'0');
 report.before={payment,debts:f.debts,balances:before,paymentAvailable:'0',reusedPostedPayment:true};
 for(const[name,lines,message]of[
  ['EXISTING_TARGET_DUPLICATE',[{obligation_id:f.debts[1],amount_vnd:'1'}],/payment_receivable_allocation_unique/],
  ['DUPLICATE_TARGET_IN_PAYLOAD',[{obligation_id:f.debts[1],amount_vnd:'1'},{obligation_id:f.debts[1],amount_vnd:'1'}],/^duplicate_allocation_target$/]
 ]){
  const operation=randomUUID(),prior=await effects(operation);
  await rpc(owner,'allocate_payment',{target_payment_id:payment,allocation_lines:lines,operation_id:operation},{code:'23505',message});
  assert.deepEqual(await effects(operation),prior);
  report.checks.push({name,status:'PASS_HTTP_EXACT_ERROR_AND_ROLLBACK',partialEffects:0});
 }
 const snapshotArgs={target_branch_id:branch,target_side:'AR',as_of:new Date().toISOString(),knowledge_cutoff:new Date(new Date(p.posted_at).getTime()-1).toISOString(),target_customer_id:f.customer,target_site_id:null,target_sales_employee_id:null};
 const old=await rpc(owner,'finance_obligation_snapshot',snapshotArgs),now=await rpc(owner,'finance_obligation_snapshot',{...snapshotArgs,knowledge_cutoff:new Date().toISOString()});
 for(const id of f.debts){assert.equal(String(old.find(x=>x.obligation_id===id).outstanding_amount_vnd),id===f.debts[0]?'2000000':'1000000');assert.equal(String(now.find(x=>x.obligation_id===id).outstanding_amount_vnd),id===f.debts[0]?'0':'500000');}
 report.history={beforePayment:old,currentBeforeReversal:now,expectedBefore:['2000000','1000000'],expectedCurrent:['0','500000']};
 report.checks.push({name:'AR_AS_OF_KNOWLEDGE_CUTOFF',status:'PASS_HTTP_INDEPENDENT_AMOUNTS'});
 const reversalArgs={target_payment_id:payment,reversal_reason:fixture.runId+' QA inverse payment acceptance',operation_id:randomUUID()};
 const reversal=await rpc(owner,'reverse_payment',reversalArgs);report.managedChanges='QA_FIXTURES_ONLY';assert.equal(await rpc(owner,'reverse_payment',reversalArgs),reversal);
 const inverse=plain(await query('select a.amount_delta_vnd::text amount,a.reversal_of_allocation_id,o.amount_delta_vnd::text original from public.payment_allocations a join public.payment_allocations o on o.id=a.reversal_of_allocation_id where a.payment_id=$1',[reversal]));assert.equal(inverse.length,2);for(const r of inverse)assert.equal(BigInt(r.amount)+BigInt(r.original),0n);
 assert.equal((await query('select sum(amount_delta_vnd)::text amount from public.payment_allocations where payment_id in ($1,$2)',[payment,reversal]))[0].amount,'0');
 const restored=plain(await debtRows());assert.equal(restored.find(x=>x.id===f.debts[0]).outstanding,'2000000');assert.equal(restored.find(x=>x.id===f.debts[1]).outstanding,'1000000');
 const[original]=await query('select amount_vnd::text amount,reversal_of_payment_id from public.payments where id=$1',[payment]);assert.equal(original.amount,'2500000');assert.equal(original.reversal_of_payment_id,null);assert.equal((await query('select count(*)::int n from public.payments where reversal_of_payment_id=$1',[payment]))[0].n,1);
 report.reversal={id:reversal,originalPreserved:true,inverse,net:'0',restored};
 report.checks.push({name:'REVERSAL_APPEND_ONLY_INVERSE_RETRY',status:'PASS_HTTP_DB'});
 const post={target_branch_id:branch,direction:'RECEIPT',target_customer_id:f.customer,target_supplier_id:null,target_account_id:f.account,amount_vnd:'1000',effective_at:new Date().toISOString(),method:'CASH',external_reference:fixture.runId+' acceptance advance',allocation_lines:[],advance_amount_vnd:'1000',operation_id:randomUUID(),target_employee_id:null};
 await rpc(sales,'post_payment',post,{code:'42501',message:/forbidden/});
 const advance=await rpc(owner,'post_payment',post);assert.equal(await rpc(owner,'post_payment',post),advance);
 assert.equal((await query('select sum(amount_delta_vnd)::text amount from public.advances where payment_id=$1',[advance]))[0].amount,'1000');assert.equal((await query('select count(*)::int n from public.payment_allocations where payment_id=$1',[advance]))[0].n,0);
 const advanceArgs={target_payment_id:advance,reversal_reason:fixture.runId+' QA reverse advance',operation_id:randomUUID()};
 const reverseAdvance=await rpc(owner,'reverse_payment',advanceArgs);assert.equal(await rpc(owner,'reverse_payment',advanceArgs),reverseAdvance);
 assert.equal((await query('select sum(amount_delta_vnd)::text amount from public.advances where payment_id in ($1,$2)',[advance,reverseAdvance]))[0].amount,'0');
 assert.equal((await query("select sum(case when direction='RECEIPT' then amount_vnd else -amount_vnd end)::text net from public.payments where id in ($1,$2,$3,$4)",[payment,reversal,advance,reverseAdvance]))[0].net,'0');
 report.advance={id:advance,reversal:reverseAdvance,posted:'1000',net:'0',allocationCount:0};
 report.checks.push({name:'ADVANCE_SOURCE_RETRY_REVERSAL_SALES_DENY',status:'PASS_HTTP_DB'});
 const dashboard=await rpc(owner,'finance_dashboard_snapshot',{target_branch_id:branch,from_inclusive:'2020-01-01T00:00:00Z',to_exclusive:new Date(Date.now()+86400000).toISOString(),knowledge_cutoff:new Date().toISOString(),target_customer_id:f.customer,target_site_id:null,target_sales_employee_id:null,target_activity_kind:null});
 assert.equal(String(dashboard.revenue.value_vnd),'0');assert.equal(String(dashboard.direct_cost.value_vnd),'0');assert.equal(String(dashboard.receivable.value_vnd),'3000000');assert.equal(dashboard.operating_expense.quality,'NOT_APPLICABLE');
 report.dashboard={actual:dashboard,expected:{revenue:'0',directCost:'0',receivable:'3000000',customerOpex:'NOT_APPLICABLE'}};
 report.checks.push({name:'PAYMENT_NOT_REVENUE_RESTORED_DEBT_CASH_NET',status:'PASS_HTTP_DB'});
 report.fixtureManifest={runId:fixture.runId,records:[{id:payment,action:'REUSED_NOT_REPOSTED'},{id:reversal,source:payment},{id:advance},{id:reverseAdvance,source:advance}],actor:fixture.actors.find(x=>x.role==='owner').actorId};
 report.status='PASS_TARGETED_HTTP_DB_NOT_DAILY_FINANCE_OR_UI';
}catch(e){report.status='FAIL';report.error={code:e.code??null,message:e.message};process.exitCode=1;}finally{for(const client of clients)await client.auth.signOut();await sql.end({timeout:3});await save();console.log(JSON.stringify({status:report.status,checks:report.checks,managedChanges:report.managedChanges,error:report.error,artifact:out+'/finance-http-resume-evidence.json'}));}
