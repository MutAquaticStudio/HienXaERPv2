import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {execFileSync} from 'node:child_process';
import {chromium} from '@playwright/test';
import {argumentsForRun,openQA} from './remediation/native-fixture.mjs';
const a=argumentsForRun(),q=await openQA(a),d=JSON.parse(await readFile(a.documents,'utf8')).documents,f=JSON.parse(await readFile('reports/ux-ui-refinement/FIXTURES.json','utf8')).source;
assert.ok(['before','after'].includes(a.phase));assert.equal(a.database,'hx_remediation_go_live_browser175');
const env=parseEnv(await readFile(a['auth-env'],'utf8'));assert.equal(env.HX_QA_PROJECT_REF,'ffrwiglcrlumfvhubaxg');assert.equal(env.HX_QA_RUNTIME_APPROVED,'true');
const origin=a.origin??'http://127.0.0.1:3116';assert.ok(['http://127.0.0.1:3116','http://127.0.0.1:3117'].includes(origin));
const browser=await chromium.launch({headless:true}),contexts=[];
const dir='reports/ux-ui-refinement/'+a.phase;await mkdir(dir,{recursive:true});
const r={phase:a.phase,origin,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:a['source-root']??process.cwd(),encoding:'utf8'}).trim(),workingTree:execFileSync('git',['status','--porcelain','--','src'],{cwd:a['source-root']??process.cwd(),encoding:'utf8'}).trim(),checkedAt:new Date().toISOString(),productionAccess:'NONE',schemaChanges:0,browserPlugin:'ABSENT; installed Playwright1.63.0 fallback',screens:[],errors:[]};
const screens=[
 ['manager','owner','admin','/admin'],
 ['sales-order','sales','admin','/admin/orders/'+f.so],
 ['sales-form','sales','admin','/admin/orders/new'],
 ['purchasing-order','purchasing','admin','/admin/purchase-orders/'+f.po],
 ['purchasing-form','purchasing','admin','/admin/purchase-orders/new'],
 ['warehouse','warehouse-dispatch','admin','/admin/inventory?warehouse='+f.warehouse+'&material='+f.material],
 ['dispatch','warehouse-dispatch','admin','/admin/deliveries/'+f.delivery],
 ['finance-receivables','finance-employee','admin','/admin/receivables?customer='+f.customer],
 ['finance-cashbook','finance-employee','admin','/admin/cashbook'],
 ['worker','worker','work','/work/jobs/'+f.work],
 ['customer','finance','customer','/customer/orders/'+f.so],
 ['receiver','receiver','customer','/customer/orders/'+f.so],
];
async function business(){const [row]=await q.sql`select (select count(*)::int from public.inventory_movements) movements,(select count(*)::int from public.payments) payments,(select count(*)::int from public.receivable_obligations) ar,(select count(*)::int from public.payable_obligations) ap,(select count(*)::int from public.delivery_verifications) verified`;return row;}
async function login(role,surface,viewport){const c=await browser.newContext({viewport});contexts.push(c);await c.addCookies([{name:'hx_branch_id',value:d.branch,url:origin},{name:'hx_customer_id',value:d.customer,url:origin}]);const p=await c.newPage();p.on('pageerror',e=>r.errors.push({role,message:e.message.split('\n')[0]}));await p.goto(origin+(surface==='admin'?'/login':'/'+surface+'/login'));await p.getByLabel('Thư điện tử').fill('hxqa-'+role+'@example.test');await p.getByLabel('Mật khẩu',{exact:true}).fill(env.HX_QA_PASSWORD);await p.getByRole('button',{name:'Đăng nhập',exact:true}).click();await p.waitForURL(u=>(u.pathname.startsWith('/'+surface)&&!u.pathname.endsWith('/login'))||u.pathname==='/select-branch');if(new URL(p.url()).pathname==='/select-branch'){await p.getByLabel('Chi nhánh đang hoạt động').selectOption(d.branch);await p.getByRole('button',{name:'Tiếp tục',exact:true}).click();await p.waitForURL(u=>u.pathname.startsWith('/'+surface));}return p;}
try{
 r.schema=(await q.sql`select count(*)::int count,max(version) latest from supabase_migrations.schema_migrations`)[0];r.businessBefore=await business();
 for(const [size,viewport] of [['desktop',{width:1280,height:900}],['mobile',{width:390,height:844}]]){
  const pages=new Map();
  for(const [name,role,surface,path] of screens){let p=pages.get(role+surface);if(!p){p=await login(role,surface,viewport);pages.set(role+surface,p);}await p.goto(origin+path);await p.locator('h1').first().waitFor();await p.evaluate(()=>document.fonts.ready);await p.locator('main').last().waitFor();
   if(name==='manager'){await p.locator('[data-uat-dashboard-filters="ready"]').waitFor();await p.locator('[data-uat-dashboard-content="ready"]').waitFor();}
   if(name==='finance-cashbook'){const process=p.getByText('Xử lý',{exact:true});if(await process.count()){await process.first().click();await p.locator('.table-wrap').evaluate(el=>{el.scrollLeft=el.scrollWidth;});}}
   if(name==='sales-form'){await p.getByRole('button',{name:'+ Thêm khách',exact:true}).count();}
   const state=await p.evaluate(()=>({heading:document.querySelector('h1')?.textContent,documentWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth,bodyFont:getComputedStyle(document.body).fontFamily,primary:getComputedStyle(document.documentElement).getPropertyValue('--primary').trim(),visibleControls:[...document.querySelectorAll('button,a,input,select,textarea')].filter(x=>x.getClientRects().length).map(x=>({tag:x.tagName,name:x.getAttribute('name')??null,href:x.getAttribute('href'),text:(x.getAttribute('aria-label')||x.textContent||'').trim().slice(0,120)})),clippedMetrics:[...document.querySelectorAll('.metric-value')].filter(x=>x.scrollWidth>x.clientWidth+1).map(x=>({text:x.textContent,width:x.clientWidth,scroll:x.scrollWidth})),unlabelledInputs:[...document.querySelectorAll('input:not([type=hidden]),select,textarea')].filter(x=>x.getClientRects().length&&!x.labels?.length&&!x.getAttribute('aria-label')&&!x.getAttribute('aria-labelledby')).map(x=>({name:x.name,type:x.type,placeholder:x.getAttribute('placeholder')})),tableColumns:[...document.querySelectorAll('th')].map(x=>x.textContent.trim())}));
   await p.evaluate(()=>window.scrollTo(0,0));const file=dir+'/'+name+'-'+size+'.png';await p.screenshot({path:file,fullPage:false});await p.screenshot({path:dir+'/'+name+'-'+size+'-full.png',fullPage:true});r.screens.push({name,role,surface,path,size,viewport,file,...state});await writeFile(a.out,JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify({name,size,overflow:state.documentWidth>viewport.width+1,clippedMetrics:state.clippedMetrics.length,unlabelled:state.unlabelledInputs.length}));
  }
  for(const p of pages.values())await p.context().close();
 }
 r.businessAfter=await business();assert.deepEqual(r.businessAfter,r.businessBefore);assert.deepEqual(r.errors,[]);r.status='PASS_CAPTURE_READONLY';await writeFile(a.out,JSON.stringify(r,null,2)+'\n');
}catch(e){r.status='FAIL';r.error=e.message.split('\n')[0];await writeFile(a.out,JSON.stringify(r,null,2)+'\n');throw new Error(r.error);}finally{for(const c of contexts)await c.close();await browser.close();await q.sql.end({timeout:3});}
