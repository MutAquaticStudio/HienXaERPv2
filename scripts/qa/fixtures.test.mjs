import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { seedFixtures } from './fixtures.mjs';
import { personas, id } from './core.mjs';
test('QA seed replays idempotently against real migrations and isolates branches', async () => {
  const db = await PGlite.create({ extensions: { pgcrypto } });
  try {
    await db.exec("create role anon nologin; create role authenticated nologin; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;");
    for (const name of (await readdir('supabase/migrations')).filter(n => n.endsWith('.sql')).sort()) await db.exec(await readFile(`supabase/migrations/${name}`, 'utf8'));
    const users = Object.fromEntries(personas.map(role => [role, id(`auth-${role}`)]));
    for (const user of Object.values(users)) await db.query('insert into auth.users(id) values($1)', [user]);
    await seedFixtures((text, params) => db.query(text,params), users);
    await seedFixtures((text, params) => db.query(text,params), users);
    assert.equal((await db.query('select count(*)::int as n from public.sales_order_lines')).rows[0].n, 500);
    assert.equal((await db.query('select count(*)::int as n from public.payments')).rows[0].n, 200);
    assert.equal((await db.query('select count(*)::int as n from public.earning_events')).rows[0].n, 200);
    assert.equal((await db.query('select count(*)::int as n from public.deliveries')).rows[0].n, 150);
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [users.sales]);
    const branches = await db.query('select code from public.branches');
    assert.deepEqual(branches.rows, [{ code: 'HXQA-A' }]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [users.worker]);
    const worker = (await db.query('select public.worker_portal_snapshot() as snapshot')).rows[0].snapshot;
    assert.equal(worker.employee.id, id('employee-worker'));
    assert.equal(worker.current.id, id('work'));
  } finally { await db.close(); }
});
