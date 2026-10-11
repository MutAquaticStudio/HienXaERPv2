import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { argumentsForRun, openQA } from './native-fixture.mjs';

const args = argumentsForRun(), qa = await openQA(args), { sql, rpc, fixtures: f } = qa;
assert.match(args.database, /^hx_remediation_upgrade136_/);
try {
  const [source] = await sql`select po.id,po.branch_id,po.state,l.id line,l.quantity::text quantity,l.unit_cost_vnd::text price
    from public.purchase_orders po join public.purchase_order_lines l on l.purchase_order_id=po.id
    where po.branch_id=${f.branch} and po.state='CONFIRMED' and po.destination_type='WAREHOUSE'
      and not exists(select 1 from public.purchase_receipt_lines r where r.purchase_order_line_id=l.id)
    order by po.created_at,l.line_number limit 1`;
  assert.ok(source, 'Use an existing restored document, never manufacture a preceding-version document');
  const [before] = await sql`select md5(to_jsonb(l)::text) source_hash from public.purchase_order_lines l where id=${source.line}`;
  const input = [source.id, [{ purchase_order_line_id: source.line, received_quantity: source.quantity }], null, new Date().toISOString(), randomUUID()];
  const receipt = await sql.begin(tx => rpc(tx, 'receive_purchase_order', input));
  // A new transaction and connection read the committed result and retry the original intent.
  const observer = await openQA(args);
  try {
    const retried = await observer.sql.begin(tx => observer.rpc(tx, 'receive_purchase_order', input));
    assert.equal(retried, receipt);
    const [after] = await observer.sql`select
      (select md5(to_jsonb(l)::text) from public.purchase_order_lines l where id=${source.line}) source_hash,
      (select count(*)::int from public.purchase_receipt_lines where purchase_order_line_id=${source.line}) receipts,
      (select sum(received_quantity)::text from public.purchase_receipt_lines where purchase_order_line_id=${source.line}) received_quantity,
      (select count(*)::int from public.payable_obligations where purchase_receipt_id=${receipt}) payables,
      (select count(*)::int from public.inventory_movements m join public.purchase_receipt_lines r on r.id=m.source_purchase_receipt_line_id where r.purchase_receipt_id=${receipt}) movements,
      (select count(*)::int from public.command_receipts where operation_id=${input.at(-1)}) intents,
      (select count(*)::int from public.audit_events where trace_id=${input.at(-1)}) audits`;
    assert.equal(after.source_hash, before.source_hash);
    assert.equal(after.receipts, 1); assert.equal(after.received_quantity, source.quantity);
    assert.equal(after.payables, 1); assert.equal(after.movements, 1);
    assert.equal(after.intents, 1); assert.equal(after.audits, 1);
    await writeFile(args.out, JSON.stringify({ scope: 'RESTORED136_DOCUMENT_CONTINUES_AFTER165_WITH_UNCHANGED_SOURCE_AND_SINGLE_EFFECT',
      status: 'PASS', source, before, after, receipt, separateConnections: true, nativeAuthenticatedUid: f.owner,
      managedAuthTested: false, productionAccess: 'NONE', newDocumentsFabricated: false }, null, 2));
    console.log(JSON.stringify({ status: 'PASS', source: source.id, after }));
  } finally { await observer.sql.end({ timeout: 3 }); }
} finally { await sql.end({ timeout: 3 }); }
