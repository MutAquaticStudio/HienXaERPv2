import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs, parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { clients, database, guard, id } from '../core.mjs';

const {values:args}=parseArgs({options:{env:{type:'string'},credentials:{type:'string'},out:{type:'string'},resume:{type:'string'}}});
for(const key of ['env','credentials','out'])assert.ok(args[key]);
Object.assign(process.env,parseEnv(await readFile(args.env,'utf8')));
assert.equal(guard().ref,'ffrwiglcrlumfvhubaxg');
const nativeConfig=JSON.parse(await readFile(args.credentials,'utf8'));
assert.equal(nativeConfig.host,'127.0.0.1');assert.equal(nativeConfig.port,49760);
const native=postgres({...nativeConfig,database:'hx_remediation_g01_g23_upgrade',max:1,prepare:false,onnotice(){}});
const sql=await database();
const report={scope:'REAL_QA_WEBSOCKET_MESSAGING_SAME_EFFECTIVE_CONTRACT',productionAccess:'NONE',financialWrites:0,tokensRecorded:false,channels:[]};
const sessions=[],channels=[];
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function rpc(client,name,payload){const {data,error}=await client.rpc(name,payload);assert.equal(error,null,name+' failed');return data;}
async function contract(db){return db.begin(async tx=>{
  await tx.unsafe('set transaction read only');
  const functions=await tx`select n.nspname schema,p.proname name,md5(pg_get_functiondef(p.oid)) hash
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where
    (n.nspname='public' and p.proname in('create_conversation','send_message','conversation_message_page','conversation_list_for_scope'))
    or(n.nspname='private' and p.proname in('can_access_conversation','has_permission','has_branch_access','command_payload_hash')) order by schema,name`;
  const policies=await tx`select tablename,policyname,roles::text,cmd,qual,with_check from pg_policies
    where schemaname='public' and tablename in('messages','conversations','conversation_participants') order by tablename,policyname`;
  return {functions,policies};
});}
async function subscribe(client,role,conversation,events){
  const {data:{session}}=await client.auth.getSession();assert.ok(session);
  await client.realtime.setAuth(session.access_token);
  let ready;
  const readiness=new Promise(resolve=>{ready=resolve;});
  const channel=client.channel('release-proof-'+role+'-'+conversation).on('postgres_changes',
    {event:'INSERT',schema:'public',table:'messages',filter:'conversation_id=eq.'+conversation},payload=>events.push(payload.new.id))
    .on('system',{},payload=>{
      report.channels.push({role,extension:payload.extension,status:payload.status});
      if(payload.extension==='postgres_changes'&&payload.status==='ok')ready();
    });
  channels.push({client,channel});
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Realtime subscribe timeout')),20000);
    channel.subscribe(status=>{report.channels.push({role,status});if(status==='SUBSCRIBED'){clearTimeout(timer);resolve();}else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'){clearTimeout(timer);reject(Error('Realtime subscription failed'));}});
  });
  let timer;
  try{await Promise.race([readiness,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Postgres changes not ready')),20000);})]);}
  finally{clearTimeout(timer);}return channel;
}
async function received(events,message){for(let i=0;i<40&&!events.includes(message);i++)await wait(250);assert.ok(events.includes(message),'Authorized subscriber did not receive INSERT');}
try{
  const qaContract=await contract(sql),nativeContract=await contract(native);
  assert.deepEqual(qaContract,nativeContract,'QA messaging contracts differ; do not borrow cloud results for the new source');
  report.contractParity=qaContract;
  report.schema=(await sql`select count(*)::int migrations,max(version) latest from supabase_migrations.schema_migrations`)[0];
  const {login}=await clients(),owner=await login('owner'),worker=await login('worker'),outside=await login('other_customer');
  sessions.push(owner,worker,outside);
  const workerUser=await worker.auth.getUser();assert.ok(workerUser.data.user);
  // Save intent IDs before the first write; a stopped run has reviewable sources.
  const previous=args.resume?JSON.parse(await readFile(args.resume,'utf8')):null;
  const intents=previous?.intents??{conversation:randomUUID(),first:randomUUID(),offline:randomUUID(),afterReconnect:randomUUID()};
  if(previous)intents.readyProbe??=randomUUID();
  Object.assign(report,{intents,status:'RUNNING'});await writeFile(args.out,JSON.stringify(report,null,2),{mode:0o600});
  const conversation=previous?.conversation??await rpc(owner,'create_conversation',{target_branch_id:id('branch-A'),target_audience:'INTERNAL',target_customer_id:null,
    target_subject:'PR42 QA kiểm chứng Realtime',target_entity_type:'branch',target_entity_id:id('branch-A'),target_participant_auth_user_ids:[workerUser.data.user.id],operation_id:intents.conversation});
  report.conversation=conversation;await writeFile(args.out,JSON.stringify(report,null,2),{mode:0o600});
  const allowed=[],denied=[];await subscribe(worker,'participant',conversation,allowed);await subscribe(outside,'nonparticipant',conversation,denied);
  const send=(operation_id,body)=>rpc(owner,'send_message',{target_conversation_id:conversation,target_body:body,operation_id});
  const probeIntent=previous?intents.readyProbe:intents.first;
  const first=await send(probeIntent,'QA Realtime: cập nhật trên kết nối thật');await received(allowed,first);
  assert.equal(await send(probeIntent,'QA Realtime: cập nhật trên kết nối thật'),first);
  const forbidden=await outside.rpc('conversation_message_page',{target_conversation_id:conversation,before_created_at:null,before_id:null,page_size:20});
  assert.equal(forbidden.error?.code,'42501');
  const masked=await outside.from('messages').select('id').eq('conversation_id',conversation);assert.equal(masked.error,null);assert.deepEqual(masked.data,[]);
  await worker.removeAllChannels();worker.realtime.disconnect();await wait(500);
  const offline=await send(intents.offline,'QA Realtime: tin trong thời gian mất kết nối');
  assert.ok(!allowed.includes(offline));
  worker.realtime.connect();
  await subscribe(worker,'participant-reconnected',conversation,allowed);
  const query=await rpc(worker,'conversation_message_page',{target_conversation_id:conversation,before_created_at:null,before_id:null,page_size:20});
  assert.ok(query.some(row=>row.id===offline),'Query fallback must recover missed events');
  const reconnected=await send(intents.afterReconnect,'QA Realtime: cập nhật sau phục hồi');await received(allowed,reconnected);
  await wait(1500);assert.deepEqual(denied,[]);
  const rows=await sql`select id::text from public.messages where conversation_id=${conversation} order by id`;
  assert.equal(rows.length,previous?4:3);
  Object.assign(report,{status:'PASS',messageIds:[first,offline,reconnected],eventsToNonparticipant:denied.length,
    missedEventRecoveredByQuery:true,reconnectedEventReceived:true,messageCount:rows.length,browserRefreshTested:false,qaMessagingWrites:rows.length+1,
    resumedConversation:!!previous,firstAttemptMessagePreserved:!!previous});
}catch(error){report.status='FAIL';report.failure=error instanceof assert.AssertionError?error.message.replace(/https?:\/\/\S+/g,'[URL]'):'Realtime check stopped; inspect QA connection privately';process.exitCode=1;}
finally{
  for(const {client,channel} of channels)await client.removeChannel(channel);
  for(const client of sessions)client.realtime.disconnect();
  await writeFile(args.out,JSON.stringify(report,null,2),{mode:0o600});
  await sql.end({timeout:3});await native.end({timeout:3});
}
console.log(JSON.stringify({status:report.status,contractParity:!!report.contractParity,schema:report.schema,eventsToNonparticipant:report.eventsToNonparticipant,financialWrites:0}));
