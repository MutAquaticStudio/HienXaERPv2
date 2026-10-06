import assert from 'node:assert/strict';
import { test } from 'node:test';
import { migrationBody, migrationManifest, migrationParity } from './migration-manifest.mjs';
test('manifest validates exact statement bytes, not just count', async () => {
  const manifest = await migrationManifest();
  const rows = manifest.migrations.map(m => ({ version: m.version, statements: [m.sql] }));
  assert.equal(migrationParity(manifest, rows).result, 'PASS');
  const changed = structuredClone(rows); changed[0].statements[0] += '\n-- changed';
  assert.equal(migrationParity(manifest, changed).different.length, 1);
  assert.equal(migrationParity(manifest, rows.slice(1)).missing.length, 1);
  assert.deepEqual(migrationParity(manifest, [...rows, {version:'99999999999999',statements:['select 1;']}]).extra, ['99999999999999']);
});
test('missing or split SQL is explicitly unverifiable', async () => {
  const manifest = await migrationManifest();
  const rows = manifest.migrations.map(m => ({version:m.version,statements:[]}));
  assert.equal(migrationParity(manifest, rows).unverifiable.length, rows.length);
  assert.equal(migrationParity(manifest, rows).result, 'BLOCKED_ENV');
});
test('only reviewed outer transaction envelopes are stripped', () => {
  const body = '-- note\nbegin;\ncreate function f() returns void language plpgsql as $$ begin null; end $$;\ncommit;\n';
  assert.match(migrationBody(body), /\$\$ begin null; end \$\$/);
  assert.doesNotMatch(migrationBody(body), /^begin;/im);
  assert.throws(() => migrationBody('select 1;\nCOMMIT;'), /Unreviewed/);
});
