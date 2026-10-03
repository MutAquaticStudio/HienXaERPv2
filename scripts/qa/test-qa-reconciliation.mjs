import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { plan, root, migrationFiles, catalog, assertTarget, applyTransaction, transactionBody, hashJson } from './reconcile-current-candidate.mjs';
import { readViewCatalog, prepareViewReference } from './reconciliation-view-catalog.mjs';

const mode = process.argv[2] ?? '--native';
const output = process.env.HX_RECONCILIATION_TEST_OUTPUT;
if (!output) throw new Error('test_output_required');
const fixturePath = process.env.HX_RECONCILIATION_SCOPE_FIXTURE;
if (!fixturePath) throw new Error('scope_fixture_required');
const fixture = JSON.parse(await fs.readFile(fixturePath,'utf8'));
if (!process.env.HX_RECONCILIATION_EXTRA_SQL_FIXTURE) throw new Error('preserved_extra_sql_fixture_required');
const extraSql = await fs.readFile(process.env.HX_RECONCILIATION_EXTRA_SQL_FIXTURE,'utf8');
assert.ok(extraSql.trim(),'Never substitute empty SQL or invented history for the observed extra migration');
const files = await migrationFiles();
const evidence = {mode,reconstruction:'SCOPE_RECONSTRUCTED_NOT_FULL_QA_CLONE',native:mode==='--native',checks:[],failures:[],production:'NOT_TOUCHED',managedMutation:false};
const check = (name,extra={}) => evidence.checks.push({name,status:'PASS',...extra});
const ident = value => `"${value.replaceAll('"','""')}"`;
const signature = f => `${ident(f.schema)}.${ident(f.name)}(${f.args})`;
const sameFunction = (a,b) => a.schema===b.schema && a.name===b.name && a.args===b.args;

function pgliteAdapter(connection) {
  const query = async (text,params=[]) => (await connection.query(text,params)).rows;
  const tag = async (strings,...params) => query(strings.reduce((sql,s,i)=>sql+s+(i<params.length?`$${i+1}`:''),''),params);
  // Trusted migration/setup SQL may contain multiple statements. Bound SQL is
  // still a single statement, with the driver's original parameter handling.
  tag.unsafe = async (text,params=[]) => params.length ? query(text,params)
    : (await connection.exec(text)).at(-1)?.rows ?? [];
  tag.begin = async (modeOrCallback,maybeCallback) => {
    const callback = typeof modeOrCallback==='function'?modeOrCallback:maybeCallback;
    await connection.exec('begin;');
    try {const result=await callback(tag);await connection.exec('commit;');return result;}
    catch(error) {await connection.exec('rollback;');throw error;}
  };
  return tag;
}

function nativeAdapter(connection) {
  const tag=(strings,...params)=>connection(strings,...params);
  tag.unsafe=(text,params=[])=>params.length ? connection.unsafe(text,params) : connection.unsafe(text).simple();
  tag.begin=(modeOrCallback,maybeCallback)=>typeof modeOrCallback==='function'
    ? connection.begin(tx=>modeOrCallback(nativeAdapter(tx)))
    : connection.begin(modeOrCallback,tx=>maybeCallback(nativeAdapter(tx)));
  return tag;
}

async function freshCandidateBaseline(sql) {
  // Existing R2 Auth bootstrap, in a newly created in-memory instance only.
  await sql.unsafe(`do $qa_roles$ begin
    if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
    if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
    end $qa_roles$;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create schema supabase_migrations;
    create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);`);
  const forwardVersion = plan.executionOrder.at(-1).version;
  for (const file of files.filter(item=>item.version!==forwardVersion)) {
    await sql.begin(async tx=>{
      await tx.unsafe(transactionBody(file.raw));
      await tx.unsafe('insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,array[$3]::text[])',
        [file.version,file.name,file.raw]);
    });
  }
  // A hand-checkable posted opening obligation; reconciliation must preserve
  // one row and exactly 1001 VND. No real data or workflow fixtures are copied.
  const actor=randomUUID(),branch=randomUUID(),customer=randomUUID(),source=randomUUID();
  await sql.begin(async tx=>{
    await tx.unsafe('insert into auth.users(id) values($1)',[actor]);
    await tx.unsafe("insert into public.branches(id,code,name) values($1,'HX_RECONCILE','Synthetic reconciliation branch')",[branch]);
    await tx.unsafe("insert into public.customers(id,branch_id,code,display_name) values($1,$2,'HX_RECONCILE_CUSTOMER','Synthetic reconciliation customer')",[customer,branch]);
    await tx.unsafe("insert into public.opening_balance_sources(id,branch_id,side,source_ref,note) values($1,$2,'RECEIVABLE','HX_RECONCILE_AR','Synthetic local fixture')",[source,branch]);
    await tx.unsafe('insert into public.receivable_obligations(branch_id,customer_id,opening_source_id,original_amount_vnd,due_date,recorded_by) values($1,$2,$3,1001,current_date+7,$4)',
      [branch,customer,source,actor]);
  });
}

