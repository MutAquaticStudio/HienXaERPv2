// Explicit QA-only committed acceptance. Never deletes posted fixtures or retries
// an uncertain commit. Run/output identity is persisted before any mutation.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { database, guard } from '../qa/core.mjs';
import { importOpenings } from './import_openings.mjs';
import { postgresAdapter, assertIndependentReadback } from './qa_postgres_adapter.mjs';
import { masterValuesEqual } from './temporal_compare.mjs';

assert.equal(guard().ref, 'ffrwiglcrlumfvhubaxg');
assert.equal(process.env.OPTRANS_QA_COMMIT_APPROVED, 'true');
const out = process.argv[2];
assert.ok(out && path.isAbsolute(out), 'Explicit evidence directory required');
const digest = x => createHash('sha256').update(x).digest('hex');
const raw = await fs.readFile(new URL('../../supabase/migrations/20261008224033_operational_opening_sources.sql', import.meta.url), 'utf8');
const migrationHash = digest(raw);
assert.equal(migrationHash, '5ea93da878981186fe6273ef887adcc052f04c35530cfa924ec9d144cebd9994');
const start = raw.indexOf('\nbegin;\n'), end = raw.lastIndexOf('\ncommit;');
assert.ok(start > 0 && end > start);
assert.match(raw.slice(0, start), /^(?:--[^\n]*\n?)+$/);
assert.equal(raw.slice(end).trim(), 'commit;');
const pkg = JSON.parse(await fs.readFile(path.join(out, 'parsed-source.json'), 'utf8'));
assert.equal(pkg.source_rows, 32);
const runId = 'OPTRANS-QA-SYNTHETIC-' + new Date().toISOString().replace(/[-:.]/g, '');
const report = { runId, target: guard().ref, migrationHash, sourceSha256: pkg.source_sha256, checks: [], failures: [],
  productionConnection: 'NONE', productionWrites: 0, excludeFromRealCutover: true, cleanup: 'RETAIN_POSTED_QA_HISTORY_NO_AD_HOC_DELETE',
  operationA: randomUUID(), operationB: randomUUID(), authFixtureIds: [], transaction: 'NOT_STARTED' };
// Runtime provenance only; the canonical 32 source rows and source hash are unchanged.
pkg.meta.qa_run_id = runId;
const reportPath = path.join(out, runId + '.json');
const manifestPath = path.join(out, runId + '-fixture-manifest.json');
const save = async () => {
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  await fs.writeFile(manifestPath, JSON.stringify({ runId, target: report.target, sourceSha256: report.sourceSha256,
    operationA: report.operationA, operationB: report.operationB, authFixtureIds: report.authFixtureIds,
    result: report.result ?? null, transaction: report.transaction, excludeFromRealCutover: true, cleanup: report.cleanup }, null, 2));
};
const pass = (name, details = {}) => report.checks.push({ name, status: 'PASS', ...details });
const check = async (name, fn) => {
  try { await fn(); pass(name); } catch (e) { report.failures.push({ name, code: e.code ?? null, message: e.message }); }
  await save();
};
const tables = ['inventory_opening_sources', 'cash_opening_balances', 'opening_balance_sources', 'inventory_movements',
  'receivable_obligations', 'payable_obligations', 'payments', 'revenue_entries', 'direct_cost_entries', 'earning_events',
  'sales_orders', 'purchase_orders', 'deliveries'];
