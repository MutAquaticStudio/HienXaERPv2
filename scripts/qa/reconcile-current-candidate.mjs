import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { readViewCatalog, compareViewCatalog } from './reconciliation-view-catalog.mjs';

export const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const hashJson = value => sha256(JSON.stringify(value));
export const plan = JSON.parse(await readFile(new URL('./qa-reconciliation-plan.json', import.meta.url), 'utf8'));

export async function migrationFiles() {
  const names = (await readdir(resolve(root, 'supabase/migrations'))).filter(name => /^\d{14}_.+\.sql$/.test(name)).sort();
  return await Promise.all(names.map(async name => {
    const path = `supabase/migrations/${name}`;
    const raw = await readFile(resolve(root, path), 'utf8');
    return {version:name.slice(0,14), name:name.slice(15,-4), path, raw, sha256:sha256(raw)};
  }));
}

export function transactionBody(raw) {
  let body = raw;
  const opening = /^(?:\s|--[^\n]*(?:\n|$))*begin\s*;/i.exec(body);
  if (opening) {
    if (!/commit\s*;\s*$/i.test(body)) throw new Error('unmatched_migration_transaction');
    body = body.slice(opening[0].length).replace(/commit\s*;\s*$/i, '');
  }
  return body;
}

export async function catalog(query) {
  const names = plan.targetFunctions.map(f => f.name);
  const functions = (await query(`select n.nspname as schema,p.proname as name,
    pg_get_function_identity_arguments(p.oid) as args,pg_get_function_result(p.oid) as result,
    md5(p.prosrc) as body_md5,p.prosecdef as security_definer,p.proconfig as config,
    pg_get_userbyid(p.proowner) as owner,p.pronargdefaults as default_count,
    pg_get_function_arguments(p.oid) as arguments,
    has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
    has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,p.proacl::text as acl
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private') order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)`)).filter(f => names.includes(f.name));
  const columns = await query(`select table_schema,table_name,column_name,udt_name,is_nullable,column_default
    from information_schema.columns where table_schema='public' and
    ((table_name='delivery_results' and column_name='source_work_item_result_id')
    or (table_name='work_item_results' and column_name='actual_quantity')) order by table_name,column_name`);
  const constraints = await query(`select n.nspname as schema,c.relname as table,k.conname as name,
    pg_get_constraintdef(k.oid) as definition,k.convalidated as validated
    from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and k.conname in ('stock_count_lines_finite_count',
    'delivery_results_source_work_item_result_id_fkey','delivery_results_source_work_item_result_id_key') order by c.relname,k.conname`);
  const indexes = await query(`select schemaname as schema,tablename as table,indexname as name,indexdef as definition
    from pg_indexes where schemaname='public' and indexname in ('quotations_branch_created_id_idx',
    'receivable_obligations_customer_id_idx','credit_commitments_customer_id_idx') order by indexname`);
  const views = await readViewCatalog(query, plan.targetViews);
  const access = await query(`select n.nspname as schema,c.relname as name,c.relrowsecurity as rls,
    c.relforcerowsecurity as force_rls,c.relacl::text as acl,pg_get_userbyid(c.relowner) as owner
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p') order by c.relname`);
  const policies = await query(`select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
    from pg_policies where schemaname in ('public','private','storage') order by schemaname,tablename,policyname`);
  const history = await query(`select version,name,statements from supabase_migrations.schema_migrations order by version`);
  const violations = await query(`select count(*)::integer as total,
    count(*) filter(where counted_base_quantity is null or counted_base_quantity<0 or counted_base_quantity>='Infinity'::numeric)::integer as invalid_count,
    count(*) filter(where adjustment_unit_cost_vnd<0 or adjustment_unit_cost_vnd>='Infinity'::numeric)::integer as invalid_cost
    from public.stock_count_lines`);
  const dependencies = await query(`select p.oid::regprocedure::text as target,
    pg_describe_object(d.classid,d.objid,d.objsubid) as dependent,d.deptype
    from pg_depend d join pg_proc p on p.oid=d.refobjid join pg_namespace n on n.oid=p.pronamespace
    where d.refclassid='pg_proc'::regclass and n.nspname='public'
    and p.proname='create_direct_purchase_from_sales_order' order by target,dependent`);
  const schema = {functions,columns,constraints,indexes,views,access,policies};
  return {schema,schemaFingerprint:hashJson(schema),protectedAccessFingerprint:hashJson({access,policies}),
    history,historyFingerprint:hashJson(history),violations,dependencies};
}

