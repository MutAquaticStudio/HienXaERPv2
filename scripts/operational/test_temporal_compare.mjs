import assert from 'node:assert/strict';
import test from 'node:test';
import {canonicalTemporal,masterValuesEqual} from './temporal_compare.mjs';

const utc='2026-10-14T17:00:00.000Z';
const eq=(a,b,type='timestamptz')=>masterValuesEqual(a,b,type,'synthetic.field');
test('Date equals ISO UTC',()=>assert.equal(eq(new Date(utc),utc),true));
test('Date equals offset ISO',()=>assert.equal(eq(new Date(utc),'2026-10-15T00:00:00+07:00'),true));
test('different instants conflict',()=>assert.equal(eq(utc,'2026-10-14T17:00:01Z'),false));
test('NULL equals NULL',()=>assert.equal(eq(null,null),true));
test('NULL differs from valid timestamp',()=>assert.equal(eq(null,utc),false));
test('invalid ISO has controlled validation error',()=>{
 for(const x of ['bad','2026-02-30T00:00:00Z','2026-01-01T24:00:00Z','2026-01-01T00:00:00+07:99',undefined])
  assert.throws(()=>eq(x,utc),/IMPORT_TEMPORAL_INVALID/);
});
test('meaningful microseconds are not discarded',()=>{
 assert.equal(eq('2026-10-14 17:00:00.123456+00','2026-10-15T00:00:00.123456+07:00'),true);
 assert.equal(eq('2026-10-14T17:00:00.123456Z','2026-10-14T17:00:00.123457Z'),false);
 assert.equal(eq(new Date('2026-10-14T17:00:00.123Z'),'2026-10-14T17:00:00.123456Z'),false);
 assert.throws(()=>eq('2026-10-14T17:00:00.1234567Z',utc),/IMPORT_TEMPORAL_INVALID/);
});
test('zone-less timestamp preserves wall clock',()=>{
 assert.equal(eq('2026-10-14 17:00:00.123456','2026-10-14T17:00:00.123456','timestamp'),true);
 assert.equal(eq('2026-10-14T17:00:00','2026-10-15T00:00:00','timestamp'),false);
 assert.throws(()=>eq('2026-10-14T17:00:00Z','2026-10-14T17:00:00','timestamp'),/IMPORT_TEMPORAL_INVALID/);
});
test('date-only stays date-only',()=>{
 assert.equal(eq('2026-10-14','2026-10-14','date'),true);
 assert.equal(eq('2026-10-14','2026-10-15','date'),false);
 assert.throws(()=>canonicalTemporal(new Date(utc),'date'),/IMPORT_TEMPORAL_INVALID/);
 assert.throws(()=>canonicalTemporal('2026-10-14','timestamptz'),/IMPORT_TEMPORAL_INVALID/);
});
test('ordinary strings are not normalized as dates',()=>{
 assert.equal(eq(utc,'2026-10-15T00:00:00+07:00','text'),false);
 assert.equal(eq(' 123','123','text'),false);
});
