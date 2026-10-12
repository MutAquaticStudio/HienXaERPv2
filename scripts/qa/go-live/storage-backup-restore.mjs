import assert from "node:assert/strict";
import { readFile,writeFile,mkdir,chmod } from "node:fs/promises";
import { parseEnv } from "node:util";
import { createHash,randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { database,guard,capacity } from "../core.mjs";
Object.assign(process.env,parseEnv(await readFile(process.argv[2],"utf8")));assert.equal(guard().ref,"ffrwiglcrlumfvhubaxg");
const sql=await database();await capacity(sql);
const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const bucket="qa-restore-"+randomUUID().replaceAll("-","").slice(0,12),directory="/Users/nox/Downloads/HienXaERP-GoLive-Private-20261012/storage-byte-backup185";
await mkdir(directory,{recursive:true,mode:0o700});await chmod(directory,0o700);
const report={scope:"ACTUAL_QA_STORAGE_BYTES_PRIVATE_BACKUP_AND_ISOLATED_RESTORE",productionAccess:"NONE",businessDocumentsChanged:0,checks:[],productionBackupReplacement:false};let created=false;
report.restoreBucket=bucket;
try{
 const objects=await sql`select bucket_id,name,metadata from storage.objects order by bucket_id,name`;
 assert.ok(objects.length>0);assert.ok(objects.length<=200,"QA-only inventory ceiling; byte budget is checked for every object");
 const create=await client.storage.createBucket(bucket,{public:false,fileSizeLimit:20*1024*1024});assert.equal(create.error,null);created=true;
 const manifest=[];let size=0;
 for(const [index,o]of objects.entries()){
  const source=await client.storage.from(o.bucket_id).download(o.name);assert.equal(source.error,null);
  const bytes=Buffer.from(await source.data.arrayBuffer());size+=bytes.length;assert.ok(size<64*1024*1024,"QA read-only inventory has101 objects/about26MB; this is a rehearsal resource guard, not an app upload or financial limit");
  const sha=createHash("sha256").update(bytes).digest("hex"),name=index.toString().padStart(4,"0")+".bin";
  await writeFile(directory+"/"+name,bytes,{mode:0o600});
  const uploaded=await client.storage.from(bucket).upload(name,await readFile(directory+"/"+name),{contentType:source.data.type||"application/octet-stream",upsert:false});assert.equal(uploaded.error,null);
  const restored=await client.storage.from(bucket).download(name);assert.equal(restored.error,null);
  const recovered=Buffer.from(await restored.data.arrayBuffer());assert.equal(recovered.length,bytes.length);assert.equal(createHash("sha256").update(recovered).digest("hex"),sha);assert.deepEqual(recovered,bytes);
  manifest.push({sourceBucket:o.bucket_id,sourcePath:o.name,backupFile:name,contentType:source.data.type,bytes:bytes.length,sha256:sha});
  report.checks.push({objectIndex:index,bytes:bytes.length,sha256:sha,status:"PASS_BYTE_FOR_BYTE_RESTORED",metadataOnly:false});
  await writeFile(process.argv[3],JSON.stringify(report,null,2));
 }
 await writeFile(directory+"/manifest.json",JSON.stringify({qaProject:"ffrwiglcrlumfvhubaxg",checkedAt:new Date().toISOString(),objects:manifest},null,2),{mode:0o600});
 const after=await sql`select bucket_id,name,metadata from storage.objects where bucket_id<>${bucket} order by bucket_id,name`;
 assert.deepEqual(after,objects,"Original QA objects/metadata changed during restore rehearsal");
 report.status="PASS_QA_BYTE_BACKUP_RESTORE_ONLY";report.totalBytes=size;report.originalObjectsUnchanged=true;
}catch(error){report.status="FAIL";report.error=error.message.split("\n")[0];throw error;}
finally{
 if(created){
  const emptied=await client.storage.emptyBucket(bucket);assert.equal(emptied.error,null);
  for(let i=0;i<60;i++){
   const deleted=await client.storage.deleteBucket(bucket);
   if(!deleted.error){report.isolatedRestoreBucketCleaned=true;break;}
   assert.equal(deleted.error.code,"ResourceNotEmpty");await new Promise(resolve=>setTimeout(resolve,500));
  }
  if(!report.isolatedRestoreBucketCleaned){report.cleanupPending=true;report.status="RESTORE_CHECKS_COMPLETE_CLEANUP_PENDING";}
 }
 report.checkedAt=new Date().toISOString();await writeFile(process.argv[3],JSON.stringify(report,null,2));await sql.end({timeout:3});
 console.log(JSON.stringify({status:report.status,objects:report.checks.length,totalBytes:report.totalBytes,cleaned:report.isolatedRestoreBucketCleaned}));
}