async function businessFacts(sql) {
  const result = {};
  for (const table of ['inventory_movements','payments','receivable_obligations','payable_obligations','sales_orders','purchase_orders','deliveries']) {
    const columns = await sql.unsafe(`select column_name from information_schema.columns where table_schema='public' and table_name=$1
      and data_type in ('numeric','integer','bigint','smallint') order by column_name`,[table]);
    const exists = await sql.unsafe('select to_regclass($1) is not null as exists',[`public.${table}`]);
    if (!exists[0].exists) continue;
    const totals = columns.map(c => `coalesce(sum(${ident(c.column_name)}),0)::text as ${ident(c.column_name)}`);
    result[table] = (await sql.unsafe(`select count(*)::text as row_count${totals.length?', '+totals.join(', '):''} from public.${ident(table)}`))[0];
  }
  return result;
}

async function reconstruct(sql) {
  await sql.begin(async tx => {
    const query = text => tx.unsafe(text);
    const clean = await catalog(query);
    if(process.env.HX_NATIVE_RESUME_DIVERGED_EVIDENCE) {
      // Replay the explicitly owned synthetic diverged fixture, not managed history.
      await tx.unsafe('alter table public.stock_count_lines drop constraint stock_count_lines_finite_count');
    }
    for (const f of clean.schema.functions) {
      if (!fixture.catalogs.before.functions.some(b => sameFunction(f,b))) {
        // Exact signatures only. No CASCADE and only within disposable local fixtures.
        await tx.unsafe(`drop function ${signature(f)}`);
      }
    }
    await tx.unsafe('alter table public.delivery_results drop column source_work_item_result_id;');
    await tx.unsafe('alter table public.work_item_results alter column actual_quantity set not null;');
    for (const index of fixture.catalogs.expected.indexes) await tx.unsafe(`drop index public.${ident(index.name)};`);
    for (const f of fixture.catalogs.before.functions) {
      let args=f.args;
      if(f.name==='create_direct_purchase_from_sales_order') args=args.replace(/commercial_terms text$/,'commercial_terms text default null');
      await tx.unsafe(`create or replace function ${ident(f.schema)}.${ident(f.name)}(${args}) returns ${f.result}
        language plpgsql ${f.security_definer?'security definer':'security invoker'} set search_path=''
        as $qa_fixture_body$${f.body}$qa_fixture_body$;`);
      if(f.schema==='public') await tx.unsafe(`revoke all on function ${signature(f)} from public,anon; grant execute on function ${signature(f)} to authenticated;`);
    }
    await tx.unsafe(`alter table public.stock_count_lines add constraint stock_count_lines_finite_count
      check(counted_base_quantity>=0 and counted_base_quantity<'Infinity'::numeric) not valid;`);
    await tx.unsafe(`create or replace view public.sales_order_read with(security_invoker=true) as ${fixture.catalogs.before.views[0].definition}`);
    for (const f of plan.executionOrder) await tx.unsafe('delete from supabase_migrations.schema_migrations where version=$1',[f.version]);
    // Cached stored statements, not an attestation of original source provenance.
    // This insertion occurs only during disposable, synthetic reconstruction.
    const existingExtra=clean.history.find(row=>row.version===plan.extraVersion);
    if(existingExtra) assert.deepEqual(existingExtra.statements,[extraSql],'Synthetic extra history must retain its observed content');
    await tx.unsafe('insert into supabase_migrations.schema_migrations(version,name,statements) values ($1,$2,array[$3]::text[]) on conflict(version) do nothing',
      [plan.extraVersion,'acceptance_count_guard_and_direct_po_terms',extraSql]);
  });
}