const noFake = ['payments', 'revenue_entries', 'direct_cost_entries', 'earning_events', 'sales_orders', 'purchase_orders', 'deliveries'];
let branchIds, options, ownerRole, readerEmployee;
async function snapshot(tx) {
  const result = {};
  for (const table of tables) result[table] = (await tx.unsafe(`select count(*)::int n, md5(coalesce(string_agg(to_jsonb(t)::text,'|' order by t.id),'')) hash from public.${table} t where branch_id=any($1::uuid[])`, [branchIds]))[0];
  return result;
}
async function readers(tx) {
  await tx.unsafe("select set_config('request.jwt.claim.sub',$1,true)", [options.actorId]);
  await tx.unsafe('set local role authenticated');
  const result = {};
  const queries = {
    inventory: 'select sum(inventory_value_vnd::numeric)::text value from public.warehouse_inventory_read',
    transit: 'select sum(inventory_value_vnd::numeric)::text value from public.inventory_opening_transit_read',
    ar: 'select sum(outstanding_amount_vnd::numeric)::text value from public.receivable_read',
    supplierAp: 'select sum(outstanding_amount_vnd::numeric)::text value from public.payable_read where supplier_id is not null',
    employeePayable: 'select sum(outstanding_amount_vnd::numeric)::text value from public.payable_read where employee_id is not null',
    cash: 'select sum(amount_vnd::numeric)::text value from public.cash_opening_read',
  };
  for (const [key, query] of Object.entries(queries)) result[key] = (await tx.unsafe(query))[0].value;
  report.quantities = Array.from(await tx.unsafe('select w.code warehouse,m.code material,u.code base_uom,r.on_hand_base_quantity::text quantity,r.inventory_value_vnd::text value from public.warehouse_inventory_read r join public.warehouses w on w.id=r.warehouse_id join public.materials m on m.id=r.material_id join public.units_of_measure u on u.id=r.base_uom_id order by m.code'));
  await tx.unsafe('reset role');
  return result;
}
const expected = { inventory: '171025', transit: '75013', ar: '750000', supplierAp: '350000', employeePayable: '80000', cash: '2000000' };
await save();
const writer = await database();
try {
  await writer.begin(async tx => {
    await tx.unsafe("set local lock_timeout='5s';set local statement_timeout='30s';set local idle_in_transaction_session_timeout='60s'");
    report.writerPid = (await tx.unsafe('select pg_backend_pid() pid'))[0].pid;
    assert.equal((await tx.unsafe("select count(*)::int n from supabase_migrations.schema_migrations where version='20261008224033'"))[0].n, 0);
    assert.equal((await tx.unsafe("select to_regclass('private.operational_import_receipts') relation"))[0].relation, null);
    assert.equal((await tx.unsafe("select count(*)::int n from public.branches where code in ('SYN_A','SYN_B')"))[0].n, 0);
    report.unrelatedHistoryBefore = (await tx.unsafe("select md5(string_agg(to_jsonb(h)::text,'|' order by version)) hash from supabase_migrations.schema_migrations h"))[0].hash;
    const metadata = await tx.unsafe("select column_name,data_type,datetime_precision from information_schema.columns where table_schema='public' and table_name='employees' and column_name='deactivated_at'");
    assert.equal(metadata[0].data_type, 'timestamp with time zone');
    assert.equal(metadata[0].datetime_precision, 6);
    report.temporalColumn = metadata[0];
    const [precision] = await tx.unsafe("select '2026-10-14 17:00:00.123456+00'::timestamptz stamp,('2026-10-14 17:00:00.123456+00'::timestamptz)::text exact");
    assert.equal(masterValuesEqual(precision.exact, '2026-10-15T00:00:00.123456+07:00', 'timestamptz'), true);
    assert.equal(masterValuesEqual(precision.exact, '2026-10-14T17:00:00.123457Z', 'timestamptz'), false);
    report.precisionProbe = { text: precision.exact, driverDate: precision.stamp, type: 'timestamptz(6)' };
    pass('POSTGRES_MICROSECOND_PRECISION_RETAINED');
    await tx.unsafe(raw.slice(start + 8, end));
    const roleCodes = { Sales: 'hxqa_sales', Worker: 'hxqa_worker', Finance: 'hxqa_mb_finance_employee_a89838c9' };
    [ownerRole] = await tx.unsafe("select id from public.roles where code='hxqa_owner' and active");
    assert.ok(ownerRole);
    const actorId = randomUUID(); readerEmployee = randomUUID();
    report.authFixtureIds.push(actorId);
    await tx.unsafe('insert into auth.users(id) values($1)', [actorId]);
    await tx.unsafe('insert into public.employees(id,auth_user_id,code,display_name) values($1,$2,$3,$4)',
      [readerEmployee, actorId, 'OPTRANS_QA_' + actorId.slice(0, 8).toUpperCase(), runId]);
    const bindings = { employees: {}, transitUnitCosts: { SYN_SOURCE_O_01: '1500.25' } };
    for (const row of pkg.tables.B) {
      const [role] = await tx.unsafe('select id from public.roles where code=$1 and active', [roleCodes[row.job_role]]);
      assert.ok(role);
      const authUserId = randomUUID(); report.authFixtureIds.push(authUserId);
      await tx.unsafe('insert into auth.users(id) values($1)', [authUserId]);
      bindings.employees[row.employee_code] = { authUserId, roleId: role.id };
    }
    options = { actorId, bindings, operationId: report.operationA, mode: 'OPENINGS_AND_TRANSIT_ONLY' };
    report.result = await importOpenings(postgresAdapter(tx), pkg, options);
    assert.equal(report.result.acceptedMasterOpeningRows, 25);
    assert.equal(report.result.openDocumentRowsHeld, 6);
    assert.equal(report.result.workRowsCustodyOnly.length, 1);
    branchIds = report.result.entities.filter(x => x.section === 'A').map(x => x.id);
    await tx.unsafe('insert into public.employee_branch_access(employee_id,branch_id,role_id) select $1,id,$2 from public.branches where id=any($3::uuid[])', [readerEmployee, ownerRole.id, branchIds]);
    report.beforeCommit = await snapshot(tx);
    assert.deepEqual(await readers(tx), expected);
    for (const table of noFake) assert.equal(report.beforeCommit[table].n, 0, table);
    await tx.unsafe('insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,array[$3::text])', ['20261008224033', 'operational_opening_sources', raw]);
    report.transaction = 'COMMIT_PENDING'; await save();
  });
  report.transaction = 'COMMITTED';
  pass('ACTUAL_IMPORT_OPERATION_A_COMMITTED');
} catch (e) {
  report.transaction = report.transaction === 'COMMIT_PENDING' ? 'UNKNOWN_REQUIRES_READBACK_NO_RETRY' : 'FAILED_NO_RETRY';
  report.failures.push({ name: 'INITIAL_IMPORT', code: e.code ?? null, message: e.message });
} finally { await writer.end({ timeout: 5 }); await save(); }

