import { browserSession } from './browser.mjs';
import { artifact, percentiles, id, database, capacity, clients } from './core.mjs';
import { randomUUID } from 'node:crypto';
const sql = await database();
const results = [];
const paths = [
  { path:'/admin', selector:'.metric-value', name:'dashboard' },
  { path:'/admin/orders', selector:'tbody tr', name:'order-list' },
  { path:'/admin/customers', selector:'tbody tr', name:'customer-list' },
  { path:`/admin/orders/${id('order-0-0')}`, selector:'tbody tr', name:'order-detail' },
];
const samples = Number(process.env.HX_QA_SAMPLES ?? 100);
if (!Number.isInteger(samples) || samples < 100 || samples > 1000) throw new Error('HX_QA_SAMPLES must be 100..1000');
try {
  const bytes = await capacity(sql);
  const [counts] = await sql`select (select count(*)::int from public.customers where code like 'HXQA-%') as customers, (select count(*)::int from public.sales_orders where order_number like 'HXQA-%') as orders`;
  if (counts.customers < 10 || counts.orders < 100) throw new Error('QA fixtures must exist before performance measurement');
  for (const concurrency of [1,5,10]) {
    const session = await browserSession('owner');
    try {
      for (const scenario of paths) {
        const rows = [];
        const entry = { ...scenario, concurrency, rows, viewport: { width:1440, height:1080 } };
        results.push(entry);
        let next = 0;
        await Promise.all(Array.from({ length:concurrency }, async () => {
          const page = await session.context.newPage();
          try {
            while (next < samples) {
              const index = next++;
              await page.goto(scenario.name === 'order-list' ? '/admin/customers' : '/admin/orders');
              const link = page.locator(`a[href="${scenario.path}"]`).first();
              await link.waitFor({ state:'visible' });
              const resourceStart = await page.evaluate(() => performance.now());
              const start = performance.now();
              let ok = false, payloadBytes = 0, status = null;
              try {
                await link.click();
                await page.waitForURL(url => url.pathname === new URL(scenario.path,'http://qa').pathname);
                await page.locator(scenario.selector).first().waitFor({ state:'visible',timeout:30000 });
                ok = new URL(page.url()).pathname === new URL(scenario.path,'http://qa').pathname;
                payloadBytes = await page.evaluate(since => performance.getEntriesByType('resource').filter(entry=>entry.startTime>=since).reduce((sum,entry) => sum + (entry.transferSize || 0),0), resourceStart);
              } catch { /* Failed samples remain in distribution. */ }
              rows.push({ index, ms:performance.now()-start, ok, status, payloadBytes, cache:index < concurrency ? 'first-navigation-no-server-cache-reset' : 'warm' });
              if (rows.length >= 3 && rows.slice(-3).every(row => !row.ok)) throw new Error(`Repeated failure in ${scenario.name}; partial samples retained`);
            }
          } finally { await page.close(); }
        }));
        Object.assign(entry, percentiles(rows));
        console.log(JSON.stringify({ scenario:scenario.name,concurrency,...percentiles(rows) }));
      }
      const apiRows = [];
      let apiNext = 0;
      await Promise.all(Array.from({length:concurrency}, async () => {
        while (apiNext++ < samples) {
          const start = performance.now();
          try {
            const response = await session.context.request.get('/api/access/context');
            const body = await response.body();
            const server = response.headers()['server-timing']?.match(/access;dur=([0-9.]+)/);
            apiRows.push({ms:performance.now()-start,ok:response.status()===200,status:response.status(),payloadBytes:body.length,serverMs:server ? Number(server[1]) : null});
          } catch { apiRows.push({ms:performance.now()-start,ok:false,serverMs:null}); }
        }
      }));
      results.push({name:'access-api',concurrency,...percentiles(apiRows),rows:apiRows,server:percentiles(apiRows.filter(row=>row.serverMs!==null).map(row=>({...row,ms:row.serverMs}))) });
      const { login } = await clients();
      const client = await login('owner');
      try {
        for (const scenario of ['finance-report','simple-command']) {
          const rows = [];
          let next = 0;
          await Promise.all(Array.from({length:concurrency},async()=> {
            while (next++ < samples) {
              await capacity(sql);
              const operation = randomUUID();
              const args = scenario === 'finance-report' ? {
                target_branch_id:id('branch-A'),from_inclusive:new Date(Date.now()-365*86400000).toISOString(),to_exclusive:new Date().toISOString(),knowledge_cutoff:new Date().toISOString(),
              } : { target_branch_id:id('branch-A'),account_code:`HXQA-P${operation.replaceAll('-','').slice(0,16).toUpperCase()}`,account_name:'HXQA performance account',account_kind:'CASH',operation_id:operation };
              const start=performance.now();
              try {
                const response=await client.rpc(scenario==='finance-report'?'finance_dashboard_snapshot':'create_finance_account',args);
                rows.push({ms:performance.now()-start,ok:!response.error,payloadBytes:Buffer.byteLength(JSON.stringify(response.data)),errorCode:response.error?.code ?? null});
              } catch { rows.push({ms:performance.now()-start,ok:false}); }
            }
          }));
          results.push({name:scenario,concurrency,measurement:'supabase-rpc-round-trip',...percentiles(rows),rows});
        }
      } finally { await client.auth.signOut(); }
    } finally { await session.browser.close(); }
  }
  await artifact('perf',{ status:results.some(r => r.errors) ? 'FAIL' : 'PARTIAL', sourceRequirements:['SPEC-PERF-002','SPEC-PERF-004'], measurement:'browser-click-to-selector-and-access-api', browserPayloadMetric:'resource-transfer-bytes-since-click', databaseBytes:bytes,dataset:counts,results, limitations:['server-duration-covers-access-api-only','true-cold-server-cache-not-reset','expanded-scale-not-run','draft-and-opening-balance-profile-not-full-operational-lifecycle','messages-not-implemented','no-human-task-duration'] });
} catch (error) {
  await artifact('perf',{status:'FAIL',results,error:error.message});
  process.exitCode=1;
} finally { await sql.end(); }
if (results.some(r => r.errors)) process.exitCode=1;