async function runPath(kind,sql) {
  const canonicalBaseline = await readViewCatalog(text=>sql.unsafe(text),plan.targetViews);
  const viewReference = await prepareViewReference(sql,plan.targetViews,canonicalBaseline);
  evidence[`${kind}_view_reference`] = viewReference;
  if(kind==='DIVERGED') await reconstruct(sql);
  const before = await catalog(text => sql.unsafe(text));
  const factsBefore = await businessFacts(sql);
  evidence[`${kind}_business_facts_before`] = factsBefore;
  let rollbackObserved=false;
  try {
    await sql.begin(async tx => {
      for(const file of plan.executionOrder) {
        if(before.history.some(h=>h.version===file.version)) continue;
        await tx.unsafe(transactionBody(files.find(f=>f.version===file.version).raw));
      }
      await tx.unsafe("select 1/0;");
    });
  } catch(error) {if(error.code==='22012') rollbackObserved=true;else throw error;}
  assert.equal(rollbackObserved,true);
  const rolledBack = await catalog(text=>sql.unsafe(text));
  assert.equal(rolledBack.schemaFingerprint,before.schemaFingerprint);
  assert.equal(rolledBack.historyFingerprint,before.historyFingerprint);
  check(`${kind}_ATOMIC_ROLLBACK`);
  let applied;
  if(mode==='--native' && kind==='DIVERGED' && process.env.HX_NATIVE_APPLY_VIA_LOCAL_CLI==='1') {
    const referencePath=`${output}.cli-view-reference.json`;
    await fs.writeFile(referencePath,JSON.stringify(viewReference,null,2));
    const cliEvidence=[];
    for(const cliMode of ['--preflight-local','--apply-local','--apply-local']) {
      const env={...process.env,HX_LOCAL_RECONCILE_DATABASE_URL:process.env.HX_NATIVE_DIVERGED_DATABASE_URL,
        HX_LOCAL_DISPOSABLE_RECONCILIATION:'1',HX_RECONCILIATION_VIEW_REFERENCE:referencePath,
        HX_RECONCILIATION_OUTPUT:`${output}.cli-preflight.json`};
      const result=spawnSync(process.execPath,['scripts/qa/reconcile-current-candidate.mjs',cliMode],{env,encoding:'utf8',timeout:120000,maxBuffer:10e6});
      const log=(result.stdout??'')+(result.stderr??'');
      const path=`${output}.cli-${cliEvidence.length}.log`;
      await fs.writeFile(path,log);
      assert.equal(result.status,0,`Actual local CLI failed (${cliMode}); see ${path}`);
      const report=JSON.parse(result.stdout.trim().split('\n').at(-1));
      cliEvidence.push({mode:cliMode,exit:result.status,report,artifact:path});
    }
    const after=await catalog(text=>sql.unsafe(text));
    assert.deepEqual(cliEvidence[1].report.applied,pendingMigrations(files,before).map(file=>file.version));
    assert.deepEqual(cliEvidence[2].report.applied,[]);
    evidence.cliDeployment={status:'PASS_LOCAL_CUSTOM_RECONCILIATION_ENTRYPOINT',commands:cliEvidence};
    applied={after,applied:cliEvidence[1].report.applied};
  } else applied = await applyTransaction(sql,files,before,viewReference);
  assertTarget(applied.after,viewReference);
  assert.equal(applied.after.protectedAccessFingerprint,before.protectedAccessFingerprint);
  assert.deepEqual(await businessFacts(sql),factsBefore);
  check(`${kind}_SCOPED_SCHEMA_ACL_RLS_STORAGE_AND_DATA_PRESERVED`,{schemaFingerprint:applied.after.schemaFingerprint,applied:applied.applied});
  const repeat = await applyTransaction(sql,files,applied.after,viewReference);
  assert.deepEqual(repeat.applied,[]);
  assert.equal(repeat.after.schemaFingerprint,applied.after.schemaFingerprint);
  assert.equal(repeat.after.historyFingerprint,applied.after.historyFingerprint);
  check(`${kind}_LEDGER_SKIP_SECOND_RUN`);
  const payload = {target_sales_order_id:randomUUID(),target_supplier_id:randomUUID(),purchase_lines:[{quantity:'1'}],expected_at:null,operation_id:randomUUID()};
  await assert.rejects(() => sql.begin(async tx => {
    await tx.unsafe('set local role authenticated');
    await tx.unsafe(`select public.create_direct_purchase_from_sales_order(target_sales_order_id=>$1::uuid,
        target_supplier_id=>$2::uuid,purchase_lines=>$3::jsonb,expected_at=>$4::timestamptz,operation_id=>$5::uuid)`,
        [payload.target_sales_order_id,payload.target_supplier_id,JSON.stringify(payload.purchase_lines),payload.expected_at,payload.operation_id]);
  }), error => error.code === '42501');
  check(`${kind}_PO_NAMED_APP_PAYLOAD_RESOLVES_AND_PERMISSION_DENIED`);
  const [countColumn] = await sql.unsafe(`select format_type(atttypid,atttypmod) as type,atttypmod as typmod
    from pg_attribute where attrelid='public.stock_count_lines'::regclass
    and attname='counted_base_quantity' and not attisdropped`);
  // Constrained numeric rejects infinity during input coercion, before CHECK.
  // NaN and ordinary negative quantities must reach and fail the finite CHECK.
  for (const quantity of ['Infinity','NaN','-Infinity','-1']) {
    const typeRejects = quantity==='Infinity' || quantity==='-Infinity';
    if (typeRejects) assert.ok(countColumn.typmod>=0,'Infinity rejection requires the actual constrained numeric column');
    const expectedCode = typeRejects ? '22003' : '23514';
    let denied=false;
    try {
      await sql.unsafe(`insert into public.stock_count_lines(stock_count_id,material_id,expected_base_quantity,counted_base_quantity,
        adjustment_unit_cost_vnd,reason,evidence_object_id,recorded_by) values($1,$2,0,$3::numeric,null,'QA finite count',$4,$5)`,
        [randomUUID(),randomUUID(),quantity,randomUUID(),randomUUID()]);
    } catch(error) {if(error.code===expectedCode) denied=true;else throw error;}
    assert.equal(denied,true);
    check(`${kind}_COUNT_${typeRejects?'TYPE':'CONSTRAINT'}_REJECTS_${quantity}`,{code:expectedCode,columnType:countColumn.type});
  }
  const [zero] = await sql.unsafe("select (0::numeric>=0 and 0::numeric<'Infinity'::numeric) as valid;");
  assert.equal(zero.valid,true);
  check(`${kind}_ZERO_COUNT_REMAINS_VALID`);
  assert.deepEqual(await businessFacts(sql),factsBefore);
  evidence[`${kind}_business_facts_after`] = await businessFacts(sql);
  return applied.after;
}