const readback = await database();
try {
  report.lifecycle = assertIndependentReadback({ client: writer, transactionEnded: true, closed: true }, readback);
  await readback.begin(async tx => {
    await tx.unsafe('set transaction read only');
    report.readbackPid = (await tx.unsafe('select pg_backend_pid() pid'))[0].pid;
    if (!branchIds) throw Error('NO_COMMITTED_RESULT_TO_CLASSIFY');
    const receipts = await tx.unsafe('select source_sha256,result,source_payload->\'meta\'->>\'qa_run_id\' run_id from private.operational_import_receipts where operation_id=$1', [report.operationA]);
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0].source_sha256, pkg.source_sha256);
    assert.equal(receipts[0].run_id, runId);
    assert.deepEqual(receipts[0].result, report.result);
    report.afterCommit = await snapshot(tx);
    assert.deepEqual(report.afterCommit, report.beforeCommit);
    report.totals = await readers(tx); assert.deepEqual(report.totals, expected);
    assert.deepEqual(report.quantities, [
      { warehouse: 'SYN_WH_A', material: 'SYN_CEMENT', base_uom: 'syn_kg', quantity: '100.000000', value: '150025' },
      { warehouse: 'SYN_WH_A', material: 'SYN_PACK', base_uom: 'syn_bag', quantity: '3.000000', value: '21000' },
    ]);
    for (const table of noFake) assert.equal(report.afterCommit[table].n, 0, table);
    assert.equal((await tx.unsafe("select count(*)::int n from public.inventory_movements where branch_id=any($1::uuid[]) and movement_type<>'OPENING'", [branchIds]))[0].n, 0);
    const history = await tx.unsafe('select statements from supabase_migrations.schema_migrations where version=$1', ['20261008224033']);
    assert.equal(history.length, 1); assert.equal(digest(history[0].statements[0]), migrationHash);
    const unrelated = (await tx.unsafe("select md5(string_agg(to_jsonb(h)::text,'|' order by version)) hash from supabase_migrations.schema_migrations h where version<>'20261008224033'"))[0].hash;
    assert.equal(unrelated, report.unrelatedHistoryBefore);
    pass('FRESH_LOGICAL_COMMITTED_READBACK_EXACT_SOURCE_HISTORY_AND_TOTALS');
    pass('OPENING_READERS_ALL_SIX_BALANCES_AND_BASE_UOM_QUANTITIES');
    pass('NO_FAKE_BUSINESS_LEDGER_OR_COMPENSATION');
    report.recoveryClassification = 'COMMIT_CONFIRMED';
  });
} catch (e) { report.failures.push({ name: 'COMMITTED_READBACK', code: e.code ?? null, message: e.message }); }
finally { await readback.end({ timeout: 5 }); await save(); }

