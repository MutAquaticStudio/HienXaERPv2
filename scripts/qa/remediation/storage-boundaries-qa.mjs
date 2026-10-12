import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile,writeFile } from 'node:fs/promises';
import {parseArgs,parseEnv}from'node:util';
import{chromium}from'@playwright/test';
import{clients,database,guard,id,email}from'../core.mjs';
import{digest}from'./evidence-reverification.mjs';
const{values:args}=parseArgs({options:{env:{type:'string'},live:{type:'string'},out:{type:'string'}}});
Object.assign(process.env,parseEnv(await readFile(args.env,'utf8')));assert.equal(guard().ref,'ffrwiglcrlumfvhubaxg');
const live=JSON.parse(await readFile(args.live,'utf8')),sql=await database(),{login}=await clients(),ownerClient=await login('owner');
const browser=await chromium.launch({headless:true}),base='http://127.0.0.1:3110',contexts=[];
const report={scope:'T39_REAL_FORMATS_PENDING_SOURCE_AND_BRANCH_BOUNDARIES',productionAccess:'NONE',checks:[]};
async function browserUser(role){const context=await browser.newContext({baseURL:base});contexts.push(context);await context.addCookies([{name:'hx_branch_id',value:id('branch-A'),url:base}]);const page=await context.newPage();await page.goto(role==='owner'?'/login':'/customer/login');await page.locator('input[name=email]').fill(email(role));await page.locator('input[name=password]').fill(process.env.HX_QA_PASSWORD);await page.locator('button[type=submit]').click();await page.waitForURL(u=>!u.pathname.endsWith('/login'));return{context,page};}
try{
  const owner=await browserUser('owner'),other=await browserUser('other_customer');
  const blank=await browser.newPage();await blank.goto('about:blank');
  for(const type of ['png','jpeg']){
    const bytes=await blank.screenshot({type}),file={name:'qa.'+(type==='jpeg'?'jpg':type),mimeType:'image/'+type,buffer:bytes};
    const response=await other.context.request.post('/api/portal/evidence/upload',{multipart:{file,operationId:randomUUID(),context:'PAYMENT_NOTICE',customerId:id('customer-1')}});assert.equal(response.status(),200);
    const eid=(await response.json()).evidenceId,download=await other.context.request.get('/api/evidence/'+eid+'/download');assert.equal(download.status(),200);assert.equal(digest(await download.body()),digest(bytes));
    assert.equal((await(await login('finance')).rpc('get_portal_evidence_for_signing',{target_evidence_id:eid})).error?.code,'42501');
    report.checks.push({name:'ACTUAL_'+type.toUpperCase()+'_RIGHT_CUSTOMER_B_OTHER_CUSTOMER_A_DENIED',status:'PASS',evidence:eid});
  }
  const [otherPO]=await sql`select id from public.purchase_orders where branch_id=${id('branch-B')} and state='CONFIRMED' limit 1`;assert.ok(otherPO);
  assert.equal((await owner.context.request.post('/api/purchasing/evidence/upload',{data:{purchaseOrderId:otherPO.id,createOperationId:randomUUID(),fileName:'qa.png',byteSize:8}})).status(),404);
  const [old]=await sql`select object_path,byte_size::int,checksum_sha256 from public.evidence_objects where id=${live.sources.internalEvidence}`;
  const createOperationId=old.object_path.split('/').at(-1).split('.')[0];
  await owner.context.addCookies([{name:'hx_branch_id',value:id('branch-B'),url:base}]);
  const crossed=await owner.context.request.patch('/api/purchasing/evidence/upload',{data:{purchaseOrderId:live.sources.po,createOperationId,evidenceId:live.sources.internalEvidence,finalizeOperationId:randomUUID(),byteSize:old.byte_size,checksumSha256:old.checksum_sha256}});assert.equal(crossed.status(),404);
  await owner.context.addCookies([{name:'hx_branch_id',value:id('branch-A'),url:base}]);
  report.checks.push({name:'ACTIVE_BRANCH_A_PO_B_AND_BRANCH_B_PROOF_A_DENIED',status:'PASS'});
  const creation=randomUUID(),finalization=randomUUID();
  const prepared=await owner.context.request.post('/api/purchasing/evidence/upload',{data:{purchaseOrderId:live.sources.po,createOperationId:creation,fileName:'unfinished.png',byteSize:4}});assert.equal(prepared.status(),200);const proof=await prepared.json();
  const bytes=Buffer.from([137,80,78,71]),input={purchaseOrderId:live.sources.po,createOperationId:creation,evidenceId:proof.evidenceId,finalizeOperationId:finalization,byteSize:4,checksumSha256:digest(bytes)};
  assert.equal((await owner.context.request.patch('/api/purchasing/evidence/upload',{data:input})).status(),409);
  assert.equal((await ownerClient.rpc('finalize_evidence_upload_verified',{actor_uuid:(await ownerClient.auth.getUser()).data.user.id,target_evidence_id:proof.evidenceId,checksum_sha256:input.checksumSha256,byte_size:4,operation_id:finalization})).error?.code,'42501');
  const uploaded=await ownerClient.storage.from('inventory-evidence').uploadToSignedUrl(proof.objectPath,proof.token,bytes,{contentType:'image/png'});assert.equal(uploaded.error,null);
  assert.equal((await owner.context.request.patch('/api/purchasing/evidence/upload',{data:input})).status(),400);
  const [line]=await sql`select id from public.purchase_order_lines where purchase_order_id=${live.sources.po} limit 1`;
  const [clock]=await sql`select (clock_timestamp()-interval '1 second')::text instant`;
  const invalidSource=await ownerClient.rpc('receive_purchase_order',{target_purchase_order_id:live.sources.po,receipt_lines:[{purchase_order_line_id:line.id,received_quantity:'1'}],target_evidence_id:proof.evidenceId,received_at:clock.instant,operation_id:randomUUID()});assert.equal(invalidSource.error?.code,'23514');
  const [facts]=await sql`select (select upload_state from public.evidence_objects where id=${proof.evidenceId}) state,
    (select count(*)::int from private.evidence_storage_attestations where namespace='INTERNAL' and evidence_id=${proof.evidenceId}) attestations,
    (select count(*)::int from public.purchase_receipts where purchase_order_id=${live.sources.po}) receipts`;
  assert.deepEqual(facts,{state:'PENDING',attestations:0,receipts:1});
  report.checks.push({name:'MISSING_PARTIAL_BYTES_AND_CLIENT_FINALIZE_CANNOT_BECOME_PROOF_OR_RECEIPT',status:'PASS',evidence:proof.evidenceId,facts});
  report.status='PASS';await writeFile(args.out,JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify({status:report.status,checks:report.checks.length}));
}finally{await browser.close();await sql.end({timeout:3});}
