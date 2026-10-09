import {randomUUID,createHash} from 'node:crypto';
import {importOpenings} from './import_openings.mjs';

// Same accepted importer; the adapter constrains its opening writer boundary.
// Preparation is master-only. It does not claim a completed opening import or insert its receipt.
const writerKind=text=>{
 const name=text.match(/^select\s+private\.post_(inventory|finance|cash)_opening\(/i)?.[1];
 return name?.toUpperCase();
};
const valueOf=x=>x?.rows?.[0]?.result;
export function captureOpeningWriterPayload(input){
 let payload=input;
 if(typeof input==='string'){
  try{payload=JSON.parse(input);}
  catch{throw new Error('OPENING_WRITER_PAYLOAD_INVALID_JSON');}
 }
 if(payload===null||typeof payload!=='object'||Array.isArray(payload))
  throw new Error('OPENING_WRITER_PAYLOAD_OBJECT_REQUIRED');
 return structuredClone(payload);
}

export async function prepareOperationalOpeningPackage(db,pkg,options){
 const manifest=[];
 const planned=await importOpenings({transaction:fn=>db.transaction(tx=>fn({
  ...tx,
  query:async(text,args=[])=>{
   const kind=writerKind(text);
   if(kind){manifest.push({kind,payload:captureOpeningWriterPayload(args[0])});return {rows:[{id:randomUUID()}]};}
   if(/^insert\s+into\s+private\.operational_import_receipts\b/i.test(text))return {rows:[]};
   return tx.query(text,args);
  }
 }))},pkg,{...options,mode:'OPENINGS_AND_TRANSIT_ONLY',operationId:randomUUID()});
 return {planned,manifest};
}
export async function registerOperationalOpeningPackage(db,pkg,{sourceBytes,manifest,branchId,runId,actorId,recoveryId,expiresAt,dataMode,packageId=randomUUID()}){
 if(!Buffer.isBuffer(sourceBytes)||createHash('sha256').update(sourceBytes).digest('hex')!==pkg.source_sha256)
  throw new Error('OPENING_SOURCE_HASH_MISMATCH');
 const scoped=manifest.filter(m=>m.payload.branch_id===branchId);
 const result=await db.query('select private.register_operational_opening_package($1,$2,$3,$4::jsonb,$5::bytea,$6::jsonb,$7,$8,$9,$10) result',
  [packageId,branchId,runId,pkg,sourceBytes,scoped,actorId,recoveryId,expiresAt,dataMode]);
 return {packageId,branchId,runId,packageSha256:valueOf(result)};
}
export async function importAuthorizedOpenings(db,pkg,{authorizations,...options}){
 if(!Array.isArray(authorizations)||!authorizations.length)throw new Error('OPENING_AUTHORIZATIONS_REQUIRED');
 return db.transaction(async tx=>{
  await tx.query('select private.assert_operational_opening_writers_protected()');
  const states=[];
  for(const a of [...authorizations].sort((x,y)=>x.branchId.localeCompare(y.branchId))){
   const result=await tx.query('select private.begin_authorized_opening_import($1,$2,$3,$4::jsonb,$5) result',
    [a.packageId,a.branchId,a.runId,pkg,options.actorId]);
   states.push(valueOf(result));
  }
  if(states.every(s=>s.completed))return states[0].result;
  if(states.some(s=>s.completed))throw new Error('OPENING_PARTIAL_AUTHORIZATION_CONFLICT');
  const result=await importOpenings({transaction:fn=>fn(tx)},pkg,{...options,mode:'OPENINGS_AND_TRANSIT_ONLY'});
  for(const a of authorizations)await tx.query('select private.complete_authorized_opening_import($1,$2::jsonb)',[a.packageId,result]);
  return result;
 });
}
// Must be called only after releasing the writer and acquiring a new logical client.
export async function reconcileAuthorizedOpenings(freshDb,authorizations){
 const result=[];
 for(const a of authorizations){
  const read=await freshDb.query('select private.record_independent_opening_readback($1) result',[a.packageId]);
  result.push({packageId:a.packageId,readbackId:valueOf(read)});
 }
 return result;
}