export function assertTarget(snapshot, viewReference) {
  const failures = [];
  for (const expected of plan.targetFunctions) {
    const actual = snapshot.schema.functions.find(f => f.schema===expected.schema && f.name===expected.name && f.args===expected.args);
    if (!actual || actual.body_md5!==expected.bodyMd5 || actual.result!==expected.result
      || actual.security_definer!==expected.security_definer || JSON.stringify(actual.config)!==JSON.stringify(expected.config)
      || actual.owner!=='postgres') failures.push(`function:${expected.schema}.${expected.name}`);
    if (actual && expected.schema==='public' && (!actual.authenticated_execute || actual.anon_execute)) failures.push(`grant:${expected.name}`);
  }
  const po = snapshot.schema.functions.filter(f => f.name==='create_direct_purchase_from_sales_order');
  if (po.length!==1 || po[0].default_count!==0) failures.push('po_overload_or_default');
  for (const expected of plan.targetColumns) {
    const actual = snapshot.schema.columns.find(c => c.table_name===expected.table_name && c.column_name===expected.column_name);
    if (!actual || actual.udt_name!==expected.udt_name || actual.is_nullable!==expected.is_nullable || actual.column_default!==null) failures.push(`column:${expected.table_name}.${expected.column_name}`);
  }
  for (const expected of plan.targetConstraints) {
    const actual = snapshot.schema.constraints.find(c => c.table===expected.table && c.name===expected.name);
    if (!actual || actual.definition!==expected.definition || actual.validated!==expected.validated) failures.push(`constraint:${expected.name}`);
  }
  for (const expected of plan.targetIndexes) {
    const actual = snapshot.schema.indexes.find(i => i.name===expected.name);
    if (!actual || actual.definition!==expected.definition) failures.push(`index:${expected.name}`);
  }
  const viewVerdict = compareViewCatalog(snapshot.schema.views, viewReference);
  if (viewVerdict.status!=='MATCH') failures.push(`views:${viewVerdict.status}:${viewVerdict.differences.join(',')}`);
  for (const expected of plan.targetViews) {
    const actual = snapshot.schema.views.find(v => v.schema===expected.schema && v.name===expected.name);
    if (!actual?.options?.includes('security_invoker=true')) failures.push(`view_security:${expected.name}`);
  }
  if (failures.length) throw new Error(`postcheck_failed:${failures.join(',')}`);
  return 'PASS_SCOPED_EFFECTIVE_SCHEMA';
}

export function pendingMigrations(files, snapshot) {
  const versions = new Set(files.map(f => f.version));
  for (const row of snapshot.history) {
    if (!versions.has(row.version) && row.version!==plan.extraVersion) throw new Error(`unexpected_history_version:${row.version}`);
  }
  const deltaVersions = new Set(plan.executionOrder.map(f => f.version));
  for (const file of files) {
    if (!deltaVersions.has(file.version) && !snapshot.history.some(h => h.version===file.version)) throw new Error(`unapproved_missing_migration:${file.version}`);
  }
  return plan.executionOrder.flatMap(expected => {
    const file = files.find(f => f.version===expected.version);
    if (!file || file.sha256!==expected.sha256) throw new Error(`candidate_checksum_changed:${expected.version}`);
    const row = snapshot.history.find(h => h.version===file.version);
    if (!row) return [file];
    if (!Array.isArray(row.statements) || sha256(row.statements.join('\n'))!==file.sha256) throw new Error(`applied_delta_checksum_unverified:${file.version}`);
    return [];
  });
}

