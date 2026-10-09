import assert from 'node:assert/strict';
import test from 'node:test';
import { masterValuesEqual } from './temporal_compare.mjs';
const eq = (a,b,type='numeric') => masterValuesEqual(a,b,type,'synthetic.numeric');
test('numeric scale is not a business conflict',()=>assert.equal(eq('50.000000','50'),true));
test('different numeric value conflicts',()=>assert.equal(eq('50.000001','50'),false));
test('large exact numeric preserves all digits',()=>{
 assert.equal(eq('9007199254740993.000000','9007199254740993'),true);
 assert.equal(eq('9007199254740993','9007199254740992'),false);
});
test('numeric NULL remains distinct from zero',()=>{
 assert.equal(eq(null,null),true);assert.equal(eq(null,'0'),false);
});
test('invalid numeric is controlled',()=>{
 for(const x of ['NaN','Infinity','50x',' 50',Number.MAX_SAFE_INTEGER+1])assert.throws(()=>eq(x,'50'),/IMPORT_NUMERIC_INVALID/);
});
test('ordinary string is still strict',()=>assert.equal(eq('50.000000','50','text'),false));
test('fractional numeric is exact',()=>assert.equal(eq('0.100000','0.1'),true));
