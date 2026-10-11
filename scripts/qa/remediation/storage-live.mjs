import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { writeFileSync, renameSync } from 'node:fs';
import { parseArgs, parseEnv } from 'node:util';
import { chromium } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { clients, database, guard, id, preflight, email } from '../core.mjs';

const {values:args}=parseArgs({options:{env:{type:'string'},out:{type:'string'},resume:{type:'boolean',default:false}}});
assert.ok(args.env&&args.out);Object.assign(process.env,parseEnv(await readFile(args.env,'utf8')));
process.env.HX_QA_APP_URL='http://127.0.0.1:3110';assert.equal(guard().ref,'ffrwiglcrlumfvhubaxg');await preflight();
const sql=await database(),{admin,login}=await clients();
const report=args.resume?JSON.parse(await readFile(args.out,'utf8')):{scope:'REAL_STORAGE_FULL_PR42_SOURCE171',projectRef:guard().ref,checks:[],sources:{},intents:{},productionAccess:'NONE',tokensRecorded:false};
const browser=await chromium.launch({headless:true}),sessions={};
const faultFile='/private/tmp/hx-pr41-native.3mqs6I/storage-transport-fault.json';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const uuid=seed=>{const x=sha(seed).slice(0,32).split('');x[12]='4';x[16]=((parseInt(x[16],16)&3)|8).toString(16);const s=x.join('');return [s.slice(0,8),s.slice(8,12),s.slice(12,16),s.slice(16,20),s.slice(20)].join('-');};
const save=()=>writeFile(args.out,JSON.stringify(report,null,2),{mode:0o600});
const intent=name=>{
  if(report.intents[name])return report.intents[name];
  report.intents[name]=randomUUID();
  writeFileSync(args.out+'.tmp',JSON.stringify(report,null,2),{mode:0o600});renameSync(args.out+'.tmp',args.out);
  return report.intents[name];
};
const done=name=>report.checks.some(c=>c.name===name&&c.status==='PASS');
async function passed(name,facts={}){report.checks.push({name,status:'PASS',...facts});await save();console.log(JSON.stringify({check:name,status:'PASS'}));}
async function rpc(client,name,data){const r=await client.rpc(name,data);assert.equal(r.error,null,'RPC '+name+' failed');return r.data;}
async function session(role){
  if(sessions[role])return sessions[role];
  const context=await browser.newContext({baseURL:process.env.HX_QA_APP_URL,viewport:{width:1280,height:900}});
  await context.addCookies([{name:'hx_branch_id',value:id('branch-A'),url:process.env.HX_QA_APP_URL}]);
  const page=await context.newPage();
  await page.goto(['finance','receiver','other_customer'].includes(role)?'/customer/login':role==='worker'?'/work/login':'/login');
  await page.locator('input[name=email]').fill(email(role));await page.locator('input[name=password]').fill(process.env.HX_QA_PASSWORD);
  await page.locator('button[type=submit]').click();await page.waitForURL(u=>!u.pathname.endsWith('/login'),{timeout:30000});
  const client=await login(role);const {data:{user}}=await client.auth.getUser();assert.ok(user);
  return sessions[role]={context,page,client,user};
}
async function upload(role,file,operationId,context='PAYMENT_NOTICE',workItemId){
  const s=await session(role);return s.context.request.post('/api/portal/evidence/upload',{multipart:{
    file,operationId,context,...(workItemId?{workItemId}:{customerId:id('customer-0')})}});
}
async function evidenceFacts(eid){return(await sql`select e.id,e.object_state,e.checksum_sha256,e.final_byte_size::text,
  (select count(*)::int from storage.objects o where o.bucket_id=e.bucket_id and o.name=e.object_path) objects,
  (select count(*)::int from private.evidence_storage_attestations a where a.namespace='PORTAL' and a.evidence_id=e.id) attestations,
  (select count(*)::int from private.evidence_storage_bindings b where b.namespace='PORTAL' and b.evidence_id=e.id) bindings,
  (select count(*)::int from public.audit_events a where a.entity_id=e.id and a.action='evidence.storage_verified') audits
  from public.portal_evidence_objects e where e.id=${eid}`)[0];}