import { spawnSync } from 'node:child_process';
import { pendingMigrations } from './reconcile-current-candidate.mjs';
import { createHash } from 'node:crypto';
evidence.executionInputs=[];
for(const file of ['test-qa-reconciliation.mjs','reconcile-current-candidate.mjs','reconciliation-view-catalog.mjs','qa-reconciliation-plan.json']) {
  evidence.executionInputs.push({path:`scripts/qa/${file}`,sha256:createHash('sha256').update(await fs.readFile(new URL(file,import.meta.url))).digest('hex')});
}
evidence.migrationManifest=files.map(({version,path,sha256})=>({version,path,sha256}));
const cleanup=[];
try {
  const outputs=[];
  const kinds=process.env.HX_NATIVE_ONLY_DIVERGED==='1' ? ['DIVERGED'] : ['CLEAN','DIVERGED'];
  for (const kind of kinds) {
    let sql;
    if(mode==='--pglite') {
      const archive = kind==='DIVERGED' && process.env.HX_RECONCILIATION_DIVERGED_PGLITE_ARCHIVE
        ? process.env.HX_RECONCILIATION_DIVERGED_PGLITE_ARCHIVE : process.env.HX_RECONCILIATION_PGLITE_ARCHIVE;
      const connection = archive ? new PGlite({loadDataDir:new Blob([await fs.readFile(archive)])})
        : await PGlite.create({extensions:{pgcrypto}});
      await connection.waitReady;
      cleanup.push(()=>connection.close());
      sql=pgliteAdapter(connection);
      evidence[kind] = {archive:archive??null,target:archive?'NEW_IN_MEMORY_ARCHIVE_COPY_NOT_NATIVE':'NEW_IN_MEMORY_FROM_CANDIDATE_MANIFEST_NOT_NATIVE'};
      const [bound] = await sql.unsafe('select $1::text as input',[`Tiếng Việt "quoted"; not SQL`]);
      assert.equal(bound.input,`Tiếng Việt "quoted"; not SQL`);
      await assert.rejects(()=>sql.unsafe('select $1::text; select $1::text',[bound.input]),error=>error.code==='42601');
      check(`${kind}_PARAMETERIZED_SINGLE_STATEMENT_PROTOCOL`);
      if (!archive) await freshCandidateBaseline(sql);
      // Archive history is evidence, not a ledger to fill or rewrite to green.
    } else if(mode==='--native') {
      const rawUrl=process.env[`HX_NATIVE_${kind}_DATABASE_URL`];
      if(!rawUrl) throw new Error(`BLOCKED_LOCAL_NATIVE_ENV:HX_NATIVE_${kind}_DATABASE_URL_missing`);
      const url=new URL(rawUrl);
      if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname) || !/^\/hx_qa_reconcile_[a-z0-9_]+$/.test(url.pathname)
        ||process.env.HX_LOCAL_DISPOSABLE_RECONCILIATION!=='1') throw new Error('native_target_not_local_disposable');
      const connection=postgres(rawUrl,{ssl:false,max:1,prepare:false,connect_timeout:5});
      cleanup.push(()=>connection.end({timeout:3}));
      sql=nativeAdapter(connection);
      const [identity]=await sql.unsafe(`select current_database() as database,version() as engine,pg_backend_pid() as pid,
        current_setting('server_version_num') as server_version_num,current_setting('data_directory') as data_directory,
        host(inet_server_addr()) as host,inet_server_port() as port`);
      assert.equal(identity.database,url.pathname.slice(1));
      assert.equal(identity.host,'127.0.0.1');
      assert.equal(identity.port,Number(process.env.HX_NATIVE_CLUSTER_PORT));
      assert.equal(Math.floor(Number(identity.server_version_num)/10000),17);
      assert.equal(identity.data_directory,process.env.HX_NATIVE_DATA_DIRECTORY);
      assert.match(identity.data_directory,/^\/private\/tmp\/hx-native-goal\.[A-Za-z0-9]+\/cluster-data$/);
      const [{count}]=await sql.unsafe("select count(*)::int as count from pg_tables where schemaname in ('public','auth','storage','supabase_migrations')");
      const resumePath=process.env[`HX_NATIVE_RESUME_${kind}_EVIDENCE`];
      if(count && resumePath) {
        const previous=JSON.parse(await fs.readFile(resumePath,'utf8'));
        assert.equal(previous.native,true);
        assert.equal(previous[kind].identity.database,identity.database);
        assert.equal(previous[kind].identity.data_directory,identity.data_directory);
        const appliedCheck=previous.checks.find(item=>item.name===`${kind}_SCOPED_SCHEMA_ACL_RLS_STORAGE_AND_DATA_PRESERVED` && item.status==='PASS');
        assert.ok(appliedCheck,'Resume requires recorded successful scoped apply');
        const resumed=await catalog(text=>sql.unsafe(text));
        assert.equal(resumed.schemaFingerprint,appliedCheck.schemaFingerprint);
        assert.equal(resumed.history.length,files.length+(kind==='DIVERGED'?1:0));
        for(const file of files) {
          const row=resumed.history.find(item=>item.version===file.version);
          assert.ok(row,`Missing executed migration ${file.version}`);
          assert.deepEqual(row.statements,[file.raw],`Executed content changed for ${file.version}`);
        }
        evidence[`${kind}_resume`]={artifact:resumePath,history:'ALL_CANDIDATE_EXECUTED_CONTENT_MATCHES',priorAtomicRollback:'REUSED_FROM_SAME_OWNED_DB'};
      } else {
        assert.equal(count,0,'Native baseline setup never overwrites a populated database');
        await sql.unsafe('create extension if not exists pgcrypto');
        await freshCandidateBaseline(sql);
      }
      evidence[kind]={identity,target:'NEW_OWNED_DB_BASELINE_EXECUTED_FROM_CANDIDATE_MANIFEST',auth:'SQL_AUTH_UID_FIXTURE_NOT_MANAGED_AUTH',storage:'NO_STORAGE_RUNTIME'};
    } else throw new Error('unsupported_mode');
    outputs.push(await runPath(kind,sql));
  }
  if(outputs.length===2) {
    assert.deepEqual(outputs[0].schema,outputs[1].schema);
    check('CLEAN_AND_DIVERGED_SAME_SCOPED_TARGET');
  }
  evidence.status=mode==='--native'?(outputs.length===2?'PASS_NATIVE_TWO_PATHS':'PASS_NATIVE_DIVERGED_CLI_PATH'):'PASS_ISOLATED_PGLITE_TWO_PATHS_NOT_NATIVE';
} catch(error) {
  evidence.status=error.message.startsWith('BLOCKED_LOCAL_NATIVE_ENV')?'BLOCKED_LOCAL_NATIVE_ENV':'FAIL';
  evidence.failures.push({message:error.message,code:error.code??null});
  process.exitCode=1;
} finally {
  for(const close of cleanup) await close();
  await fs.writeFile(output,JSON.stringify(evidence,null,2));
  console.log(JSON.stringify({status:evidence.status,checks:evidence.checks.length,failures:evidence.failures,artifact:output}));
}
