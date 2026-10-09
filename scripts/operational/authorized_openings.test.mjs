import test from 'node:test';
import assert from 'node:assert/strict';
import {captureOpeningWriterPayload} from './authorized_openings.mjs';

const branch='53d89826-079b-4f51-928c-0a7bf285c35b';
const payload={
 branch_id:branch,source_ref:'SYN_CAPTURE_REGRESSION',amount_vnd:'9007199254740993',
 base_quantity:'1.234567',nested:{note:'{"legitimate":"user string"}',flag:true,value:null,items:[1,'2']}
};
test('serialized writer object becomes exact manifest object',()=>{
 assert.deepEqual(captureOpeningWriterPayload(JSON.stringify(payload)),payload);
});
test('serialized payload preserves branch-scoped manifest selection',()=>{
 const manifest=[{kind:'FINANCE',payload:captureOpeningWriterPayload(JSON.stringify(payload))}];
 assert.equal(manifest.filter(m=>m.payload.branch_id===branch).length,1);
 assert.equal(manifest.filter(m=>m.payload.branch_id==='foreign-branch').length,0);
});
test('native object is captured without mutating input',()=>{
 const captured=captureOpeningWriterPayload(payload);
 assert.deepEqual(captured,payload);
 assert.notEqual(captured,payload);
 captured.nested.items.push('changed');
 assert.equal(payload.nested.items.length,2);
});
test('exact money, quantity and legitimate user strings are retained',()=>{
 const captured=captureOpeningWriterPayload(JSON.stringify(payload));
 assert.equal(captured.amount_vnd,'9007199254740993');
 assert.equal(captured.base_quantity,'1.234567');
 assert.equal(captured.nested.note,'{"legitimate":"user string"}');
 assert.equal(captured.nested.value,null);
});
test('malformed serialized JSON is controlled validation failure',()=>{
 assert.throws(()=>captureOpeningWriterPayload('{"branch_id":'),{message:'OPENING_WRITER_PAYLOAD_INVALID_JSON'});
});
test('JSON scalar documents are not accepted as outer writer objects',()=>{
 for(const input of ['null','1','true','"text"',JSON.stringify(JSON.stringify(payload))])
  assert.throws(()=>captureOpeningWriterPayload(input),{message:'OPENING_WRITER_PAYLOAD_OBJECT_REQUIRED'});
});
test('native nonobjects are rejected',()=>{
 for(const input of [null,undefined,1,true])
  assert.throws(()=>captureOpeningWriterPayload(input),{message:'OPENING_WRITER_PAYLOAD_OBJECT_REQUIRED'});
});
test('outer arrays are rejected while nested arrays are preserved',()=>{
 for(const input of [[],JSON.stringify([payload])])
  assert.throws(()=>captureOpeningWriterPayload(input),{message:'OPENING_WRITER_PAYLOAD_OBJECT_REQUIRED'});
 assert.deepEqual(captureOpeningWriterPayload(JSON.stringify(payload)).nested.items,[1,'2']);
});
