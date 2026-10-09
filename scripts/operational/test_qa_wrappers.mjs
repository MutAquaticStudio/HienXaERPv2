import assert from 'node:assert/strict';
import test from 'node:test';
import { postgresAdapter, assertIndependentReadback } from './qa_postgres_adapter.mjs';

export const jsonCases = [
  { name: 'object', value: { a: 1 }, type: 'object' },
  { name: 'nested', value: { nested: { values: [1, { ok: true }, null] } }, type: 'object' },
  { name: 'boolean', value: true, type: 'boolean' },
  { name: 'null_inside', value: { nullable: null }, type: 'object' },
  { name: 'numbers', value: { integer: 123, decimal: 0.125 }, type: 'object' },
  { name: 'uuid', value: { id: '11111111-1111-4111-8111-111111111111' }, type: 'object' },
  { name: 'user_string', value: { field: '{"a":1}', label: 'literal user text' }, type: 'object' },
];

for (const fixture of jsonCases) test('single serialization: ' + fixture.name, async () => {
  let sent;
  const adapter = postgresAdapter({ json: value => ({ jsonValue: value }), unsafe: async (_sql, args) => { sent = args; return []; } });
  await adapter.query('select $1::jsonb, $2::text', [JSON.stringify(fixture.value), '{"leave":"text"}']);
  assert.deepEqual(JSON.parse(JSON.stringify(sent[0].jsonValue)), fixture.value);
  assert.equal(sent[1], '{"leave":"text"}');
});

test('native object is not decoded again', async () => {
  const value = { field: '{"a":1}' };
  await postgresAdapter({ json: x => { assert.equal(x, value); return x; }, unsafe: async () => [] }).query('select $1::jsonb', [value]);
});

for (const pid of [100, 200]) test('fresh logical client accepted with PID ' + pid, () => {
  assertIndependentReadback({ client: { pid: 100 }, transactionEnded: true, closed: true }, { pid });
});
test('reused client rejected', () => {
  const client = {};
  assert.throws(() => assertIndependentReadback({ client, transactionEnded: true, closed: true }, client), /new logical client/);
});
test('uncommitted writer rejected', () => {
  assert.throws(() => assertIndependentReadback({ client: {}, transactionEnded: false, closed: true }, {}), /transaction must have ended/);
});
test('unreleased writer rejected', () => {
  assert.throws(() => assertIndependentReadback({ client: {}, transactionEnded: true, closed: false }, {}), /must be closed/);
});
