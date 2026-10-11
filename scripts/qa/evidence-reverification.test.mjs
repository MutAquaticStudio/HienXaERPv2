import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, appendFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { digest, inspectEvidence, scanEvidence } from './remediation/evidence-reverification.mjs';

const bytes = Buffer.from('%PDF-1.7\nQA representative document\n');
const item = { namespace: 'INTERNAL', id: 'one', bucket: 'inventory-evidence', path: 'qa/one.pdf',
  state: 'VERIFIED', byteSize: bytes.length, checksumSha256: digest(bytes), mimeType: 'application/pdf', sources: [{table:'purchase_receipts',id:'receipt-one'}] };
const download = async () => ({ data: new Blob([bytes]), error: null });
test('measures actual bytes and preserves affected source identifiers', async () => {
  const result = await inspectEvidence(item, download);
  assert.equal(result.classification,'MATCH'); assert.equal(result.eligibleForReverification,true);
  assert.equal(result.actual.checksumSha256,digest(bytes)); assert.deepEqual(result.sources,item.sources);
});
test('same-sized changed content cannot match client or legacy checksum', async () => {
  const changed = Buffer.from(bytes); changed[changed.length-2] ^= 1;
  assert.equal((await inspectEvidence(item, async()=>({data:new Blob([changed])}))).classification,'MISMATCH');
});
test('object without an old checksum stays inconclusive, never auto-verified', async () => {
  const result = await inspectEvidence({...item,checksumSha256:null},download);
  assert.equal(result.classification,'INCONCLUSIVE'); assert.equal(result.reason,'NO_RECORDED_CHECKSUM_OR_SIZE');
  assert.equal(result.eligibleForReverification,false);
});
test('only authoritative absence establishes missing, not masked permission 404', async () => {
  assert.equal((await inspectEvidence(item, async()=>({error:{statusCode:404}}))).classification,'INCONCLUSIVE');
  assert.equal((await inspectEvidence(item, async()=>({error:{statusCode:404},authoritativeMissing:true}))).classification,'MISSING');
});
test('network failure remains inconclusive', async () => {
  assert.equal((await inspectEvidence(item, async()=>{throw Error('offline');})).classification,'INCONCLUSIVE');
});
test('wrong size, magic or declared portal size cannot verify', async () => {
  assert.equal((await inspectEvidence({...item,byteSize:bytes.length+1},download)).classification,'MISMATCH');
  assert.equal((await inspectEvidence({...item,declaredByteSize:1},download)).classification,'MISMATCH');
  assert.equal((await inspectEvidence(item,async()=>({data:new Blob(['not a document'])}))).classification,'MISMATCH');
});
test('resumes after a partial checkpoint and reconciles without replaying completed downloads', async () => {
  const directory=await mkdtemp(path.join(os.tmpdir(),'hx-evidence-scan-'));
  try {
    const checkpoint=path.join(directory,'checkpoint.jsonl'), manifest={items:[item,{...item,id:'two',path:'qa/two.pdf'}]};
    let calls=0;const read=async()=>{calls++;return download();};
    assert.equal((await scanEvidence(manifest,read,checkpoint,{limit:1})).completed,1);
    await appendFile(checkpoint,'{"key":');
    const resumed=await scanEvidence(manifest,read,checkpoint);
    assert.equal(resumed.completed,2);assert.equal(resumed.processedThisRun,1);assert.equal(calls,2);
    assert.deepEqual(resumed.counts,{MATCH:2});
    assert.equal((await scanEvidence(manifest,read,checkpoint)).processedThisRun,0);
    assert.equal(calls,2);assert.equal(resumed.attestsDatabase,false);assert.equal(resumed.mutatesBusinessData,false);
    assert.ok((await readFile(checkpoint,'utf8')).endsWith('\n'));
    await assert.rejects(()=>scanEvidence({items:[{...item,checksumSha256:'0'.repeat(64)}]},read,checkpoint),/different metadata snapshot/);
  } finally {await rm(directory,{recursive:true,force:true});}
});
test('inconclusive records can be retried explicitly without replaying matched records',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'hx-evidence-retry-'));
  try{
    const checkpoint=path.join(directory,'scan.jsonl'),manifest={items:[item]};
    await scanEvidence(manifest,async()=>({error:{statusCode:403}}),checkpoint);
    const report=await scanEvidence(manifest,download,checkpoint,{retryInconclusive:true});
    assert.equal(report.completed,1);assert.deepEqual(report.counts,{MATCH:1});
  }finally{await rm(directory,{recursive:true,force:true});}
});
