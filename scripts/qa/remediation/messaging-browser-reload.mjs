import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';
import { argumentsForRun, openQA } from './native-fixture.mjs';

const args=argumentsForRun(),qa=await openQA(args);
const env=parseEnv(await readFile(args['auth-env'],'utf8'));
const source=JSON.parse(await readFile('reports/business-flow-remediation/evidence/FINAL_REVIEW_MESSAGING_QUERY_FALLBACK169.json','utf8'));
const [message]=await qa.sql`select id,body from public.messages where id=${source.message} and conversation_id=${source.conversation}`;
assert.ok(message);
const report={scope:'NATIVE_REAL_JWT_BROWSER_RELOAD_WITHOUT_WEBSOCKET',schema:171,businessWrites:0,
  existingConversation:source.conversation,existingMessage:source.message,
  browserTool:'Playwright',reason:'No Browser plugin API exposed; existing local Playwright QA harness reused',
  productionAccess:'NONE',unexpectedErrors:[]};
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1280,height:900}});
page.on('pageerror',e=>report.unexpectedErrors.push(e.message));
page.on('console',m=>{if(m.type()==='error')report.unexpectedErrors.push(m.text());});
let blocked=0;
await page.routeWebSocket('ws://127.0.0.1:3108/**',socket=>{blocked++;socket.close();});
try{
  await page.goto('http://127.0.0.1:3110/login');
  await page.getByLabel('Thư điện tử').fill('hxqa-owner@example.test');
  await page.getByLabel('Mật khẩu',{exact:true}).fill(env.HX_QA_PASSWORD);
  await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
  await page.waitForURL(u=>/\/admin|\/select-branch/.test(u.pathname));
  await page.goto('http://127.0.0.1:3110/select-branch');
  await page.getByLabel('Chi nhánh đang hoạt động').selectOption(qa.fixtures.branch);
  await page.getByRole('button',{name:'Tiếp tục',exact:true}).click();await page.waitForURL(/\/admin/);
  await page.goto('http://127.0.0.1:3110/admin/messages?conversation='+source.conversation);
  await page.getByRole('heading',{name:'Tin nhắn',exact:true}).waitFor();
  await page.getByText(message.body,{exact:true}).first().waitFor();
  await page.reload();await page.getByText(message.body,{exact:true}).first().waitFor();
  await page.screenshot({caret:'initial',path:args.screenshot,fullPage:true});
  assert.equal(report.unexpectedErrors.length,0,JSON.stringify(report.unexpectedErrors));
  assert.ok(blocked>0,'Websocket must actually be attempted and blocked');
  Object.assign(report,{status:'PASS',websocketAttemptsBlocked:blocked,reloadReadsMessage:true,
    messageHash:createHash('sha256').update(message.body).digest('hex'),realWebsocketTested:false});
  await writeFile(args.out,JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,blocked,unexpectedErrors:0,businessWrites:0}));
}finally{await browser.close();await qa.sql.end({timeout:3});}