export async function applyTransaction(sql, files, before, viewReference) {
  return await sql.begin(async tx => {
    await tx`set local lock_timeout='5s'`;
    await tx`set local statement_timeout='60s'`;
    await tx`select pg_advisory_xact_lock(hashtextextended('hx.qa.reconciliation',0))`;
    await tx`lock table supabase_migrations.schema_migrations in share row exclusive mode`;
    const current = await catalog(text => tx.unsafe(text));
    if (current.schemaFingerprint!==before.schemaFingerprint || current.historyFingerprint!==before.historyFingerprint) throw new Error('target_changed_after_preflight');
    const pending = pendingMigrations(files,current);
    for (const file of pending) {
      await tx.unsafe(transactionBody(file.raw));
      await tx.unsafe('insert into supabase_migrations.schema_migrations(version,name,statements) values ($1,$2,array[$3]::text[])',
        [file.version,file.name,file.raw]);
    }
    const after = await catalog(text => tx.unsafe(text));
    assertTarget(after, viewReference);
    if (after.protectedAccessFingerprint!==before.protectedAccessFingerprint) throw new Error('unapproved_rls_storage_or_table_grant_change');
    for (const old of before.history) {
      if (hashJson(after.history.find(h => h.version===old.version))!==hashJson(old)) throw new Error(`original_history_changed:${old.version}`);
    }
    return {status:'APPLIED_TRANSACTIONALLY',applied:pending.map(f => f.version),after};
  });
}

