import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { argumentsForRun, openQA, rejected } from './native-fixture.mjs';

const args = argumentsForRun(), qa = await openQA(args), { sql, rpc, fixtures: f } = qa;
const customer = JSON.parse(await readFile(args.documents, 'utf8')).documents.customer;
const rollback = new Error('ROLLBACK_EVIDENCE_BOUNDARY');
let facts;
try {
  try {
    await sql.begin(async tx => {
      const portal = await rpc(tx, 'create_portal_evidence', ['PAYMENT_NOTICE', null, customer, 'image/png', 8, randomUUID()]);
      const internal = await rpc(tx, 'create_evidence_upload', [f.branch, 'inventory-evidence', f.branch + '/review-' + randomUUID() + '.png', 'INTERNAL', randomUUID()]);
      const portalInput = [portal.id, '0'.repeat(64), 8, randomUUID()], internalInput = [internal, '0'.repeat(64), 8, randomUUID()];
      if (args.phase === 'before') {
        await rpc(tx, 'finalize_portal_evidence', portalInput);
        await rpc(tx, 'finalize_evidence_upload', internalInput);
      } else {
        await rejected(tx, sp => rpc(sp, 'finalize_portal_evidence', portalInput), 'storage_finalization_requires_server', '42501');
        await rejected(tx, sp => rpc(sp, 'finalize_evidence_upload', internalInput), 'storage_finalization_requires_server', '42501');
        await rejected(tx, sp => rpc(sp, 'finalize_portal_evidence_verified', [f.owner, ...portalInput]), null, '42501');
        await rejected(tx, sp => rpc(sp, 'finalize_evidence_upload_verified', [f.owner, ...internalInput]), null, '42501');
        await tx.unsafe('set local role service_role');
        await rejected(tx, sp => sp`select public.finalize_portal_evidence_verified(${f.owner}::uuid,${portal.id}::uuid,${'0'.repeat(64)}::text,8::bigint,${randomUUID()}::uuid)`, 'evidence_storage_object_unavailable', '55000');

      }
      if (args.phase !== 'before') {
        const docs = JSON.parse(await readFile('reports/business-flow-remediation/evidence/PACKAGE13_NOTICE_AUTH161.json', 'utf8')).documents;
        const other = await rpc(tx, 'create_evidence_upload', [docs.branch, 'inventory-evidence', docs.branch + '/scope-' + randomUUID() + '.png', 'INTERNAL', randomUUID()]);
        await tx.unsafe('set local role postgres');
        const [record] = await tx`select bucket_name,object_path from public.evidence_objects where id=${other}`;
        const people = JSON.parse(await readFile(args.personas,'utf8')).personas;
        await qa.actor(tx, people.warehouse.subject);
        const [scope] = await tx`select private.has_permission(${docs.branch},'evidence.manage') has_scope,
          private.can_read_internal_evidence_storage(${record.bucket_name},${record.object_path}) can_read,
          private.can_write_internal_evidence_storage(${record.bucket_name},${record.object_path}) can_write`;
        assert.deepEqual(scope,{has_scope:false,can_read:false,can_write:false});
      }
      await tx.unsafe('set local role postgres');
      const [state] = await tx`select
        (select object_state from public.portal_evidence_objects where id=${portal.id}) portal,
        (select upload_state from public.evidence_objects where id=${internal}) internal`;
      assert.deepEqual(state, args.phase === 'before' ? { portal: 'READY', internal: 'VERIFIED' } : { portal: 'PENDING', internal: 'PENDING' });
      facts = { states: state, uploadedBytes: 0, sourceCommandsSubmitted: 0 };
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  await writeFile(args.out, JSON.stringify({ scope: 'G05_G15_G22_METADATA_WITHOUT_STORAGE_CANNOT_FINALIZE', phase: args.phase,
    status: args.phase === 'before' ? 'REPRODUCED_METADATA_ONLY_READY_WITHOUT_UPLOAD' : 'PASS_FAIL_CLOSED_ONLY',
    facts, actualStorageTested: false, rolledBack: true, productionAccess: 'NONE' }, null, 2));
  console.log(JSON.stringify({ phase: args.phase, facts }));
} finally { await sql.end({ timeout: 3 }); }
