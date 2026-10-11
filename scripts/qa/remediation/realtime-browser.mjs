import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs, parseEnv } from 'node:util';
import { chromium } from '@playwright/test';
import { clients, guard, id, email } from '../core.mjs';
const {values:args}=parseArgs({options:{env:{type:'string'},source:{type:'string'},out:{type:'string'},screenshot:{type:'string'}}});
Object.assign(process.env,parseEnv(await readFile(args.env,'utf8')));assert.equal(guard().ref,'ffrwiglcrlumfvhubaxg');
const source=JSON.parse(await readFile(args.source,'utf8')),base='http://127.0.0.1:3110';
const report={scope:'T42_R1_ACTUAL_BROWSER_REFRESH_AND_RECONNECT_QUERY',projectRef:guard().ref,conversation:source.conversation,
  productionAccess:'NONE',financialWrites:0,expectedOfflineErrors:[],unexpectedErrors:[],intents:{live:randomUUID(),offline:randomUUID()}};
await writeFile(args.out,JSON.stringify(report,null,2),{mode:0o600});
const browser=await chromium.launch({headless:true}),context=await browser.newContext({baseURL:base}),page=await context.newPage();let offline=false;
const sockets=[];let changesReady=false;
report.browserWebsocketOrigins=[];
report.systemEvents=[];
page.on('websocket',socket=>report.browserWebsocketOrigins.push(new URL(socket.url()).origin));
await page.routeWebSocket('wss://ffrwiglcrlumfvhubaxg.supabase.co/**',route=>{
  if(offline){route.close({code:1001,reason:'QA transport unavailable'});return;}
  const server=route.connectToServer();sockets.push({route,server});
  route.onMessage(message=>server.send(message));
  server.onMessage(message=>{
    try{const decoded=JSON.parse(typeof message==='string'?message:message.toString());
      const event=Array.isArray(decoded)?decoded[3]:decoded.event,payload=Array.isArray(decoded)?decoded[4]:decoded.payload;
      if(event==='system')report.systemEvents.push({extension:payload?.extension,status:payload?.status,message:payload?.message});
      if(event==='system'&&payload?.extension==='postgres_changes'&&payload?.status==='ok')changesReady=true;
    }catch{}
    route.send(message);
  });
});
page.on('pageerror',error=>report.unexpectedErrors.push(error.message));
page.on('console',message=>{
  if(message.type()!=='error')return;const text=message.text().replace(/https?:\/\/\S+|wss?:\/\/\S+/g,'[transport URL]');
  if(offline&&/ERR_INTERNET_DISCONNECTED|WebSocket connection|ERR_NETWORK_CHANGED/.test(message.text()))report.expectedOfflineErrors.push(text);
  else report.unexpectedErrors.push(text);
});
try{
  await context.addCookies([{name:'hx_branch_id',value:id('branch-A'),url:base}]);
  await page.goto('/work/login');await page.locator('input[name=email]').fill(email('worker'));await page.locator('input[name=password]').fill(process.env.HX_QA_PASSWORD);
  await page.locator('button[type=submit]').click();await page.waitForURL(u=>!u.pathname.endsWith('/login'));
  await page.goto('/work/messages?conversation='+source.conversation);await page.getByRole('heading',{name:'Tin nhắn',exact:true}).waitFor();await page.waitForLoadState('networkidle');
  for(let i=0;i<80&&!changesReady;i++)await page.waitForTimeout(250);assert.ok(changesReady,'Actual database changes listener must confirm readiness');
  const {login}=await clients(),owner=await login('owner');
  const send=async(key,text)=>{const result=await owner.rpc('send_message',{target_conversation_id:source.conversation,target_body:text,operation_id:report.intents[key]});assert.equal(result.error,null);return result.data;};
  const liveText='PR42 QA trình duyệt: cập nhật '+report.intents.live;
  report.liveMessage=await send('live',liveText);await page.locator('article').getByText(liveText,{exact:true}).waitFor({timeout:20000});
  offline=true;changesReady=false;for(const {route,server}of sockets){route.close({code:1001,reason:'QA transport interruption'});server.close();}await context.setOffline(true);await page.waitForTimeout(700);
  const offlineText='PR42 QA trình duyệt: bù tin sau mất mạng '+report.intents.offline;
  report.offlineMessage=await send('offline',offlineText);assert.equal(await page.getByText(offlineText,{exact:true}).count(),0);
  await context.setOffline(false);await page.locator('article').getByText(offlineText,{exact:true}).waitFor({timeout:30000});offline=false;
  await page.screenshot({path:args.screenshot,caret:'initial',fullPage:true});
  assert.equal(report.unexpectedErrors.length,0,JSON.stringify(report.unexpectedErrors));
  report.status='PASS';report.recoveredWithoutManualReload=true;report.newEventAfterReconnectRequired=false;
}catch(error){report.status='FAIL';report.error=error.message.replace(/https?:\/\/\S+|wss?:\/\/\S+/g,'[transport URL]');process.exitCode=1;}
finally{await writeFile(args.out,JSON.stringify(report,null,2),{mode:0o600});await browser.close();}
console.log(JSON.stringify({status:report.status,recoveredWithoutManualReload:report.recoveredWithoutManualReload,unexpectedErrors:report.unexpectedErrors.length}));
