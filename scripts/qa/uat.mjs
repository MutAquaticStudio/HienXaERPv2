import assert from 'node:assert/strict';
import { clients, id, personas, artifact, database, email, required, guard } from './core.mjs';
import { browserSession } from './browser.mjs';
guard();
const results = [];
const { login } = await clients();
const sql = await database();
async function check(name, work) {
  try { await work(); results.push({ name, status: 'PASS' }); }
  catch (error) { results.push({ name, status: 'FAIL', error: error.message.replace(/https?:\/\/\S+/g,'[URL]') }); }
}
try {
  for (const role of personas) await check(`login-and-scope:${role}`, async () => {
    const client = await login(role);
    try {
      const { data, error } = await client.from('branches').select('id');
      assert.equal(error, null);
      if (role === 'sales' || role === 'worker') assert.deepEqual(data.map(r => r.id), [id('branch-A')]);
      if (role === 'owner') assert.equal(data.length, 2);
      if (['finance','receiver','other_customer'].includes(role)) {
        const customer = role === 'other_customer' ? 1 : 0;
        const allowed = await client.rpc('customer_portal_snapshot', { target_customer_id: id(`customer-${customer}`) });
        assert.equal(allowed.error, null);
        assert.equal(allowed.data.can_view_debt, role !== 'receiver');
        if (role === 'receiver') assert.equal(allowed.data.debt, null);
        assert.ok(!JSON.stringify(allowed.data).includes('HXQA-INTERNAL-SECRET'));
        const denied = await client.rpc('customer_portal_snapshot', { target_customer_id: id(`customer-${customer ? 0 : 1}`) });
        assert.ok(denied.error, 'cross-customer snapshot must fail');
        const file = await client.rpc('get_portal_evidence_for_signing', {target_evidence_id:id('nonexistent-evidence')});
        assert.ok(file.error);
      }
    } finally { await client.auth.signOut(); }
  });
  await check('customer-portal-internal-note-column-boundary', async () => {
    const ownId = id('customer-0');
    const otherId = id('customer-1');
    const owner = await login('owner');
    let names;
    try {
      const baseline = await owner.from('customers').select('id,display_name,internal_note').in('id', [ownId, otherId]);
      assert.equal(baseline.error, null);
      assert.equal(baseline.data.length, 2);
      assert.ok(baseline.data.every(row => row.internal_note?.includes('HXQA-INTERNAL-SECRET')));
      names = new Map(baseline.data.map(row => [row.id, row.display_name]));
    } finally { await owner.auth.signOut(); }
    for (const role of ['finance', 'receiver', 'other_customer']) {
      const client = await login(role);
      try {
        const own = role === 'other_customer' ? otherId : ownId;
        const cross = role === 'other_customer' ? ownId : otherId;
        const direct = await client.from('customers').select('id,internal_note').eq('id', own);
        assert.ok(direct.error || direct.data?.length === 0, `${role} must not read customer internals`);
        const ownName = await client.rpc('customer_portal_display_name', { target_customer_id: own });
        const crossName = await client.rpc('customer_portal_display_name', { target_customer_id: cross });
        assert.equal(ownName.error, null);
        assert.equal(ownName.data, names.get(own));
        assert.equal(crossName.error, null);
        assert.equal(crossName.data, null);
      } finally { await client.auth.signOut(); }
    }
  });
  await check('customer-portal-price-override-line-boundary', async () => {
    const customerA = id('customer-0');
    const customerB = id('customer-1');
    const revisions = await sql`select customer_id,current_revision_id from public.quotations where customer_id in (${customerA},${customerB}) and current_revision_id is not null order by created_at desc`;
    const revisionFor = (customerId) => revisions.find((row) => row.customer_id === customerId)?.current_revision_id;
    assert.ok(revisionFor(customerA) && revisionFor(customerB), 'QA customer quotations are required');
    const owner = await login('owner');
    try {
      for (const table of ['quotation_lines', 'sales_order_lines']) {
        const positive = await owner.from(table).select('override_reason').not('override_reason', 'is', 'null').limit(1);
        assert.equal(positive.error, null);
        assert.equal(positive.data.length, 1, `${table} needs an override positive control`);
      }
    } finally { await owner.auth.signOut(); }
    for (const role of ['finance', 'receiver', 'other_customer']) {
      const client = await login(role);
      try {
        const own = role === 'other_customer' ? customerB : customerA;
        const cross = role === 'other_customer' ? customerA : customerB;
        for (const table of ['quotation_lines', 'sales_order_lines']) {
          const direct = await client.from(table).select('override_reason').not('override_reason', 'is', 'null').limit(1);
          assert.ok(direct.error || direct.data?.length === 0, `${role} must not read ${table} internals`);
        }
        const safe = await client.rpc('customer_safe_quotation_lines', { target_revision_id: revisionFor(own) });
        const denied = await client.rpc('customer_safe_quotation_lines', { target_revision_id: revisionFor(cross) });
        assert.equal(safe.error, null);
        assert.ok(safe.data.length > 0);
        assert.ok(safe.data.every((line) => !('override_reason' in line) && !('override_by' in line) && !('pricing_rule_id' in line)));
        assert.ok(denied.error, 'cross-customer quote lines must be denied');
      } finally { await client.auth.signOut(); }
    }
  });
  await check('sales-finance-permission-boundary', async () => {
    const session = await browserSession('sales');
    try {
      const response = await session.context.request.get('/api/access/context');
      assert.equal(response.status(), 200);
      const body = await response.json();
      assert.ok(body.permissions.includes('orders.read'));
      for (const permission of ['finance.profit.read','inventory.cost.read','compensation.manage']) assert.ok(!body.permissions.includes(permission));
    } finally { await session.browser.close(); }
  });
  await check('worker-portal-assigned-job', async () => {
    const fixture = await (await import('./ensure-worker-uat.mjs')).ensureWorkerUat(sql);
    const client = await login('worker');
    try {
      const result = await client.rpc('worker_portal_snapshot');
      assert.equal(result.error, null);
      assert.equal(result.data.current?.id, fixture.id);
      assert.equal(result.data.current?.title, fixture.title);
    } finally { await client.auth.signOut(); }
    const session = await browserSession('worker');
    try { await session.page.getByText(fixture.title, { exact: true }).first().waitFor(); }
    finally { await session.browser.close(); }
  });
  await check('sales-backend-finance-denial',async()=> {
    const client=await login('sales');
    try {
      const result=await client.rpc('create_finance_account',{target_branch_id:id('branch-A'),account_code:'HXQA-DENIED',account_name:'HXQA forbidden account',account_kind:'CASH',operation_id:id('denied-account')});
      assert.ok(result.error,'sales must not create finance accounts through RPC');
      const forbidden=await client.from('customers').select('internal_note').eq('id',id('customer-1'));
      assert.ok(forbidden.error || forbidden.data.length===0,'cross-branch data must be denied');
    } finally { await client.auth.signOut(); }
  });
  await check('revoke-blocks-next-request', async () => {
    const session = await browserSession('sales');
    try {
      await sql`update public.employee_branch_access set active=false,revoked_at=now() where id=${id('access-sales-A')}`;
      const response = await session.context.request.get('/api/access/context');
      assert.ok([401,403].includes(response.status()), `unexpected status ${response.status()}`);
    } finally {
      await sql`update public.employee_branch_access set active=true,revoked_at=null where id=${id('access-sales-A')}`;
      await session.browser.close();
    }
  });
  await check('shared-device-logout-clears-storage', async () => {
    const session = await browserSession('sales');
    try {
      await session.page.evaluate(() => { localStorage.setItem('HXQA-sensitive','sentinel'); sessionStorage.setItem('HXQA-sensitive','sentinel'); });
      await session.page.locator('form[action="/auth/logout"] button').click();
      await session.page.waitForURL(url => url.pathname.includes('login') || url.pathname === '/');
      assert.equal(await session.page.evaluate(() => localStorage.getItem('HXQA-sensitive')), null);
      assert.equal(await session.page.evaluate(() => sessionStorage.getItem('HXQA-sensitive')), null);
      assert.equal((await session.context.request.get('/api/access/context')).status(), 401);
      await session.page.goto('/login');
      await session.page.locator('input[name=email]').fill(email('sales'));
      await session.page.locator('input[name=password]').fill(required('HX_QA_PASSWORD') + '-invalid');
      await session.page.locator('button[type=submit]').click();
      await session.page.getByRole('status').waitFor();
      assert.ok((await session.page.getByRole('status').innerText()).includes('Không thể đăng nhập'));
    } finally { await session.browser.close(); }
  });
} finally {
  await sql.end();
  const report = { status: results.some(r => r.status === 'FAIL') ? 'FAIL' : 'PARTIAL', results, humanUat: 'NOT_RUN', uncovered: ['field-level-payload-audit','recovery-email-delivery','full-human-journeys'] };
  if (process.env.HX_QA_NO_ARTIFACT === '1') console.log(JSON.stringify(report));
  else await artifact('uat-technical', report);
}
if (results.some(r => r.status === 'FAIL')) process.exitCode = 1;
