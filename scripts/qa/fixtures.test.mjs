import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { seedFixtures } from './fixtures.mjs';
import { personas, id } from './core.mjs';
test('legacy QA seed rejects unauthorized opening atomically on current migrations', async () => {
  const db = await PGlite.create({ extensions: { pgcrypto } });
  try {
    await db.exec("create role anon nologin; create role authenticated nologin; create role service_role nologin; create schema extensions; create extension pgcrypto with schema extensions; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;");
    for (const name of (await readdir('supabase/migrations')).filter(n => n.endsWith('.sql')).sort()) await db.exec(await readFile(`supabase/migrations/${name}`, 'utf8'));
    const users = Object.fromEntries(personas.map(role => [role, id(`auth-${role}`)]));
    for (const user of Object.values(users)) await db.query('insert into auth.users(id) values($1)', [user]);
    // The legacy performance dataset contains opening-balance writers. It must
    // not bypass current source authorization or partially seed posted facts.
    for (let attempt = 0; attempt < 2; attempt++) {
      await db.exec('begin');
      await assert.rejects(seedFixtures((text, params) => db.query(text, params), users),
        error => error.code === '42501' && error.message === 'opening_authorization_required');
      await db.exec('rollback');
    }
    for (const table of ['branches', 'sales_orders', 'payments', 'earning_events', 'deliveries']) {
      const { rows } = await db.query(`select count(*)::int as n from public.${table}`);
      assert.equal(rows[0].n, 0, `${table} must not retain partial legacy fixture facts`);
    }
  } finally { await db.close(); }
});