if (report.recoveryClassification === 'COMMIT_CONFIRMED') {
  const retry = await database();
  try {
    await check('SAME_OPERATION_IDEMPOTENCY', async () => {
      await retry.begin(async tx => {
        const result = await importOpenings(postgresAdapter(tx), pkg, options);
        assert.equal(result.replayed, true);
        assert.deepEqual(await snapshot(tx), report.afterCommit);
      });
    });
    await check('NEW_OPERATION_SAME_STABLE_SOURCE_IDEMPOTENCY', async () => {
      await retry.begin(async tx => {
        const result = await importOpenings(postgresAdapter(tx), pkg, { ...options, operationId: report.operationB });
        assert.deepEqual(result.sources, report.result.sources);
        assert.deepEqual(result.entities, report.result.entities);
        assert.deepEqual(await snapshot(tx), report.afterCommit);
      });
    });
    await check('CHANGED_MASTER_CONFLICT', async () => {
      const changed = structuredClone(pkg); changed.tables.A[0].branch_name += ' changed';
      await assert.rejects(() => retry.begin(tx => importOpenings(postgresAdapter(tx), changed, { ...options, operationId: randomUUID() })), /IMPORT_MASTER_CONFLICT:branches:name/);
    });
    await check('DIFFERENT_TIMESTAMP_CONFLICT', async () => {
      const changed = structuredClone(pkg); changed.meta.test_cutover = '2026-10-15T00:00:01+07:00';
      await assert.rejects(() => retry.begin(tx => importOpenings(postgresAdapter(tx), changed, { ...options, operationId: randomUUID() })), /IMPORT_MASTER_CONFLICT:employees:deactivated_at/);
    });
  } finally { await retry.end({ timeout: 5 }); }
  const finalRead = await database();
  try {
    assertIndependentReadback({ client: retry, transactionEnded: true, closed: true }, finalRead);
    await finalRead.begin(async tx => {
      await tx.unsafe('set transaction read only');
      assert.deepEqual(await snapshot(tx), report.afterCommit);
      const receiptRows = await tx.unsafe('select operation_id from private.operational_import_receipts where actor_id=$1 order by operation_id', [options.actorId]);
      report.finalReceiptOperations = receiptRows.map(x => x.operation_id);
      pass('FRESH_LOGICAL_RETRY_AND_CONFLICT_ROLLBACK_READBACK');
    });
  } finally { await finalRead.end({ timeout: 5 }); }
}
report.status = report.failures.length ? 'FAIL' : 'PASS_SUPPORTED_SCOPE';
await save();
console.log(JSON.stringify({ status: report.status, runId, transaction: report.transaction, checks: report.checks,
  failures: report.failures, totals: report.totals, reportPath, manifestPath }));
if (report.failures.length) process.exitCode = 1;
