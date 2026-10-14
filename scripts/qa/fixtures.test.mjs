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
    await db.exec("create role anon nologin; create role authenticated nologin; create role service_role nologin; create schema extensions; create extension pgcrypto with schema extensions; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; create schema storage; create table storage.buckets(id text primary key,name text not null,public boolean not null default false,file_size_limit bigint,allowed_mime_types text[]); create table storage.objects(id uuid primary key default extensions.gen_random_uuid(),bucket_id text not null,name text not null,metadata jsonb not null default '{}'::jsonb,unique(bucket_id,name)); alter table storage.objects enable row level security; grant usage on schema storage to authenticated; grant select,insert,update,delete on storage.objects to authenticated;");
    for (const name of (await readdir('supabase/migrations')).filter(n => n.endsWith('.sql')).sort()) await db.exec(await readFile(`supabase/migrations/${name}`, 'utf8'));
    const users = Object.fromEntries(personas.map(role => [role, id(`auth-${role}`)]));
    for (const user of Object.values(users)) await db.query('insert into auth.users(id) values($1)', [user]);
    // The legacy performance dataset contains opening-balance writers. It must
    // not bypass current source authorization or partially seed posted facts.
    for (let attempt = 0; attempt < 2; attempt++) {
      await db.exec('begin');
      await assert.rejects(seedFixtures((text, params) => db.query(text, params), users),
        error => error.code === 'PT423' && error.message === 'opening_requires_pending_state');
      await db.exec('rollback');
    }
    for (const table of ['branches', 'sales_orders', 'payments', 'earning_events', 'deliveries']) {
      const { rows } = await db.query(`select count(*)::int as n from public.${table}`);
      assert.equal(rows[0].n, 0, `${table} must not retain partial legacy fixture facts`);
    }
  } finally { await db.close(); }
});