// Exact Milestone-B selector. Legacy reconciliation modes remain unchanged.
export async function loadExactManifest(manifestPath) {
  const raw=await readFile(manifestPath); const manifest=JSON.parse(raw);
  if(manifest.projectRef!=='ffrwiglcrlumfvhubaxg'||manifest.classification!=='TEST_DATA_ONLY_OWNER_CONFIRMED'||!Array.isArray(manifest.entries)||!manifest.entries.length) throw Error('exact_manifest_invalid');
  const seen=new Set(),files=[];
  for(const entry of manifest.entries) {
    if(!/^\d{14}$/.test(entry.version)||seen.has(entry.version)||!/^supabase\/migrations\/\d{14}_[a-z0-9_]+\.sql$/.test(entry.path)||!entry.path.startsWith('supabase/migrations/'+entry.version+'_')||! /^[a-f0-9]{64}$/.test(entry.sha256)) throw Error('exact_manifest_duplicate_or_invalid_entry');
    seen.add(entry.version); const bytes=await readFile(resolve(root,entry.path));
    if(sha256(bytes)!==entry.sha256) throw Error('exact_manifest_checksum_mismatch:'+entry.version);
    files.push({...entry,name:entry.path.split('/').pop().replace(entry.version+'_','').replace(/\.sql$/,''),raw:bytes.toString('utf8')});
  }
  if(!manifest.affected||!Array.isArray(manifest.affected.functions)||!Array.isArray(manifest.affected.relations)) throw Error('exact_manifest_affected_scope_missing');
  return {manifest,manifestSha256:sha256(raw),files};
}
export async function exactScopeCatalog(query,loaded) {
  const names=loaded.manifest.affected.functions, relations=loaded.manifest.affected.relations, versions=loaded.files.map(f=>f.version);
  const q=(text,args=[])=>query(text,args);
  const plain=rows=>Array.from(rows,r=>({...r}));
  const aclExpr="coalesce((select jsonb_agg(jsonb_build_object('grantee',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,'grantor',pg_get_userbyid(a.grantor),'privilege',a.privilege_type,'grantable',a.is_grantable) order by a.grantee=0 desc,pg_get_userbyid(a.grantee),a.privilege_type,a.is_grantable) from aclexplode(%ACL%) a),'[]'::jsonb)";
  const acl=(expression)=>aclExpr.replace('%ACL%',expression);
  return {
    functions:plain(await q(`select n.nspname schema,p.proname name,pg_get_function_identity_arguments(p.oid) args,p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition,pg_get_userbyid(p.proowner) owner,p.prosecdef,p.provolatile,p.proconfig,pg_get_function_result(p.oid) result,pg_get_expr(p.proargdefaults,0) defaults,${acl("coalesce(p.proacl,acldefault('f',p.proowner))")} grants from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname=any($1::text[]) order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)`,[names])),
    relations:plain(await q(`select c.relname name,c.relkind,c.reloptions,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) owner,case when c.relkind='v' then pg_get_viewdef(c.oid,false) end definition,${acl("coalesce(c.relacl,acldefault('r',c.relowner))")} grants from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1::text[]) order by c.relname`,[relations])),
    columns:plain(await q(`select c.relname table_name,a.attname name,format_type(a.atttypid,a.atttypmod) type,a.attnotnull,pg_get_expr(d.adbin,d.adrelid) default_expression,case when coalesce(cardinality(a.attacl),0)=0 then 'NO_EXPLICIT_COLUMN_ACL' else 'EXPLICIT_COLUMN_ACL' end explicit_column_acl_state,${acl("case when coalesce(cardinality(a.attacl),0)=0 then null::aclitem[] else a.attacl end")} grants from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum where n.nspname='public' and c.relname=any($1::text[]) and a.attnum>0 and not a.attisdropped order by c.relname,a.attnum`,[relations])),
    constraints:plain(await q(`select c.relname table_name,k.conname name,pg_get_constraintdef(k.oid) definition,k.convalidated from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1::text[]) order by c.relname,k.conname`,[relations])),
    indexes:plain(await q(`select c.relname table_name,k.relname name,pg_get_indexdef(i.indexrelid) definition from pg_index i join pg_class c on c.oid=i.indrelid join pg_class k on k.oid=i.indexrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1::text[]) order by c.relname,k.relname`,[relations])),
    policies:plain(await q('select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname=\'public\' and tablename=any($1::text[]) order by tablename,policyname',[relations])),
    history:plain(await q('select version,name,statements from supabase_migrations.schema_migrations where version=any($1::text[]) order by version',[versions])),
    historyDigests:plain(await q('select version,md5(row_to_json(m)::text) digest from supabase_migrations.schema_migrations m order by version')),
    directPo6argDependents:plain(await q("select pg_describe_object(classid,objid,objsubid) dependent,deptype from pg_depend where refclassid='pg_proc'::regclass and refobjid=to_regprocedure('public.create_direct_purchase_from_sales_order(uuid,uuid,jsonb,timestamptz,uuid,text)') order by 1")),
    stockCountPreconditions:plain(await q("select count(*)::integer rows,count(*) filter(where counted_base_quantity<0 or counted_base_quantity>='Infinity'::numeric)::integer invalid_quantity,count(*) filter(where adjustment_unit_cost_vnd<0 or adjustment_unit_cost_vnd>='Infinity'::numeric)::integer invalid_cost from public.stock_count_lines")),
  };
}
export const exactStateFingerprint=snapshot=>hashJson(Object.fromEntries(['functions','relations','columns','constraints','indexes','policies','directPo6argDependents'].map(k=>[k,snapshot[k]])));
export async function inspectExactCommitState(sql,loaded,{beforeFingerprint,afterFingerprint}) {
  const current=await sql.begin(async tx=>{await tx.unsafe("set transaction read only; set local statement_timeout='20s'; set local search_path=pg_catalog");return exactScopeCatalog((s,a=[])=>tx.unsafe(s,a),loaded);});
  const fingerprint=exactStateFingerprint(current);
  const matching=loaded.files.filter(f=>{const row=current.history.find(r=>r.version===f.version);return row&&row.name===f.name&&Array.isArray(row.statements)&&sha256(row.statements.join('\n'))===f.sha256;});
  const status=matching.length===loaded.files.length&&fingerprint===afterFingerprint?'COMMITTED_VERIFIED':current.history.length===0&&fingerprint===beforeFingerprint?'ROLLED_BACK_VERIFIED':'UNKNOWN_BLOCK_RETRY';
  return {status,fingerprint,verifiedVersions:matching.map(f=>f.version),readOnly:true,automaticRetry:false};
}
export async function applyExactManifest(sql,loaded,{beforeFingerprint,verifyAfter}) {
  if(!beforeFingerprint||typeof verifyAfter!=='function') throw Error('exact_apply_requires_precondition_and_postcheck');
  try {return await sql.begin(async tx=>{
    await tx.unsafe("set local lock_timeout='5s'; set local statement_timeout='60s'; set local search_path=pg_catalog; select pg_advisory_xact_lock(hashtextextended('hxqa:milestone-b-exact',0)); lock table supabase_migrations.schema_migrations in exclusive mode");
    const query=(text,args=[])=>tx.unsafe(text,args), before=await exactScopeCatalog(query,loaded);
    if(exactStateFingerprint(before)!==beforeFingerprint) throw Error('exact_preapply_state_changed');
    if(before.directPo6argDependents.length||before.stockCountPreconditions.some(r=>r.invalid_quantity||r.invalid_cost)) throw Error('exact_scope_precondition_failed');
    const applied=[],already=[];
    for(const f of loaded.files) {
      const row=before.history.find(r=>r.version===f.version);
      if(row) {if(!Array.isArray(row.statements)||sha256(row.statements.join('\n'))!==f.sha256||row.name!==f.name) throw Error('exact_history_content_mismatch:'+f.version); already.push(f.version); continue;}
      await tx.unsafe(transactionBody(f.raw));
      await tx`insert into supabase_migrations.schema_migrations(version,name,statements) values(${f.version},${f.name},${[f.raw]})`;
      applied.push(f.version);
    }
    const after=await exactScopeCatalog(query,loaded);
    for(const row of before.historyDigests) if(!after.historyDigests.some(x=>x.version===row.version&&x.digest===row.digest)) throw Error('exact_existing_history_changed');
    await verifyAfter(after,query);
    return {status:applied.length?'APPLIED_EXACT_TRANSACTIONALLY':'ALREADY_APPLIED_VERIFIED',applied,already,after};
  });} catch(error) {
    error.exactCommitState=/^(ECONN|ETIMEDOUT|CONNECTION|CONNECTION_CLOSED|CONNECTION_DESTROYED)/.test(String(error.code||''))?'UNKNOWN_NO_RETRY':'FAILED_NO_AUTOMATIC_RETRY';
    throw error;
  }
}
async function exactMain() {
  const mode=process.argv[2],managed=mode.endsWith('-qa'),applying=mode.startsWith('--apply');
  const loaded=await loadExactManifest(process.env.HX_QA_EXACT_MANIFEST_FILE); let sql;
  if(managed) {process.loadEnvFile(process.env.HX_QA_ENV_FILE); const core=await import('./core.mjs'); if(core.guard().ref!==loaded.manifest.projectRef) throw Error('exact_qa_target_mismatch'); sql=await core.database();}
  else {const credentials=JSON.parse(await readFile(process.env.HX_NATIVE_CREDENTIALS_FILE)),owner=JSON.parse(await readFile(process.env.HX_NATIVE_OWNERSHIP_FILE)); const database=process.env.HX_QA_EXACT_LOCAL_DATABASE;
    if(credentials.host!=='127.0.0.1'||credentials.port!==owner.port||!owner.clusterOwned||!/^hx_mb_final_[a-z0-9_]+$/.test(database)) throw Error('exact_local_target_not_owned');
    sql=postgres({...credentials,database,max:1,prepare:false}); const [i]=await sql`select current_database() db,current_setting('data_directory') directory,inet_server_port() port`; if(i.db!==database||i.directory!==owner.data_directory||i.port!==owner.port){await sql.end(); throw Error('exact_local_identity_mismatch');}
  }
  try {
    const before=await sql.begin(async tx=>{await tx.unsafe("set transaction read only; set local search_path=pg_catalog");return exactScopeCatalog((text,args=[])=>tx.unsafe(text,args),loaded);});
    if(!applying) {await writeFile(process.env.HX_QA_EXACT_EVIDENCE_FILE,JSON.stringify({manifestSha256:loaded.manifestSha256,beforeFingerprint:exactStateFingerprint(before),before},null,2),{mode:0o600}); return;}
    const expected=JSON.parse(await readFile(process.env.HX_QA_EXACT_EXPECTED_FILE));
    if(managed) {const approval=JSON.parse(await readFile(process.env.HX_QA_EXACT_APPROVAL_FILE));
      if(approval.status!=='OWNER_APPROVED_EXACT'||approval.projectRef!==loaded.manifest.projectRef||approval.manifestSha256!==loaded.manifestSha256||approval.expectedFileSha256!==sha256(await readFile(process.env.HX_QA_EXACT_EXPECTED_FILE))||approval.backupSafeguard!=='PASS_SCOPED'||approval.selectorStatus!=='PASS') throw Error('exact_owner_approval_required');
      if(![expected.beforeFingerprint,expected.afterFingerprint].includes(exactStateFingerprint(before))) throw Error('exact_managed_capture_changed');
      await writeFile(process.env.HX_QA_EXACT_EVIDENCE_FILE+'.preapply-backup.json',JSON.stringify(before,null,2),{mode:0o600});
    }
    let result;
    try { result=await applyExactManifest(sql,loaded,{beforeFingerprint:exactStateFingerprint(before),verifyAfter:after=>{if(exactStateFingerprint(after)!==expected.afterFingerprint) throw Error('exact_postcheck_mismatch');}}); }
    catch(error) {if(error.exactCommitState==='UNKNOWN_NO_RETRY'){let readback;try{readback=await inspectExactCommitState(sql,loaded,expected);}catch(readError){readback={status:'READBACK_UNAVAILABLE_BLOCK_RETRY',code:readError.code??null};}await writeFile(process.env.HX_QA_EXACT_EVIDENCE_FILE,JSON.stringify({status:'TRANSPORT_COMMIT_UNKNOWN_NO_RETRY',readback},null,2),{mode:0o600});}throw error;}
    await writeFile(process.env.HX_QA_EXACT_EVIDENCE_FILE,JSON.stringify(result,null,2),{mode:0o600});
  } finally {await sql.end({timeout:5});}
}
async function main() {
  if(['--preflight-exact-local','--apply-exact-local','--preflight-exact-qa','--apply-approved-exact-qa'].includes(process.argv[2])) return exactMain();

  const mode = process.argv[2] ?? '--preflight';
  if (!['--preflight','--preflight-local','--apply-local','--apply-approved-qa'].includes(mode)) throw new Error('unsupported_mode');
  const local = mode==='--apply-local' || mode==='--preflight-local';
  if (!local) {
    const { guard } = await import('./core.mjs');
    if (guard().ref!==plan.projectRef) throw new Error('wrong_managed_qa_ref');
  }
  const rawUrl = local ? process.env.HX_LOCAL_RECONCILE_DATABASE_URL : process.env.DATABASE_URL;
  if (!rawUrl) throw new Error(local ? 'BLOCKED_LOCAL_NATIVE_ENV:HX_LOCAL_RECONCILE_DATABASE_URL_missing' : 'qa_database_url_missing');
  const url = new URL(rawUrl);
  if (rawUrl.includes(plan.productionRef)) throw new Error('production_rejected');
  if (local && (!['localhost','127.0.0.1','[::1]'].includes(url.hostname)
    || !/^\/hx_qa_reconcile_[a-z0-9_]+$/.test(url.pathname)
    || process.env.HX_LOCAL_DISPOSABLE_RECONCILIATION!=='1')) throw new Error('local_disposable_target_required');
  if (!local && !url.hostname.endsWith('.supabase.com') && url.hostname!==`db.${plan.host}`) throw new Error('unexpected_managed_host');
  const ssl = local ? false : process.env.HX_QA_CA_FILE
    ? {rejectUnauthorized:true,ca:await readFile(process.env.HX_QA_CA_FILE,'utf8')} : 'verify-full';
  const sql = postgres(rawUrl,{ssl,max:1,prepare:false,connect_timeout:10});
  try {
    const files = await migrationFiles();
    const before = await sql.begin('read only',tx => catalog(text => tx.unsafe(text)));
    const pending = pendingMigrations(files,before);
    const report = {scope:plan.scope,projectRef:local?'LOCAL_DISPOSABLE':plan.projectRef,
      schemaFingerprint:before.schemaFingerprint,historyFingerprint:before.historyFingerprint,
      protectedAccessFingerprint:before.protectedAccessFingerprint,pending:pending.map(({raw,...f}) => f),
      historyProvenance:plan.historyProvenance,historyVersions:before.history.map(h=>h.version),
      constraintViolations:before.violations,dependencies:before.dependencies,
      realBusinessData:'UNKNOWN_REQUIRES_OWNER_ATTESTATION',managedMutation:false};
    if (mode==='--apply-approved-qa') {
      if (!process.argv[3]) throw new Error('exact_approval_package_required');
      const approval = JSON.parse(await readFile(process.argv[3],'utf8'));
      if (approval.ownerApproval!=='APPROVED' || approval.QA_PROJECT_REF!==plan.projectRef
        || approval.TARGET_CONTAINS_REAL_BUSINESS_DATA!==false
        || approval.native_clean_path!=='PASS_NATIVE' || approval.native_diverged_path!=='PASS_NATIVE'
        || approval.view_comparator!=='PASS_SAME_ENGINE' || approval.cli_deployment_path!=='PASS_LOCAL'
        || approval.backupVerified!==true || approval.CURRENT_SCHEMA_FINGERPRINT!==before.schemaFingerprint
        || approval.CURRENT_HISTORY_FINGERPRINT!==before.historyFingerprint
        || hashJson(approval.PATCH_FILES_AND_CHECKSUMS)!==hashJson(plan.executionOrder)) throw new Error('approval_or_native_or_backup_gate_not_satisfied');
    }
    if (mode==='--preflight' || mode==='--preflight-local') {
      if (!process.env.HX_RECONCILIATION_OUTPUT) throw new Error('preflight_artifact_path_required');
      await writeFile(process.env.HX_RECONCILIATION_OUTPUT,JSON.stringify({report,snapshot:before},null,2));
      console.log(JSON.stringify(report));
    } else {
      if (!process.env.HX_RECONCILIATION_VIEW_REFERENCE) throw new Error('verified_same_engine_view_reference_required');
      const viewReference = JSON.parse(await readFile(process.env.HX_RECONCILIATION_VIEW_REFERENCE,'utf8'));
      const result = await applyTransaction(sql,files,before,viewReference);
      console.log(JSON.stringify({status:result.status,applied:result.applied,schemaFingerprint:result.after.schemaFingerprint,production:'NOT_TOUCHED'}));
    }
  } finally { await sql.end({timeout:5}); }
}

if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  await main().catch(error => {
    console.error(JSON.stringify({status:'BLOCKED_WITH_EXACT_CAUSE',reason:error.message}));
    process.exitCode=1;
  });
}
