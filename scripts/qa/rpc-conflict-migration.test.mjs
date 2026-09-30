import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { database } from './core.mjs';

const names = [
  'apply_route_plan', 'approve_earning_event', 'approve_expense', 'approve_invoice_business',
  'approve_stock_count', 'assign_delivery', 'assign_work_item', 'cancel_invoice_draft',
  'cancel_planned_delivery', 'cancel_scheduled_service_job', 'claim_work_item',
  'create_route_plan', 'handoff_delivery', 'mark_delivery_arrived', 'record_gps_ping',
  'record_stock_count_line', 'release_inventory_reservation', 'request_quotation_change',
  'resolve_return_case', 'review_payment_notice', 'start_work_item', 'submit_delivery_result',
  'submit_work_result', 'upsert_supply_allocation', 'verify_delivery', 'verify_service_job',
];
const migrationUrl = new URL('../../supabase/migrations/20260930101520_custom_rpc_conflicts.sql', import.meta.url);

async function catalog(sql) {
  return sql`
    select p.oid, p.proname, pg_get_functiondef(p.oid) as definition,
      p.proowner::text as owner, p.proacl::text as acl, p.proconfig,
      p.prosecdef, p.provolatile, p.proparallel, p.proisstrict
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and p.proname = any(${names})
    order by p.proname, p.oid
  `;
}

test('custom conflict migration preserves definitions/access, is replay-safe and rejects unknown scope', {
  skip: process.env.HX_QA_RUNTIME_APPROVED !== 'true',
  timeout: 60000,
}, async () => {
  const sql = await database();
  const migration = await readFile(migrationUrl, 'utf8');
  const rollback = new Error('QA_REHEARSAL_ROLLBACK');
  try {
    await assert.rejects(sql.begin(async tx => {
      const before = await catalog(tx);
      assert.ok(before.length === 24 || before.length === 26);
      // Reproduce the old error codes only inside a transaction that is rolled back.
      let sites = 0;
      for (const row of before) {
        const matches = row.definition.match(/errcode\s*=\s*'PT409'/gi) ?? [];
        sites += matches.length;
        if (matches.length) {
          await tx.unsafe(row.definition.replace(/errcode\s*=\s*'PT409'/gi, "errcode = '40001'"));
        }
      }
      assert.ok(sites >= 27, 'the stale-command regression must actually be reproduced');
      await tx.unsafe(migration);
      assert.deepEqual(await catalog(tx), before, 'only the custom error code may change');
      const remaining = await tx`
        select count(*)::int as count from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prokind = 'f'
          and pg_get_functiondef(p.oid) ~* $re$errcode[[:space:]]*=[[:space:]]*'40001'$re$
      `;
      assert.equal(remaining[0].count, 0);
      await tx.unsafe(migration);
      assert.deepEqual(await catalog(tx), before, 'replay must be a no-op');
      await assert.rejects(tx.savepoint(async nested => {
        await nested.unsafe("create function public.hxqa_unexpected_conflict_probe() returns void language plpgsql as $$ begin raise exception 'probe' using errcode = '40001'; end $$");
        await nested.unsafe(migration);
      }), /Unexpected custom 40001 RPC: hxqa_unexpected_conflict_probe/);
      assert.deepEqual(await catalog(tx), before, 'scope rejection must not alter existing RPCs');
      throw rollback;
    }), error => error === rollback);
  } finally {
    await sql.end();
  }
});
