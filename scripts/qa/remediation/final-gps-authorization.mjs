import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { argumentsForRun, openQA, stockFixture, salesFixture, rejected } from './native-fixture.mjs';

const args = argumentsForRun(), qa = await openQA(args), { sql, rpc, fixtures: f } = qa;
const personas = JSON.parse(await readFile(args.personas, 'utf8')).personas;
const rollback = new Error('ROLLBACK_GPS_AUTHORIZATION');
let facts;
try {
  try {
    await sql.begin(async tx => {
      const stock = await stockFixture(tx, qa, '15'), sale = await salesFixture(tx, qa, stock);
      const allocation = await rpc(tx, 'upsert_supply_allocation', [sale.line, 'WAREHOUSE', null, f.warehouse, '15', null, null, randomUUID()]);
      const vehicle = randomUUID();
      await rpc(tx, 'save_catalog_record', ['vehicles', vehicle, f.branch, { code: stock.prefix, plate_number: stock.prefix,
        capacity_quantity: '20', capacity_uom_id: stock.uom, capacity_source_note: 'Xe QA kiểm quyền GPS', active: true }, null, 'Xe riêng kiểm phân giao', randomUUID()]);
      const [owner] = await tx`select id from public.employees where auth_user_id=${f.owner}`;
      const [slot] = await tx`select count(*)::int n from public.deliveries`;
      const start = new Date(Date.UTC(2198, 0, 1) + slot.n * 86400000).toISOString(), end = new Date(Date.parse(start) + 3600000).toISOString();
      const delivery = await rpc(tx, 'create_delivery_from_allocations', [sale.so, [{ supply_allocation_id: allocation, planned_base_quantity: '15' }], start, randomUUID()]);
      const assign = (employee, version) => rpc(tx, 'assign_delivery_scheduled', [delivery, employee, vehicle, '', '', version, randomUUID(), start, end], personas.warehouse.subject);
      await assign(personas.worker.employee, 1);
      const work = await rpc(tx, 'publish_work_item', [f.branch, 'DELIVERY', delivery, 'DIRECT', personas.worker.employee, randomUUID()], personas.warehouse.subject);
      const oldSession = await rpc(tx, 'start_gps_tracking', [delivery, 1, randomUUID()], personas.worker.subject);
      const ping = [oldSession, 1, new Date().toISOString(), '10.75', '106.7', '10', '0', '0', randomUUID()];
      await rpc(tx, 'record_gps_ping', ping, personas.worker.subject);
      await assign(owner.id, 2);
      const oldStart = await rejected(tx, sp => rpc(sp, 'start_gps_tracking', [delivery, 1, randomUUID()], personas.worker.subject), 'gps_assignment_not_active', '42501');
      const oldPing = await rejected(tx, sp => rpc(sp, 'record_gps_ping', [oldSession, 2, new Date().toISOString(), '10.75', '106.7', '10', '0', '0', randomUUID()], personas.worker.subject), 'gps_session_not_active', '42501');
      const oldRetry = await rejected(tx, sp => rpc(sp, 'record_gps_ping', ping, personas.worker.subject), 'gps_session_not_active', '42501');
      const session = await rpc(tx, 'start_gps_tracking', [delivery, 2, randomUUID()], f.owner);
      await rejected(tx, sp => rpc(sp, 'record_gps_ping', [session, 1, new Date().toISOString(), '10.75', '106.7', '10', '0', '0', randomUUID()], personas.worker.subject), 'gps_session_not_active', '42501');
      await qa.actor(tx, personas.worker.subject);
      assert.equal((await tx`select * from public.my_active_gps_assignment(${work}::uuid)`).length, 0);
      await tx.unsafe('set local role postgres');
      const [state] = await tx`select status,stop_reason,(select count(*)::int from public.gps_positions where session_id=${oldSession}) positions from public.gps_tracking_sessions where id=${oldSession}`;
      assert.deepEqual(state, { status: 'REVOKED', stop_reason: 'assignment_superseded', positions: 1 });
      facts = { state, oldStart, oldPing, oldSuccessfulIntentRetryAfterRevocation: oldRetry, otherEmployeeCannotUseNewSession: true };
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  await writeFile(args.out, JSON.stringify({ scope: 'G06_GPS_OLD_START_PING_RETRY_AND_NEW_SESSION_AUTHORIZATION', status: 'PASS', facts,
    actualDeviceTested: false, managedAuthTested: false, coordinatesSynthetic: true, rolledBack: true, productionAccess: 'NONE' }, null, 2));
  console.log(JSON.stringify({ status: 'PASS', facts }));
} finally { await sql.end({ timeout: 3 }); }
