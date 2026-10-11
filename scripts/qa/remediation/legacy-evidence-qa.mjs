import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs, parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';
import { clients, database, guard, id } from '../core.mjs';
import { inspectEvidence } from './evidence-reverification.mjs';

const {values:args}=parseArgs({options:{env:{type:'string'},manifest:{type:'string'},live:{type:'string'},out:{type:'string'}}});
for(const name of ['env','manifest','live','out'])assert.ok(args[name]);
Object.assign(process.env,parseEnv(await readFile(args.env,'utf8')));assert.equal(guard().ref,'ffrwiglcrlumfvhubaxg');
const sql=await database(),{admin,login}=await clients(),owner=await login('owner'),outside=await login('other_customer');
const original=JSON.parse(await readFile(args.manifest,'utf8')),live=JSON.parse(await readFile(args.live,'utf8'));
const report={scope:'T39_S5_QA_LEGACY_REVERIFICATION_AND_FOUR_REAL_CLASSIFICATIONS',projectRef:guard().ref,productionAccess:'NONE',checks:[]};
try{
  const legacy=original.items.find(x=>x.namespace==='INTERNAL'&&x.context.branchId===id('branch-A')&&x.sources.length);
  assert.ok(legacy);
  const [before]=await sql`select md5(to_jsonb(e)::text) hash from public.evidence_objects e where id=${legacy.id}`;
  const [moneyBefore]=await sql`select md5(coalesce(jsonb_agg(to_jsonb(p) order by p.id)::text,'')) hash from public.payments p`;
  const statusBefore=await owner.rpc('evidence_verified_storage_status',{target_evidence_id:legacy.id});assert.equal(statusBefore.error,null);
  report.preexistingVerification=statusBefore.data;
  const inspected=await inspectEvidence(legacy,item=>admin.storage.from(item.bucket).download(item.path));assert.equal(inspected.classification,'MATCH');
  const {data:{user},error}=await owner.auth.getUser();assert.equal(error,null);assert.ok(user);
  report.operationId=randomUUID();report.legacyEvidence=legacy.id;await writeFile(args.out,JSON.stringify(report,null,2),{mode:0o600});
  // Operator phase: actual server-downloaded bytes, authenticated operator identity,
  // canonical service-only RPC. No private-table insert or metadata rewrite.
  const input={actor_uuid:user.id,target_evidence_id:legacy.id,checksum_sha256:inspected.actual.checksumSha256,
    byte_size:inspected.actual.byteSize,operation_id:report.operationId};
  const first=await admin.rpc('finalize_evidence_upload_verified',input);assert.equal(first.error,null);
  const retry=await admin.rpc('finalize_evidence_upload_verified',input);assert.equal(retry.error,null);assert.equal(retry.data,first.data);
  const [after]=await sql`select md5(to_jsonb(e)::text) hash from public.evidence_objects e where id=${legacy.id}`;assert.deepEqual(after,before);
  const [moneyAfter]=await sql`select md5(coalesce(jsonb_agg(to_jsonb(p) order by p.id)::text,'')) hash from public.payments p`;assert.deepEqual(moneyAfter,moneyBefore);
  const statusAfter=await owner.rpc('evidence_verified_storage_status',{target_evidence_id:legacy.id});assert.equal(statusAfter.data,true);
  const [count]=await sql`select (select count(*)::int from public.command_receipts where operation_id=${report.operationId}) receipts,
    (select count(*)::int from public.audit_events where trace_id=${report.operationId}) audits`;
  assert.deepEqual(count,{receipts:1,audits:1});
  report.checks.push({name:'OLD_MATCH_REVERIFIED_ONCE',status:'PASS',evidence:legacy.id,sources:legacy.sources,metadataUnchanged:true,paymentsUnchanged:true,...count});
  const [changed]=await sql`select id,bucket_id,object_path,object_state,checksum_sha256,final_byte_size from public.portal_evidence_objects where id=${live.sources.noticeEvidence}`;
  const portal={namespace:'PORTAL',id:changed.id,bucket:changed.bucket_id,path:changed.object_path,state:changed.object_state,
    checksumSha256:changed.checksum_sha256,byteSize:Number(changed.final_byte_size),mimeType:'application/pdf',sources:[{table:'payment_notices',id:live.sources.notice}]};
  const mismatch=await inspectEvidence(portal,item=>admin.storage.from(item.bucket).download(item.path));assert.equal(mismatch.classification,'MISMATCH');
  const inconclusive=await inspectEvidence(portal,item=>outside.storage.from(item.bucket).download(item.path));assert.equal(inconclusive.classification,'INCONCLUSIVE');
  const [unused]=await sql`select id,bucket_id,object_path,object_state,checksum_sha256,final_byte_size from public.portal_evidence_objects where id=${live.sources['fault-upload']}`;
  const [used]=await sql`select (select count(*)::int from public.payment_notices where evidence_id=${unused.id})+
    (select count(*)::int from public.work_result_portal_evidence where evidence_id=${unused.id}) n`;assert.equal(used.n,0);
  // Remove only this owned, unattached QA object to represent actual asset loss.
  // The historical metadata and every posted business document remain intact.
  assert.equal((await admin.storage.from(unused.bucket_id).remove([unused.object_path])).error,null);
  const [exists]=await sql`select exists(select 1 from storage.objects where bucket_id=${unused.bucket_id} and name=${unused.object_path}) present`;assert.equal(exists.present,false);
  const missing=await inspectEvidence({...portal,id:unused.id,bucket:unused.bucket_id,path:unused.object_path,checksumSha256:unused.checksum_sha256,
    byteSize:Number(unused.final_byte_size),sources:[]},async item=>({...await admin.storage.from(item.bucket).download(item.path),authoritativeMissing:true}));
  assert.equal(missing.classification,'MISSING');
  report.classifications=[inspected,mismatch,missing,inconclusive];
  report.checks.push({name:'FOUR_CLASSIFICATIONS_REAL_QA',status:'PASS',counts:{MATCH:1,MISMATCH:1,MISSING:1,INCONCLUSIVE:1},missingFixtureBusinessSources:0});
  report.status='PASS';report.onlyOneLegacyEvidenceAttested=true;report.noProductionInventoryPerformed=true;
  await writeFile(args.out,JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify({status:report.status,legacy:legacy.id,classifications:4}));
}finally{await sql.end({timeout:3});}
