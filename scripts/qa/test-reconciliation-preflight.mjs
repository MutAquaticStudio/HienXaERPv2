import test from 'node:test';
import assert from 'node:assert/strict';
import { migrationFiles, pendingMigrations, plan, sha256, transactionBody } from './reconcile-current-candidate.mjs';

const files = await migrationFiles();
const delta = new Set(plan.executionOrder.map(f=>f.version));
const history = files.filter(f=>!delta.has(f.version)).map(f=>({version:f.version,name:f.name,statements:null}));
history.push({version:plan.extraVersion,name:'external',statements:['original external provenance unavailable']});

test('forward order uses real candidate files and exact checksums',()=>{
  const pending=pendingMigrations(files,{history});
  assert.deepEqual(pending.map(f=>f.version),plan.executionOrder.map(f=>f.version));
  for(const f of pending) assert.equal(sha256(f.raw),f.sha256);
});
test('original unavailable checksums remain unavailable, not falsely validated',()=>{
  assert.ok(history.some(h=>h.statements===null));
  assert.equal(pendingMigrations(files,{history}).length,plan.executionOrder.length);
  assert.ok(plan.historyProvenance.includes('UNKNOWN_HISTORICAL_CHECKSUM'));
});
test('unknown extra history blocks instead of being silently removed',()=>{
  assert.throws(()=>pendingMigrations(files,{history:[...history,{version:'19000101000000'}]}),/unexpected_history_version/);
});
test('missing prerequisite outside approved delta blocks',()=>{
  assert.throws(()=>pendingMigrations(files,{history:history.slice(1)}),/unapproved_missing_migration/);
});
test('second run skips only exact recorded candidate statements',()=>{
  const all=[...history,...files.filter(f=>delta.has(f.version)).map(f=>({version:f.version,name:f.name,statements:[f.raw]}))];
  assert.deepEqual(pendingMigrations(files,{history:all}),[]);
});
test('same version different contents does not receive a checksum pass',()=>{
  const f=files.find(f=>delta.has(f.version));
  assert.throws(()=>pendingMigrations(files,{history:[...history,{version:f.version,name:f.name,statements:['select 1;']}]}),/applied_delta_checksum_unverified/);
});
test('transaction wrapper removed without stripping internal PLPGSQL begin',()=>{
  assert.equal(transactionBody('-- approved\nbegin;\ndo $$ begin perform 1; end $$;\ncommit;'),'\ndo $$ begin perform 1; end $$;\n');
  assert.equal(transactionBody('do $$ begin perform 1; end $$;'),'do $$ begin perform 1; end $$;');
});
test('unmatched explicit transaction is rejected',()=>{
  assert.throws(()=>transactionBody('begin; select 1;'),/unmatched_migration_transaction/);
});
test('canonical patch records no posted-business mutation or historical repair',()=>{
  assert.equal(plan.postedBusinessMutation,false);
  assert.equal(plan.managedApplyAuthorized,false);
  assert.equal(plan.historicalRepair,'APPLY_BLOCKED_POLICY');
});
