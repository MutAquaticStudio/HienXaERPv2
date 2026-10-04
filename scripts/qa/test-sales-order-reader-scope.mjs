import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import postgres from 'postgres';

// Explicit owned-local inputs only. Never loads a cloud .env or runs db push.
const required = ['HX_NATIVE_CREDENTIALS_FILE', 'HX_NATIVE_OWNERSHIP_FILE', 'HX_READER_SCOPE_PRECONDITIONS', 'HX_READER_SCOPE_EVIDENCE_DIR'];
for (const key of required) assert.ok(process.env[key], `${key} is required`);
const credentials = JSON.parse(fs.readFileSync(process.env.HX_NATIVE_CREDENTIALS_FILE, 'utf8'));
const ownership = JSON.parse(fs.readFileSync(process.env.HX_NATIVE_OWNERSHIP_FILE, 'utf8'));
const fixtures = JSON.parse(fs.readFileSync(process.env.HX_READER_SCOPE_PRECONDITIONS, 'utf8'));
assert.equal(credentials.host, '127.0.0.1');
assert.equal(credentials.port, ownership.port);
assert.equal(ownership.clusterOwned, true);
const out = process.env.HX_READER_SCOPE_EVIDENCE_DIR;
const patchPath = path.resolve(import.meta.dirname, '../../supabase/migrations/20261004150000_sales_order_reader_scope.sql');
const bytes = fs.readFileSync(patchPath);
const patch = bytes.toString('utf8');
const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
const evidence = { scope: 'SALES_ORDER_READER_SCOPE', migration: path.basename(patchPath), sha256, environment: 'OWNED_LOCAL_POSTGRESQL', managedQa: 'NOT_MODIFIED', production: 'NOT_TOUCHED', security: [], performance: [], status: 'RUNNING' };
const rollback = new Error('EXPECTED_LOCAL_REHEARSAL_ROLLBACK');
const record = () => fs.writeFileSync(path.join(out, 'sales-order-reader-scope-evidence.json'), JSON.stringify(evidence, null, 2));
const open = database => postgres({ ...credentials, database, max: 5, prepare: false, connect_timeout: 10, idle_timeout: 10, onnotice: () => {} });

