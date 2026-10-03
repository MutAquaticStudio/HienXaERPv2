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

async function main() {
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