try{
  const schema=(await sql`select count(*)::int n from supabase_migrations.schema_migrations`)[0];assert.equal(schema.n,172);report.schema={canonicalMigrations:171,historyEntries:172,preservedExtra:'20261002114730'};
  const finance=await session('finance'),owner=await session('owner');
  const pdf=await PDFDocument.create();pdf.addPage();const file={name:'pr42-qa.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save({useObjectStreams:false}))};
  // PDF output has a creation timestamp. Freeze the selected bytes for resumes.
  const frozen=args.out+'.selected-file';
  if(args.resume)file.buffer=await readFile(frozen);else await writeFile(frozen,file.buffer,{mode:0o600});
  if(!done('T39-S1_NOTICE_REAL_BYTES_SOURCE_DOWNLOAD_SCOPES')){
    await save();const response=await upload('finance',file,intent('notice-upload'));assert.equal(response.status(),200);
    const eid=(await response.json()).evidenceId;report.sources.noticeEvidence=eid;await save();
    const before=(await sql`select md5(coalesce(jsonb_agg(to_jsonb(p) order by p.id)::text,'')) payments from public.payments p`)[0];
    const noticeResponse=await finance.context.request.post('/api/portal/payment-notices',{data:{customerId:id('customer-0'),evidenceId:eid,amountVnd:1000,paidOn:'2026-10-12',reference:'PR42-QA-STORAGE',note:'Minh chứng QA, không phải tiền thực',operationId:intent('notice-submit')}});
    assert.equal(noticeResponse.status(),200);report.sources.notice=(await noticeResponse.json()).noticeId;await save();
    assert.equal((await finance.context.request.get('/api/evidence/'+eid+'/download')).status(),200);
    const actual=await finance.context.request.get('/api/evidence/'+eid+'/download');assert.equal(sha(await actual.body()),sha(file.buffer));
    for(const role of ['receiver','other_customer','worker'])assert.equal((await(await session(role)).context.request.get('/api/evidence/'+eid+'/download')).status(),404);
    const metadata=(await sql`select bucket_id,object_path from public.portal_evidence_objects where id=${eid}`)[0];
    // Portal files intentionally stream through the authorization-gated app API;
    // the existing restrictive policy blocks direct SDK reads and bearer URLs.
    const own=await finance.client.storage.from(metadata.bucket_id).download(metadata.object_path);assert.ok(own.error);
    const outsider=await session('other_customer');assert.ok((await outsider.client.storage.from(metadata.bucket_id).download(metadata.object_path)).error);
    assert.ok((await outsider.client.storage.from(metadata.bucket_id).createSignedUrl(metadata.object_path,60)).error);
    assert.ok((await finance.client.storage.from(metadata.bucket_id).upload(metadata.object_path,file.buffer,{contentType:file.mimeType,upsert:true})).error,'Authenticated replacement must be denied');
    const removed=await finance.client.storage.from(metadata.bucket_id).remove([metadata.object_path]);
    assert.ok(removed.error||removed.data?.length===0,'Authenticated delete must have no effect');
    assert.equal((await upload('finance',file,intent('notice-upload'))).status(),200);
    const facts=await evidenceFacts(eid);assert.deepEqual([facts.object_state,facts.objects,facts.attestations,facts.bindings,facts.audits],['READY',1,1,1,1]);
    const after=(await sql`select md5(coalesce(jsonb_agg(to_jsonb(p) order by p.id)::text,'')) payments from public.payments p`)[0];assert.deepEqual(after,before);
    const [source]=await sql`select evidence_id from public.payment_notices where id=${report.sources.notice}`;assert.equal(source.evidence_id,eid);
    await passed('T39-S1_NOTICE_REAL_BYTES_SOURCE_DOWNLOAD_SCOPES',{facts,notice:report.sources.notice,cashUnchanged:true,directPortalStorageReads:'Intentionally denied; authorized app stream passed'});
  }
  for(const kind of ['upload','download','finalize-response']){
    const name='T39-S4_'+kind.toUpperCase();if(done(name))continue;
    const operation=intent('fault-'+kind),checksum=sha(file.buffer);
    await save();const created=await rpc(finance.client,'create_portal_evidence',{target_context_type:'PAYMENT_NOTICE',target_work_item_id:null,target_customer_id:id('customer-0'),target_mime_type:file.mimeType,target_byte_size:file.buffer.length,operation_id:uuid(operation+':'+checksum+':evidence:create')});
    report.sources['fault-'+kind]=created.id;await save();
    await writeFile(faultFile,JSON.stringify({kind,objectPath:created.object_path,evidenceId:created.id,fired:false}),{mode:0o600});
    const failed=await upload('finance',file,operation);assert.equal(failed.status(),400);
    assert.equal(JSON.parse(await readFile(faultFile,'utf8')).fired,true,'Owned QA transport fault must actually fire');
    const interrupted=await evidenceFacts(created.id);
    assert.equal(interrupted.object_state,kind==='finalize-response'?'READY':'PENDING');
    assert.equal(interrupted.objects,kind==='upload'?0:1);assert.equal(interrupted.audits,kind==='finalize-response'?1:0);
    await unlink(faultFile);const resumed=await upload('finance',file,operation);assert.equal(resumed.status(),200);assert.equal((await resumed.json()).evidenceId,created.id);
    const recovered=await evidenceFacts(created.id);assert.deepEqual([recovered.objects,recovered.attestations,recovered.bindings,recovered.audits],[1,1,1,1]);
    await passed(name,{interrupted,recovered,transport:'Real QA backend with one deliberate request/response interruption'});
  }
  if(!done('T39-S1_WORK_RESULT_ATTACHED_REAL_FILE')){
    const worker=await session('worker'),work='38d8cec5-1f3a-41c9-a6a9-9eb66a35e144';
    const response=await upload('worker',file,intent('work-upload'),'WORK_RESULT',work);assert.equal(response.status(),200);const eid=(await response.json()).evidenceId;report.sources.workEvidence=eid;await save();
    assert.equal((await finance.context.request.get('/api/evidence/'+eid+'/download')).status(),404);
    assert.equal((await worker.context.request.get('/api/evidence/'+eid+'/download')).status(),200);
    const result=await worker.context.request.post('/api/portal/work-results',{data:{workItemId:work,actualQuantity:'1',receiverName:'Người nhận QA',note:'Kiểm chứng Storage PR42',evidenceId:eid,expectedVersion:1,operationId:intent('work-result')}});
    assert.equal(result.status(),200);report.sources.workResult=(await result.json()).resultId;await save();
    const [link]=await sql`select evidence_id from public.work_result_portal_evidence where work_result_id=${report.sources.workResult}`;assert.equal(link.evidence_id,eid);
    await passed('T39-S1_WORK_RESULT_ATTACHED_REAL_FILE',{work,result:report.sources.workResult,evidence:eid});
  }
  if(!report.sources.po){
    const [line]=await sql`select p.supplier_id,p.warehouse_id,l.material_id,l.ordered_uom_id,l.conversion_numerator::text,l.conversion_denominator::text,l.rounding_mode,l.unit_cost_vnd::text
      from public.purchase_orders p join public.purchase_order_lines l on l.purchase_order_id=p.id where p.destination_type='WAREHOUSE' and p.branch_id=${id('branch-A')} order by p.id limit 1`;
    assert.ok(line);await save();report.sources.po=await rpc(owner.client,'create_purchase_order_draft',{target_branch_id:id('branch-A'),target_supplier_id:line.supplier_id,target_warehouse_id:line.warehouse_id,expected_at:null,commercial_terms:'PR42 QA Storage',
      purchase_lines:[{material_id:line.material_id,ordered_uom_id:line.ordered_uom_id,quantity:'2',conversion_numerator:line.conversion_numerator,conversion_denominator:line.conversion_denominator,rounding_mode:line.rounding_mode,unit_cost_vnd:line.unit_cost_vnd,price_source_type:'MANUAL_APPROVED',override_reason:'PR42 QA kiểm chứng minh chứng'}],operation_id:intent('po-create')});await save();
    await rpc(owner.client,'confirm_purchase_order',{target_purchase_order_id:report.sources.po,operation_id:intent('po-confirm')});await save();
  }
  if(!done('T39-S2_S4_INTERNAL_UPLOAD_RELOAD_SOURCE_RECEIPT')){
    const page=owner.page;await page.goto('/admin/purchase-orders/'+report.sources.po);
    await page.waitForLoadState('networkidle');
    const fileInput=page.getByLabel(/Minh chứng nhận hàng/);await fileInput.waitFor();let loss=false;
    await page.route('**/api/purchasing/evidence/upload',async route=>{
      if(route.request().method()!=='PATCH'||loss)return route.continue();
      const response=await route.fetch();if(response.status()===200){loss=true;await route.abort('failed');}else await route.fulfill({response});
    });
    await fileInput.setInputFiles(file);const uploadAlert=page.getByRole('alert').filter({hasText:/\S/});await uploadAlert.waitFor();
    report.lastInternalUploadError=await uploadAlert.innerText();await save();assert.ok(loss,report.lastInternalUploadError);
    const [old]=await sql`select id,object_path from public.evidence_objects where object_path like ${id('branch-A')+'/purchase-orders/'+report.sources.po+'/%'} order by created_at limit 1`;
    assert.ok(old);report.sources.internalEvidence=old.id;await save();
    await page.unroute('**/api/purchasing/evidence/upload');await page.reload();await page.waitForLoadState('networkidle');await page.getByLabel(/Minh chứng nhận hàng/).setInputFiles(file);
    await page.getByText('Đã tải minh chứng; sẽ gắn khi xác nhận nghiệp vụ.',{exact:true}).waitFor();
    assert.equal(await page.locator('input[name=evidenceId]').inputValue(),old.id);
    const [line]=await sql`select id from public.purchase_order_lines where purchase_order_id=${report.sources.po} order by line_number limit 1`;
    await page.locator('#receivedQuantity-'+line.id).fill('1');await page.getByRole('button',{name:'Xác nhận nhận hàng',exact:true}).click();
    await page.getByText(/Đã ghi nhận hàng nhập/).first().waitFor();
    const rows=await sql`select id,evidence_object_id from public.purchase_receipts where purchase_order_id=${report.sources.po}`;assert.equal(rows.length,1);assert.equal(rows[0].evidence_object_id,old.id);
    const count=(await sql`select count(*)::int n from public.evidence_objects where object_path like ${id('branch-A')+'/purchase-orders/'+report.sources.po+'/%'}`)[0];assert.equal(count.n,1);
    const actual=await owner.client.storage.from('inventory-evidence').download(old.object_path);assert.equal(actual.error,null);assert.equal(sha(Buffer.from(await actual.data.arrayBuffer())),sha(file.buffer));
    const [bind]=await sql`select count(*)::int n from private.evidence_storage_bindings where namespace='INTERNAL' and evidence_id=${old.id}`;assert.equal(bind.n,1);
    await passed('T39-S2_S4_INTERNAL_UPLOAD_RELOAD_SOURCE_RECEIPT',{evidence:old.id,receipt:rows[0].id,evidenceCount:count.n,bindings:bind.n,lossAfterActualCommit:true});
  }
  if(!done('T39-S3_ADMIN_REPLACEMENT_INVALIDATES_PROOF_WITHOUT_UNPOSTING')){
    const eid=report.sources.noticeEvidence,[meta]=await sql`select bucket_id,object_path,checksum_sha256 from public.portal_evidence_objects where id=${eid}`;
    const [noticeBefore]=await sql`select md5(to_jsonb(n)::text) hash from public.payment_notices n where id=${report.sources.notice}`;
    const changed=Buffer.from(file.buffer);changed[changed.length-2]^=1;
    const mutation=await admin.storage.from(meta.bucket_id).upload(meta.object_path,changed,{contentType:file.mimeType,upsert:true});assert.equal(mutation.error,null);
    assert.equal((await finance.context.request.get('/api/evidence/'+eid+'/download')).status(),404);
    const [current]=await sql`select private.evidence_storage_binding_current('PORTAL',${eid}::uuid,${meta.bucket_id},${meta.object_path}) valid,(select checksum_sha256 from public.portal_evidence_objects where id=${eid}) old_sha`;
    assert.equal(current.valid,false);assert.equal(current.old_sha,meta.checksum_sha256);
    const [noticeAfter]=await sql`select md5(to_jsonb(n)::text) hash from public.payment_notices n where id=${report.sources.notice}`;assert.deepEqual(noticeAfter,noticeBefore);
    await passed('T39-S3_ADMIN_REPLACEMENT_INVALIDATES_PROOF_WITHOUT_UNPOSTING',{evidence:eid,affectedNotice:report.sources.notice,proofValid:false,documentUnchanged:true,newEvidenceRequired:true});
  }
  report.status='PASS_SCOPED_REAL_STORAGE';delete report.failure;await save();
}catch(error){report.status='FAIL';report.failure=error instanceof assert.AssertionError?error.message:'Storage QA stopped; inspect diagnostics privately';await save();process.exitCode=1;console.error(JSON.stringify({status:report.status,failure:report.failure}));}
finally{try{await unlink(faultFile);}catch{}await browser.close();await sql.end({timeout:3});}