async function identity(sql, database) {
  const [r] = await sql`select current_database() db, current_setting('data_directory') directory, inet_server_port() port, version() version`;
  assert.equal(r.db, database);
  assert.equal(r.directory, ownership.data_directory);
  assert.equal(r.port, ownership.port);
  return r;
}
async function asActor(tx, actor, query) {
  await tx`select set_config('request.jwt.claim.sub', ${actor ?? ''}, true)`;
  await tx.unsafe('set local role authenticated');
  try { return await query(tx); } finally { await tx.unsafe('reset role'); }
}
async function visible(tx, actor) {
  return asActor(tx, actor, async t => Array.from(await t`select id::text from public.sales_orders order by id`, r => r.id));
}
async function expected(tx, actor) {
  await tx`select set_config('request.jwt.claim.sub', ${actor ?? ''}, true)`;
  return Array.from(await tx`select s.id::text from public.sales_orders s where private.has_permission(s.branch_id, 'orders.read') or private.has_customer_membership(s.customer_id, null::text[]) order by s.id`, r => r.id);
}
async function snapshot(tx) {
  return {
    policies: Array.from(await tx`select policyname,cmd,roles,qual,with_check from pg_policies where schemaname='public' and tablename='sales_orders' order by policyname`),
    grants: Array.from(await tx`select grantee,privilege_type,is_grantable from information_schema.role_table_grants where table_schema='public' and table_name='sales_orders' order by grantee,privilege_type`),
    flags: Array.from(await tx`select relrowsecurity,relforcerowsecurity from pg_class where oid='public.sales_orders'::regclass`),
  };
}
async function matrix(tx, fixture) {
  const results = [];
  async function check(label, actor, mutate = null) {
    await tx.unsafe('savepoint reader_scope_case');
    try {
      if (mutate) await mutate(tx);
      const want = await expected(tx, actor);
      const got = await visible(tx, actor);
      assert.deepEqual(got, want, label);
      results.push({ label, actor, count: got.length, idsHash: crypto.createHash('sha256').update(got.join('\n')).digest('hex'), result: 'PASS' });
    } finally { await tx.unsafe('rollback to savepoint reader_scope_case'); }
  }
  for (const actor of fixture.actors) await check(`active-${actor.code}-${actor.branch_id}`, actor.auth_user_id);
  await check('unknown-actor', '00000000-0000-4000-8000-000000000001');
  await check('no-auth-actor', null);
  const employee = fixture.actors[0];
  assert.ok(employee, 'owned fixture requires an employee');
  await check('employee-revoked', employee.auth_user_id, t => t`update public.employees set active=false where id=${employee.employee_id}`);
  await check('branch-access-revoked', employee.auth_user_id, t => t`update public.employee_branch_access set active=false where id=${employee.access_id}`);
  await check('role-revoked', employee.auth_user_id, t => t`update public.roles set active=false where id=${employee.role_id}`);
  await check('permission-removed', employee.auth_user_id, t => t`delete from public.role_permissions where role_id=${employee.role_id} and permission_code='orders.read'`);
  await check('branch-revoked', employee.auth_user_id, t => t`update public.branches set active=false where id=${employee.branch_id}`);
  for (const member of fixture.members) {
    await check(`customer-only-${member.id}`, member.auth_user_id, t => t`update public.employees set active=false where auth_user_id=${member.auth_user_id}`);
    await check(`membership-revoked-${member.id}`, member.auth_user_id, async t => {
      await t`update public.employees set active=false where auth_user_id=${member.auth_user_id}`;
      await t`update public.customer_portal_memberships set active=false where id=${member.id}`;
    });
    await check(`customer-revoked-${member.id}`, member.auth_user_id, async t => {
      await t`update public.employees set active=false where auth_user_id=${member.auth_user_id}`;
      await t`update public.customers set active=false where id=${member.customer_id}`;
    });
  }
  return results;
}
async function verifyLocal(label, database) {
  const sql = open(database);
  const item = { label, database, status: 'RUNNING' };
  evidence.security.push(item);
  try {
    item.identity = await identity(sql, database);
    await sql.begin(async tx => {
      await tx.unsafe("set local statement_timeout='15s'; set local lock_timeout='3s'");
      const old = await snapshot(tx);
      item.before = await matrix(tx, fixtures[label]);
      await tx.unsafe(patch);
      item.after = await matrix(tx, fixtures[label]);
      assert.deepEqual(item.after, item.before, 'same actors must see exactly the same IDs before/after');
      const next = await snapshot(tx);
      assert.deepEqual(next.grants, old.grants);
      assert.deepEqual(next.flags, old.flags);
      assert.deepEqual(next.policies.map(({qual,...p})=>p), old.policies.map(({qual,...p})=>p));
      const [helper] = await tx`select p.prosecdef, p.provolatile, p.proconfig, has_function_privilege('authenticated',p.oid,'EXECUTE') allowed, has_function_privilege('anon',p.oid,'EXECUTE') anon_allowed, has_function_privilege('service_role',p.oid,'EXECUTE') service_allowed from pg_proc p where p.oid='private.sales_order_reader_scope()'::regprocedure`;
      assert.equal(helper.prosecdef, true);
      assert.equal(helper.provolatile, 's');
      assert.ok(helper.proconfig.includes('search_path=""'));
      assert.equal(helper.allowed, true);
      assert.equal(helper.anon_allowed, false);
      assert.equal(helper.service_allowed, false);
      item.helper = helper;
      throw rollback;
    }).catch(error => { if(error !== rollback) throw error; });
    const [afterRollback] = await sql`select to_regprocedure('private.sales_order_reader_scope()')::text helper`;
    assert.equal(afterRollback.helper, null);
    item.status = 'PASS_AFFECTED_SCOPE_ROLLED_BACK';
  } finally { await sql.end({timeout:5}); record(); }
}

