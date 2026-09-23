import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { browserSession } from './browser.mjs';
import { artifact, database, id, guard } from './core.mjs';
guard();
const skipExpiry = process.env.HX_QA_SKIP_EXPIRY === '1';
const writeReport = async (report) => {
  if (process.env.HX_QA_NO_ARTIFACT === '1') console.log(JSON.stringify(report));
  else await artifact('storage', report);
};
const sessions = [];
const results = [];
const sql = await database();
try {
  const finance = await browserSession('finance'); sessions.push(finance);
  const receiver = await browserSession('receiver'); sessions.push(receiver);
  const other = await browserSession('other_customer'); sessions.push(other);
  const worker = await browserSession('worker'); sessions.push(worker);
  const png = await finance.page.screenshot({ type: 'png' });
  const jpeg = await finance.page.screenshot({ type: 'jpeg' });
  const pdf = await PDFDocument.create(); pdf.addPage();
  const files = [{ name:'qa.png',mimeType:'image/png',buffer:png }, { name:'qa.jpg',mimeType:'image/jpeg',buffer:jpeg }, { name:'qa.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save()) }];
  const upload = (session,file,operationId,context='PAYMENT_NOTICE') => session.context.request.post('/api/portal/evidence/upload', { multipart: { file, operationId, context, ...(context === 'WORK_RESULT' ? { workItemId:'f163280e-fd20-7368-4e24-1aad4a79a169' } : { customerId:id('customer-0') }) } });
  for (const file of files) {
    const operation = randomUUID();
    const first = await upload(finance,file,operation);
    assert.equal(first.status(),200, `upload ${file.name}`);
    const { evidenceId } = await first.json();
    const retry = await upload(finance,file,operation);
    assert.equal(retry.status(),200);
    assert.equal((await retry.json()).evidenceId,evidenceId);
    const [metadata] = await sql`select bucket_id,object_path from public.portal_evidence_objects where id=${evidenceId}`;
    const [objects] = await sql`select count(*)::int as n from storage.objects where bucket_id=${metadata.bucket_id} and name=${metadata.object_path}`;
    assert.equal(objects.n,1);
    for (const session of [receiver,other]) assert.equal((await session.context.request.get(`/api/evidence/${evidenceId}/signed`, { maxRedirects:0 })).status(),403);
    const signed = await finance.context.request.get(`/api/evidence/${evidenceId}/signed`, { maxRedirects:0 });
    assert.equal(signed.status(),307);
    assert.equal(signed.headers()['cache-control'],'private, no-store');
    const location = signed.headers().location;
    assert.equal((await fetch(location)).status,200);
    const direct = new URL(location); direct.pathname = `/storage/v1/object/public/${metadata.bucket_id}/${metadata.object_path}`; direct.search='';
    assert.ok(!(await fetch(direct)).ok);
    // Preserve URL only in memory; signed tokens must never enter artifacts.
    if (file === files[0]) {
      await sql`update public.customer_portal_memberships set active=false,revoked_at=now() where id=${id('membership-finance')}`;
      try { assert.equal((await finance.context.request.get(`/api/evidence/${evidenceId}/signed`, { maxRedirects:0 })).status(),403); }
      finally { await sql`update public.customer_portal_memberships set active=true,revoked_at=null where id=${id('membership-finance')}`; }
      if (!skipExpiry) {
        console.log('Checking signed URL expiry; waiting in two bounded intervals.');
        await new Promise(resolve => setTimeout(resolve,35000));
        await new Promise(resolve => setTimeout(resolve,35000));
        assert.ok(!(await fetch(location)).ok,'signed URL must expire');
      }
    }
    results.push({ name:file.name,status:'PASS', evidenceId });
  }
  for (const file of [
    { name:'qa.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg></svg>') },
    { name:'fake.jpg',mimeType:'image/jpeg',buffer:Buffer.from('not an image') },
    { name:'large.png',mimeType:'image/png',buffer:Buffer.concat([png,Buffer.alloc(10*1024*1024)]) },
  ]) { assert.equal((await upload(finance,file,randomUUID())).status(),400); results.push({ name:file.name,status:'REJECTED_AS_EXPECTED' }); }
  const workerUpload = await upload(worker,files[0],randomUUID(),'WORK_RESULT');
  assert.equal(workerUpload.status(),200);
  const { evidenceId: workerEvidenceId } = await workerUpload.json();
  assert.equal((await worker.context.request.get(`/api/evidence/${workerEvidenceId}/signed`, { maxRedirects:0 })).status(),307);
  assert.equal((await finance.context.request.get(`/api/evidence/${workerEvidenceId}/signed`, { maxRedirects:0 })).status(),403);
  results.push({ name:'worker-evidence',status:'PASS',evidenceId:workerEvidenceId });
  await writeReport({ status:skipExpiry ? 'PARTIAL' : 'PASS',results,signedUrlExpiry:skipExpiry ? 'NOT_RUN' : 'PASS',humanOfflineRetry:'NOT_RUN' });
} catch (error) {
  await writeReport({ status:'FAIL',results,error:error.message.replace(/https?:\/\/\S+/g,'[URL]') });
  process.exitCode=1;
} finally {
  await Promise.all(sessions.map(session => session.browser.close()));
  await sql.end();
}
