import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const script = new URL('./reconcile-current-candidate.mjs', import.meta.url);
const scenarios = [
  { name: 'missing local URL never falls back to managed DATABASE_URL', url: '', reason: 'BLOCKED_LOCAL_NATIVE_ENV:HX_LOCAL_RECONCILE_DATABASE_URL_missing' },
  { name: 'non-loopback target is rejected before connection', url: 'postgres://fixture:synthetic@qa.example.invalid/hx_qa_reconcile_guard', reason: 'local_disposable_target_required' },
  { name: 'existing/default database name is rejected before connection', url: 'postgres://fixture:synthetic@127.0.0.1/postgres', reason: 'local_disposable_target_required' },
];
for (const scenario of scenarios) {
  test(scenario.name, () => {
    const result = spawnSync(process.execPath, [script.pathname, '--preflight-local'], {
      encoding: 'utf8', timeout: 10000,
      env: { ...process.env, DATABASE_URL: 'postgres://never-use-managed.invalid/postgres',
        HX_LOCAL_RECONCILE_DATABASE_URL: scenario.url, HX_LOCAL_DISPOSABLE_RECONCILIATION: '1' },
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stderr.trim()).reason, scenario.reason);
  });
}
