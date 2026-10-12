import assert from'node:assert/strict';import{randomUUID}from'node:crypto';import{readFile,writeFile}from'node:fs/promises';import{parseArgs,parseEnv}from'node:util';import{chromium}from'@playwright/test';
import{clients,database,guard,id,email}from'../core.mjs';import{digest}from'./evidence-reverification.mjs';
const{values:args}=parseArgs({options:{env:{type:'string'},live:{type:'string'},out:{type:'string'}}});Object.assign(process.env,parseEnv(await readFile(args.env,'utf8')));assert.equal(guard().ref,'ffrwiglcrlumfvhubaxg');
const live=JSON.parse(await readFile(args.live,'utf8')),bytes=await readFile(args.live+'.selected-file'),sql=await database(),{login}=await clients(),owner=await login('owner');
const actor=(await owner.auth.getUser()).data.user;assert.ok(actor);const browser=await chromium.launch({headless:true}),context=await browser.newContext({baseURL:'http://127.0.0.1:3110'}),page=await context.newPage();
const report={scope:'G15_G21_FIRST_INTERNAL_FINALIZATION_ATOMIC_AND_AUDITED',productionAccess:'NONE',createOperationId:randomUUID(),finalizeOperationId:randomUUID(),receiveOperationId:randomUUID()};await writeFile(args.out,JSON.stringify(report,null,2),{mode:0o600});
try{
 await context.addCookies([{name:'hx_branch_id',value:id('branch-A'),url:'http://127.0.0.1:3110'}]);await page.goto('/login');await page.locator('input[name=email]').fill(email('owner'));await page.locator('input[name=password]').fill(process.env.HX_QA_PASSWORD);await page.locator('button[type=submit]').click();await page.waitForURL(u=>!u.pathname.endsWith('/login'));
 const prepared=await context.request.post('/api/purchasing/evidence/upload',{data:{purchaseOrderId:live.sources.po,createOperationId:report.createOperationId,fileName:'first-call.pdf',byteSize:bytes.length}});assert.equal(prepared.status(),200);const proof=await prepared.json();report.evidence=proof.evidenceId;await writeFile(args.out,JSON.stringify(report,null,2),{mode:0o600});
 assert.equal((await owner.storage.from('inventory-evidence').uploadToSignedUrl(proof.objectPath,proof.token,bytes,{contentType:'application/pdf'})).error,null);
 const actual=await owner.storage.from('inventory-evidence').download(proof.objectPath);assert.equal(actual.error,null);assert.equal(digest(Buffer.from(await actual.data.arrayBuffer())),digest(bytes));
 const input={actor_uuid:actor.id,target_evidence_id:proof.evidenceId,checksum_sha256:digest(bytes),byte_size:bytes.length,operation_id:report.finalizeOperationId};
 const rollback=Error('INTENTIONAL_QA_ROLLBACK');
 try{await sql.begin(async tx=>{await tx.unsafe('set local role service_role');await tx`select public.finalize_evidence_upload_verified(${actor.id}::uuid,${proof.evidenceId}::uuid,${input.checksum_sha256}::text,${bytes.length}::bigint,${report.finalizeOperationId}::uuid)`;throw rollback;});}catch(error){if(error!==rollback)throw error;}
 const [rolled]=await sql`select (select upload_state from public.evidence_objects where id=${proof.evidenceId}) state,
 (select count(*)::int from private.evidence_storage_attestations where namespace='INTERNAL' and evidence_id=${proof.evidenceId}) attestation,
 (select count(*)::int from private.evidence_storage_bindings where namespace='INTERNAL' and evidence_id=${proof.evidenceId}) binding,
 (select count(*)::int from public.audit_events where trace_id=${report.finalizeOperationId}) audit,
 (select count(*)::int from public.command_receipts where operation_id=${report.finalizeOperationId}) receipt`;
 assert.deepEqual(rolled,{state:'PENDING',attestation:0,binding:0,audit:0,receipt:0});
 const body={purchaseOrderId:live.sources.po,createOperationId:report.createOperationId,evidenceId:proof.evidenceId,finalizeOperationId:report.finalizeOperationId,byteSize:bytes.length,checksumSha256:digest(bytes)};
 assert.equal((await context.request.patch('/api/purchasing/evidence/upload',{data:body})).status(),200);
 const status=await owner.rpc('evidence_verified_storage_status',{target_evidence_id:proof.evidenceId});assert.equal(status.error,null);assert.equal(status.data,true,'First successful call must already be usable, without a retry');
 const [first]=await sql`select (select count(*)::int from private.evidence_storage_attestations where namespace='INTERNAL' and evidence_id=${proof.evidenceId}) attestation,
 (select count(*)::int from private.evidence_storage_bindings where namespace='INTERNAL' and evidence_id=${proof.evidenceId}) binding,
 (select count(*)::int from public.audit_events where trace_id=${report.finalizeOperationId}) audit,
 (select verified_by::text from private.evidence_storage_attestations where namespace='INTERNAL' and evidence_id=${proof.evidenceId}) actor`;
 assert.deepEqual(first,{attestation:1,binding:1,audit:1,actor:actor.id});
 assert.equal((await context.request.patch('/api/purchasing/evidence/upload',{data:body})).status(),200);
 const [audit]=await sql`select count(*)::int n from public.audit_events where trace_id=${report.finalizeOperationId}`;assert.equal(audit.n,1);
 const [line]=await sql`select id from public.purchase_order_lines where purchase_order_id=${live.sources.po} limit 1`,[clock]=await sql`select (clock_timestamp()-interval '1 second')::text instant`;
 const payload={target_purchase_order_id:live.sources.po,receipt_lines:[{purchase_order_line_id:line.id,received_quantity:'1'}],target_evidence_id:proof.evidenceId,received_at:clock.instant,operation_id:report.receiveOperationId};
 const result=await owner.rpc('receive_purchase_order',payload);assert.equal(result.error,null);assert.equal((await owner.rpc('receive_purchase_order',payload)).data,result.data);
 const [source]=await sql`select evidence_object_id from public.purchase_receipts where id=${result.data}`;assert.equal(source.evidence_object_id,proof.evidenceId);
 Object.assign(report,{status:'PASS',rolledBack:rolled,firstSuccessfulCall:first,retryAuditCount:1,sourceReceipt:result.data});await writeFile(args.out,JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify({status:report.status,firstSuccessfulCallVerified:true,audit:1,rollback:true}));
}finally{await browser.close();await sql.end({timeout:3});}
