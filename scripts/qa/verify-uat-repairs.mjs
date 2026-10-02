import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { database, artifact, guard } from './core.mjs';

guard();
const sql = await database();
const checks = [];
try {
  const migrationFile = '20260927205002_uat_earning_read_boundary.sql';
  const migration = await readFile(new URL(`../../supabase/migrations/${migrationFile}`, import.meta.url), 'utf8');
  if (process.argv.includes('--apply')) {
    await sql.begin(async tx => {
      const existing = await tx`select version from supabase_migrations.schema_migrations where version = '20260927205002'`;
      if (!existing.length) {
        await tx.unsafe(migration);
        await tx`insert into supabase_migrations.schema_migrations(version, name, statements) values ('20260927205002', 'uat_earning_read_boundary', ${[migration]})`;
      }
    });
  }
  const users = await sql`select u.id, u.email, e.id as employee_id from auth.users u join public.employees e on e.auth_user_id=u.id where u.email in ('hxqa-owner@example.test','hxqa-worker@example.test','hxqa-sales@example.test')`;
  const owner = users.find(u => u.email === 'hxqa-owner@example.test');
  const worker = users.find(u => u.email === 'hxqa-worker@example.test');
  assert.ok(owner && worker, 'QA owner and worker fixtures are required');
  const earnings = await sql`select id,employee_id from public.earning_events`;
  const own = earnings.find(e => e.employee_id === worker.employee_id);
  const other = earnings.find(e => e.employee_id !== worker.employee_id);
  assert.ok(own && other, 'own and other employee earnings are required');
  async function asUser(id, query) {
    return sql.begin(async tx => {
      await tx`select set_config('request.jwt.claim.sub', ${id}, true)`;
      await tx.unsafe('set local role authenticated');
      return query(tx);
    });
  }
  const ownerRows = await asUser(owner.id, tx => tx`select id,outstanding_amount_vnd from public.earning_event_read`);
  assert.ok(ownerRows.some(e => e.id === own.id) && ownerRows.some(e => e.id === other.id));
  checks.push('owner reads earning view including outstanding balance');
  const workerRows = await asUser(worker.id, tx => tx`select id,employee_id,outstanding_amount_vnd from public.earning_event_read`);
  assert.ok(workerRows.length > 0);
  assert.ok(workerRows.every(e => e.employee_id === worker.employee_id));
  checks.push('worker reads own earnings only');
  for (const actor of [worker.id, '00000000-0000-4000-8000-000000000001']) {
    await assert.rejects(asUser(actor, tx => tx`select private.earning_payable_outstanding(${other.id}::uuid)`), { code: '42501' });
  }
  checks.push('other employee and authenticated user without employee cannot call balance helper');
  const [privileges] = await sql`select has_function_privilege('authenticated','private.current_payable_outstanding(uuid)','EXECUTE') as raw, has_function_privilege('anon','private.earning_payable_outstanding(uuid)','EXECUTE') as anonymous`;
  assert.equal(privileges.raw, false);
  assert.equal(privileges.anonymous, false);
  checks.push('unrestricted payable helper and anonymous access remain denied');
  await artifact('uat-repair-db', { status: 'PASS', checks, ownerRows: ownerRows.length, workerRows: workerRows.length });
} finally {
  await sql.end();
}
