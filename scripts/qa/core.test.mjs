import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guard, id, percentiles, PRODUCTION_REF } from './core.mjs';
const ref = 'abcdefghijklmnopqrst';
const valid = { HX_QA_RUNTIME_APPROVED: 'true', HX_QA_PROJECT_REF: ref, NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co` };
test('guard accepts exact QA URL and verified database', () => {
  assert.equal(guard({ ...valid, DATABASE_URL: `postgres://postgres:secret@db.${ref}.supabase.co/postgres` }).ref, ref);
  assert.equal(guard({ ...valid, DATABASE_URL: `postgres://postgres.${ref}:secret@aws-0-ap-northeast-2.pooler.supabase.com/postgres` }).ref, ref);
});
test('guard rejects production, ambiguous hosts, TLS bypass and capacity overrides', () => {
  for (const change of [
    { HX_QA_RUNTIME_APPROVED: 'false' }, { HX_QA_PROJECT_REF: PRODUCTION_REF },
    { NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co.attacker.test` },
    { DATABASE_URL: `postgres://postgres:secret@db.${PRODUCTION_REF}.supabase.co/postgres` },
    { DATABASE_URL: `postgres://postgres:secret@db.${ref}.supabase.co/postgres?sslmode=disable` },
    { HX_QA_MAX_DB_MB: '501' }, { HX_QA_MAX_DB_MB: 'NaN' }, { HX_EINVOICE_ENABLED: 'true' },
  ]) assert.throws(() => guard({ ...valid, ...change }));
});
test('deterministic IDs and percentiles include failed/slow samples', () => {
  assert.equal(id('owner'), id('owner'));
  assert.notEqual(id('owner'), id('sales'));
  assert.deepEqual(percentiles([{ ms: 1, ok: true }, { ms: 9000, ok: false }]), { samples: 2, errors: 1, p50: 1, p95: 9000, p99: 9000 });
});
