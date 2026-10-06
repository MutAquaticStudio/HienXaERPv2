import assert from 'node:assert/strict';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { readViewCatalog, prepareViewReference, compareViewCatalog } from './reconciliation-view-catalog.mjs';

const db = await PGlite.create();
const sql = { unsafe: async (text, params = []) => params.length
  ? (await db.query(text, params)).rows : (await db.exec(text)).at(-1)?.rows ?? [] };
sql.begin = async (callback) => {
  await db.exec('begin');
  try { const result = await callback(sql); await db.exec('commit'); return result; }
  catch (error) { await db.exec('rollback'); throw error; }
};
const names = [{ schema: 'public', name: 'hx_view_contract' }];
const definition = 'select id, amount from public.hx_view_source where amount >= 0';
await db.exec(`create role authenticated;
  create table public.hx_view_source(id integer,amount numeric(18,0));
  create view public.hx_view_contract with(security_invoker=true) as ${definition};
  grant select on public.hx_view_contract to authenticated`);
const read = () => readViewCatalog((text) => sql.unsafe(text), names);
const reference = await prepareViewReference(sql, [{ ...names[0], definition }], await read());

test('same-engine identical view matches including dependencies/access/column contract', async () => {
  assert.deepEqual(compareViewCatalog(await read(), reference), { status: 'MATCH', differences: [] });
});
test('changed WHERE is a semantic mismatch', async () => {
  await db.exec('create or replace view public.hx_view_contract with(security_invoker=true) as select id,amount from public.hx_view_source where amount > 0');
  const result = compareViewCatalog(await read(), reference);
  assert.equal(result.status, 'MISMATCH');
  assert.ok(result.differences.includes('public.hx_view_contract:canonical_definition'));
  await db.exec(`create or replace view public.hx_view_contract with(security_invoker=true) as ${definition}`);
});
test('changed type and column order are both detected', async () => {
  await db.exec(`drop view public.hx_view_contract;
    create view public.hx_view_contract with(security_invoker=true) as select amount::text as amount,id from public.hx_view_source where amount >= 0;
    grant select on public.hx_view_contract to authenticated`);
  const result = compareViewCatalog(await read(), reference);
  assert.equal(result.status, 'MISMATCH');
  assert.ok(result.differences.includes('public.hx_view_contract:columns'));
  await db.exec(`drop view public.hx_view_contract;
    create view public.hx_view_contract with(security_invoker=true) as ${definition};
    grant select on public.hx_view_contract to authenticated`);
});
test('grant and security options cannot disappear during normalization', async () => {
  await db.exec('revoke select on public.hx_view_contract from authenticated; alter view public.hx_view_contract set(security_invoker=false,security_barrier=true)');
  const result = compareViewCatalog(await read(), reference);
  assert.equal(result.status, 'MISMATCH');
  assert.ok(result.differences.includes('public.hx_view_contract:grants'));
  assert.ok(result.differences.includes('public.hx_view_contract:options'));
});
test('different engine and missing reference remain unresolved', async () => {
  const current = await read();
  const otherEngine = reference.map((view) => ({ ...view, server_version_num: '170006' }));
  assert.equal(compareViewCatalog(current, otherEngine).status, 'UNRESOLVED');
  assert.equal(compareViewCatalog(current).status, 'UNRESOLVED');
});
test.after(async () => { await db.close(); });