function stats(samples) {
  const durations = samples.map(x=>x.ms).sort((a,b)=>a-b);
  const percentile = p => durations[Math.max(0, Math.ceil(durations.length*p)-1)];
  return { sampleSize:samples.length, p50:percentile(.5), p95:percentile(.95), p99:percentile(.99), errors:samples.filter(x=>x.error).length, firstClientMs:samples[0]?.ms, coldDefinition:'FIRST_QUERY_AFTER_THIS_PATCH_ONLY_NOT_COLD_OS_CACHE', warmDefinition:'ALL_REMAINING_SAMPLES_RETAINED', samples };
}
async function perf(database) {
  assert.ok(database.startsWith('hx_b_restore_'), 'performance target must be the owned restored test database');
  const sql = open(database);
  const actor = fixtures.CLEAN.actors.find(x=>x.code==='HXF4F3435DC6F6');
  assert.ok(actor, 'existing performance actor');
  const report = { database, measurement:'AUTHENTICATED_NATIVE_QUERY_PLUS_LOOPBACK_TRANSACTION_NOT_BROWSER', authority:'Spec.md performance contract; no budget copied here', dataset:{customers:10000,sites:20000,orders:100000,orderLines:500000}, comparisons:[] };
  evidence.performance.push(report);
  async function query(tx, filter) {
    return asActor(tx, actor.auth_user_id, t => filter
      ? t`select id::text from public.sales_orders where branch_id=${actor.branch_id} and (order_number ilike '%PERF-O-99%' or customer_name_snapshot ilike '%PERF-O-99%' or site_name_snapshot ilike '%PERF-O-99%') order by created_at desc,id desc limit 51`
      : t`select id::text from public.sales_orders where branch_id=${actor.branch_id} order by created_at desc,id desc limit 51`);
  }
  try {
    report.identity = await identity(sql,database);
    const wanted = {};
    for(const filter of [false,true]) wanted[String(filter)] = Array.from(filter
      ? await sql`select id::text from public.sales_orders where branch_id=${actor.branch_id} and (order_number ilike '%PERF-O-99%' or customer_name_snapshot ilike '%PERF-O-99%' or site_name_snapshot ilike '%PERF-O-99%') order by created_at desc,id desc limit 51`
      : await sql`select id::text from public.sales_orders where branch_id=${actor.branch_id} order by created_at desc,id desc limit 51`, r=>r.id);
    assert.equal(wanted.true.length,51,'filter positive control');
    assert.equal(wanted.false.length,51,'list positive control');
    const baseline=[];
    for(let n=0;n<2;n++) {
      const start=performance.now();
      const rows=await sql.begin(tx=>query(tx,true));
      assert.deepEqual(Array.from(rows,r=>r.id),wanted.true);
      baseline.push({ms:performance.now()-start,rows:rows.length});
    }
    report.actualOrBaseline=stats(baseline);
    await sql.begin(async tx=>{await tx.unsafe("set local statement_timeout='15s'; set local lock_timeout='3s'");await tx.unsafe(patch);});
    report.applied='OWNED_RESTORED_TEST_DB_ONLY_NO_MANAGED_WRITE';
    for(const filter of [false,true]) for(const concurrency of [1,5]) {
      const samples=new Array(100);let cursor=0;
      const workers=Array.from({length:concurrency},async()=>{
        while(cursor<samples.length){const index=cursor++;const start=performance.now();
          try{const rows=await sql.begin(tx=>query(tx,filter));assert.deepEqual(Array.from(rows,r=>r.id),wanted[String(filter)]);samples[index]={ms:performance.now()-start,rows:rows.length,error:null};}
          catch(error){samples[index]={ms:performance.now()-start,rows:0,error:{name:error.name,code:error.code??null,message:error.message}};}
        }
      });
      await Promise.all(workers);
      const result={query:filter?'ACTUAL_APP_OR_ORDER_FILTER':'BOUNDED_ORDER_LIST',concurrency,...stats(samples)};
      report.comparisons.push(result);record();
      assert.equal(result.errors,0,'all failed/slow samples retained; errors fail this check');
    }
    report.explain=await sql.begin(tx=>asActor(tx,actor.auth_user_id,t=>t`explain (analyze,buffers,format json) select id from public.sales_orders where branch_id=${actor.branch_id} and (order_number ilike '%PERF-O-99%' or customer_name_snapshot ilike '%PERF-O-99%' or site_name_snapshot ilike '%PERF-O-99%') order by created_at desc,id desc limit 51`));
    const plan=report.explain[0]['QUERY PLAN'][0];
    const initPlans=[];const walk=p=>{if(p['Parent Relationship']==='InitPlan')initPlans.push({name:p['Subplan Name'],loops:p['Actual Loops']});for(const child of p.Plans??[])walk(child);};walk(plan.Plan);
    assert.ok(initPlans.length>=2,'authorization must be statement initplans');
    assert.ok(initPlans.every(x=>x.loops<=1),'authorization scope not per row');
    report.initPlans=initPlans;
    report.status='PASS_QUERY_CORRECTNESS_AND_MEASUREMENT_ONLY';
  } finally {await sql.end({timeout:5});record();}
}
try {
  for(const [label,database]of Object.entries(credentials.databases)) await verifyLocal(label,database);
  if(process.env.HX_READER_SCOPE_PERF_DATABASE)await perf(process.env.HX_READER_SCOPE_PERF_DATABASE);
  evidence.status='PASS_AFFECTED_SECURITY_AND_QUERY_SCOPE';
  console.log(JSON.stringify({status:evidence.status,sha256,security:evidence.security.map(x=>({label:x.label,cases:x.after.length,status:x.status})),performance:evidence.performance.map(x=>({status:x.status,baseline:x.actualOrBaseline?.p95,results:x.comparisons.map(r=>({query:r.query,concurrency:r.concurrency,p95:r.p95,p99:r.p99,errors:r.errors}))})),artifact:path.join(out,'sales-order-reader-scope-evidence.json')}));
} catch(error) {
  evidence.status='FAIL';evidence.failure={name:error.name,code:error.code??null,message:error.message};console.error(JSON.stringify(evidence.failure));process.exitCode=1;
} finally {record();}
