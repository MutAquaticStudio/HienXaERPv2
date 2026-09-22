import { guard, database, clients, email } from './core.mjs';

guard();
const sql = await database();
const api = await clients();
const roles = ['finance', 'receiver', 'other_customer'];
const sessions = {};
const forbidden = /(^|_)(internal|cost|margin|supplier|payroll|profit|commission|override_reason)(_|$)/i;
const deniedCodes = new Set(['42501', '42P01', 'PGRST200', 'PGRST205']);
const violations = [];
const unresolved = [];
const observations = [];

function forbiddenPaths(value, path = '$') {
  if (Array.isArray(value)) return value.flatMap((item, index) => forbiddenPaths(item, `${path}[${index}]`));
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, item]) => [
    ...(forbidden.test(key) ? [`${path}.${key}`] : []),
    ...forbiddenPaths(item, `${path}.${key}`),
  ]);
}

try {
  const columns = await sql`
    select table_name,column_name
    from information_schema.columns
    where table_schema='public'
      and column_name ~* '(cost|margin|payroll|internal_note|override_reason|supplier|profit|commission)'
    order by table_name,column_name
  `;
  const [expense] = await sql`select id from public.expenses order by created_at desc limit 1`;
  const [salesLine] = await sql`select id from public.sales_order_lines order by id limit 1`;
  for (const role of roles) sessions[role] = await api.login(role);

  const probes = roles.flatMap(role => columns.map(({ table_name, column_name }) => ({ role, table_name, column_name })));
  let cursor = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (cursor < probes.length) {
      const probe = probes[cursor++];
      const client = sessions[probe.role];
      let result;
      try {
        result = await client.from(probe.table_name).select(probe.column_name).limit(1);
        const sampleId = ['expenses', 'expense_read'].includes(probe.table_name)
          ? expense?.id : probe.table_name === 'sales_order_lines' ? salesLine?.id : null;
        if (result.error?.code === '57014' && sampleId) {
          result = await client.from(probe.table_name)
            .select(probe.column_name).eq('id', sampleId).limit(1);
          probe.primaryKeyFallback = true;
        }
      } catch (error) {
        unresolved.push({ ...probe, error: String(error) });
        continue;
      }
      const record = {
        role: probe.role,
        table: probe.table_name,
        column: probe.column_name,
        state: result.error ? 'ERROR' : result.data?.length ? 'ROW' : 'NO_ROW',
        code: result.error?.code ?? null,
        primaryKeyFallback: probe.primaryKeyFallback ?? false,
      };
      observations.push(record);
      if (record.state === 'ROW') violations.push({ ...record, reason: 'customer portal can select restricted column' });
      else if (record.state === 'ERROR' && !deniedCodes.has(record.code)) unresolved.push(record);
    }
  }));

  const memberships = await sql`
    select u.email,m.customer_id
    from public.customer_portal_memberships m
    join auth.users u on u.id=m.auth_user_id
    where m.active=true and m.revoked_at is null
      and u.email in (${email('finance')},${email('receiver')},${email('other_customer')})
  `;
  const targets = {};
  for (const role of roles) {
    const member = memberships.find(row => row.email === email(role));
    if (!member) throw new Error(`QA portal membership missing: ${role}`);
    const [order] = await sql`
      select id from public.sales_orders
      where customer_id=${member.customer_id}
      order by created_at desc limit 1
    `;
    const [revision] = await sql`
      select r.id
      from public.quotations q
      join public.quotation_revisions r on r.quotation_id=q.id
      where q.customer_id=${member.customer_id}
      order by r.created_at desc limit 1
    `;
    if (!order || !revision) throw new Error(`QA portal order or quotation missing: ${role}`);
    targets[role] = { customer: member.customer_id, order: order.id, revision: revision.id };
  }

  const allowedLineKeys = [
    'id', 'line_total_vnd', 'material_name_snapshot',
    'quantity', 'unit_price_vnd', 'uom_symbol',
  ].sort();
  const rpcChecks = [];
  for (const role of roles) {
    const client = sessions[role];
    const own = targets[role];
    const cross = targets[role === 'other_customer' ? 'finance' : 'other_customer'];
    for (const [name, args] of [
      ['customer_portal_snapshot', { target_customer_id: own.customer }],
      ['customer_portal_order', { target_order_id: own.order }],
      ['customer_safe_quotation_lines', { target_revision_id: own.revision }],
    ]) {
      const result = await client.rpc(name, args);
      if (result.error || result.data == null) {
        violations.push({ role, rpc: name, reason: result.error?.code ?? 'empty own payload' });
        continue;
      }
      const bad = forbiddenPaths(result.data);
      if (bad.length) violations.push({ role, rpc: name, reason: 'forbidden payload keys', paths: bad });
      if (name === 'customer_safe_quotation_lines') {
        if (!Array.isArray(result.data) || !result.data.length
          || result.data.some(line => JSON.stringify(Object.keys(line).sort()) !== JSON.stringify(allowedLineKeys))) {
          violations.push({ role, rpc: name, reason: 'quotation line projection differs from customer-safe contract' });
        }
      }
      if (role === 'receiver' && name === 'customer_portal_snapshot'
        && (result.data.can_view_debt !== false || result.data.debt != null)) {
        violations.push({ role, rpc: name, reason: 'receiver debt is visible' });
      }
      if (role === 'receiver' && name === 'customer_portal_order'
        && (result.data.can_view_finance !== false || 'total_amount_vnd' in result.data)) {
        violations.push({ role, rpc: name, reason: 'receiver finance is visible' });
      }
      rpcChecks.push({ role, rpc: name, state: 'OWN_OK' });
    }
    for (const [name, args] of [
      ['customer_portal_order', { target_order_id: cross.order }],
      ['customer_safe_quotation_lines', { target_revision_id: cross.revision }],
    ]) {
      const result = await client.rpc(name, args);
      if (result.error?.code !== '42501' || result.data != null) {
        violations.push({ role, rpc: name, reason: 'cross-customer request was not denied' });
      }
      rpcChecks.push({ role, rpc: name, state: result.error?.code === '42501' ? 'CROSS_DENIED' : 'CROSS_UNEXPECTED' });
    }
  }

  const report = {
    status: violations.length ? 'FAIL' : unresolved.length ? 'PARTIAL' : 'PASS',
    scope: 'QA portal personas and named restricted fields only',
    sensitiveColumns: columns.length,
    probes: observations.length,
    noRow: observations.filter(item => item.state === 'NO_ROW').length,
    denied: observations.filter(item => item.state === 'ERROR' && deniedCodes.has(item.code)).length,
    primaryKeyFallbacks: observations.filter(item => item.primaryKeyFallback).length,
    rpcChecks,
    violations,
    unresolved,
  };
  console.log(JSON.stringify(report));
  if (report.status !== 'PASS') process.exitCode = 1;
} finally {
  for (const client of Object.values(sessions)) await client.auth.signOut();
  await sql.end();
}
