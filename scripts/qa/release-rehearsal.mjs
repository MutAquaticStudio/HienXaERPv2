import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import postgres from 'postgres';
import { capacity, database, guard, required } from './core.mjs';

// Isolated application-schema rehearsal, not a managed Auth/Storage restore.
const config = guard();
const admin = await database();
const created = [];
const report = { status: 'FAIL', scope: 'QA_ISOLATED_APPLICATION_SCHEMA', checks: [], cleanup: [] };
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
const ssl = process.env.HX_QA_CA_FILE
  ? { rejectUnauthorized: true, ca: await readFile(process.env.HX_QA_CA_FILE, 'utf8') }
  : 'verify-full';

async function connect(name) {
  assert.match(name, new RegExp(`^hxqa_r12_${suffix}_(clean|upgrade)$`));
  const url = new URL(required('DATABASE_URL'));
  url.hostname = `db.${config.ref}.supabase.co`;
  url.port = '5432';
  url.username = 'postgres';
  url.pathname = `/${name}`;
  url.search = '';
  return postgres(url.href, { ssl, max: 1, prepare: false, connect_timeout: 10, onnotice: () => {} });
}

async function catalog(sql) {
  return {
    columns: await sql`select table_schema,table_name,column_name,ordinal_position,column_default,is_nullable,data_type,udt_name from information_schema.columns where table_schema in ('public','private') order by table_schema,table_name,ordinal_position`,
    constraints: await sql`select n.nspname,c.relname,k.conname,pg_get_constraintdef(k.oid) as definition from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') order by 1,2,3`,
    indexes: await sql`select schemaname,tablename,indexname,indexdef from pg_indexes where schemaname in ('public','private') order by 1,2,3`,
    views: await sql`select schemaname,viewname,definition from pg_views where schemaname in ('public','private') order by 1,2`,
    policies: await sql`select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname in ('public','private','storage') order by 1,2,3`,
    functions: await sql`select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) as args,pg_get_functiondef(p.oid) as definition,p.proacl::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e') order by 1,2,3`,
    relations: await sql`select n.nspname,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text,c.reloptions from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind in ('r','p','v','m','S') order by 1,2`,
    triggers: await sql`select n.nspname,c.relname,t.tgname,pg_get_triggerdef(t.oid) as definition from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and not t.tgisinternal order by 1,2,3`,
  };
}

async function preserved(sql) {
  return {
    users: await sql`select id,email from auth.users order by id`,
    branches: await sql`select id,code,name,active,created_at from public.branches order by id`,
    employees: await sql`select id,auth_user_id,code,display_name,active,deactivated_at,created_at from public.employees order by id`,
    roles: await sql`select id,code,name,active,system_role,created_at from public.roles order by id`,
    access: await sql`select id,employee_id,branch_id,role_id,active,granted_at,revoked_at from public.employee_branch_access order by id`,
    audit: await sql`select * from public.audit_events order by id`,
    buckets: await sql`select * from storage.buckets order by id`,
  };
}

try {
  report.qaDatabaseBytes = await capacity(admin);
  const files = (await readdir('supabase/migrations')).filter(file => /^\d+_.*\.sql$/.test(file)).sort();
  assert.equal(files.length, 49, 'Revisit the exact candidate when its migration set changes');
  const migrations = [];
  for (const file of files) migrations.push({ file, text: await readFile(`supabase/migrations/${file}`, 'utf8') });
  report.migrationFingerprint = hash(migrations);
  report.migrationCount = migrations.length;
  let cleanCatalog;
  for (const mode of ['clean', 'upgrade']) {
    const name = `hxqa_r12_${suffix}_${mode}`;
    await admin.unsafe(`CREATE DATABASE "${name}" TEMPLATE template0`);
    created.push(name);
    const sql = await connect(name);
    try {
      await sql.unsafe(`SET statement_timeout='30s'; SET lock_timeout='5s';
        CREATE SCHEMA auth;
        CREATE TABLE auth.users(id uuid PRIMARY KEY, email text);
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
        GRANT USAGE ON SCHEMA auth TO authenticated,anon;
        GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;
        CREATE SCHEMA storage;
        CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean DEFAULT false,file_size_limit bigint,allowed_mime_types text[]);
        CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text REFERENCES storage.buckets(id),name text);
        ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;`);
      let before;
      let priorPermissions;
      const fixture = { user: randomUUID(), branch: randomUUID(), employee: randomUUID(), role: randomUUID(), access: randomUUID() };
      for (let i = 0; i < migrations.length; i++) {
        const migration = migrations[i];
        try { await sql.begin(t => t.unsafe(migration.text)); }
        catch (error) { throw new Error(`${mode}: ${migration.file}: ${error.code ?? ''} ${error.message}`); }
        if (mode === 'upgrade' && i === 8) {
          await sql.begin(async t => {
            await t`insert into auth.users(id,email) values(${fixture.user},'rehearsal-owner@example.test')`;
            await t`insert into public.branches(id,code,name) values(${fixture.branch},'HXQA_REHEARSAL','QA rehearsal branch')`;
            await t`insert into public.employees(id,auth_user_id,code,display_name) values(${fixture.employee},${fixture.user},'HXQA_OWNER','QA rehearsal owner')`;
            await t`insert into public.roles(id,code,name,system_role) values(${fixture.role},'owner','QA rehearsal owner',true)`;
            await t`insert into public.role_permissions(role_id,permission_code) select ${fixture.role},code from public.permissions`;
            await t`insert into public.employee_branch_access(id,employee_id,branch_id,role_id) values(${fixture.access},${fixture.employee},${fixture.branch},${fixture.role})`;
            await t`insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id) values(${fixture.user},${fixture.branch},'rehearsal.bootstrap','employee',${fixture.employee},${randomUUID()})`;
          });
          before = await preserved(sql);
          priorPermissions = await sql`select permission_code from public.role_permissions where role_id=${fixture.role} order by permission_code`;
        }
      }
      if (mode === 'upgrade') {
        assert.deepEqual(await preserved(sql), before, 'Upgrade must preserve bootstrap identities/access/audit/buckets');
        const afterPermissions = new Set((await sql`select permission_code from public.role_permissions where role_id=${fixture.role}`).map(row => row.permission_code));
        for (const row of priorPermissions) assert.ok(afterPermissions.has(row.permission_code), 'Existing role permission lost');
        await sql.begin(async t => {
          await t`select set_config('request.jwt.claim.sub',${fixture.user},true)`;
          const [access] = await t`select private.has_permission(${fixture.branch},'roles.manage') as allowed`;
          assert.equal(access.allowed, true, 'Existing owner must retain role administration');
        });
        report.checks.push({ name: 'BOOTSTRAP_PRESERVED', status: 'PASS', priorPermissions: priorPermissions.length });
      }
      const shape = await catalog(sql);
      if (mode === 'clean') cleanCatalog = shape;
      else assert.deepEqual(shape, cleanCatalog, 'Clean and upgraded application catalogs must agree');
      report.checks.push({ name: mode === 'clean' ? 'CLEAN_49' : 'UPGRADE_9_TO_49', status: 'PASS', catalogFingerprint: hash(shape), objects: Object.fromEntries(Object.entries(shape).map(([key, value]) => [key, value.length])) });
      console.log(JSON.stringify({ progress: mode, status: 'PASS' }));
    } finally { await sql.end({ timeout: 5 }); }
  }
  report.status = 'PASS';
  report.limitations = ['Synthetic bootstrap, not a Production clone', 'Minimal Auth/Storage SQL fixtures, not managed service recovery', 'No Production mutation', 'No full application build or human UAT certification'];
} catch (error) {
  report.error = error.message;
  process.exitCode = 1;
} finally {
  for (const name of created.reverse()) {
    try {
      assert.match(name, new RegExp(`^hxqa_r12_${suffix}_(clean|upgrade)$`));
      await admin.unsafe(`DROP DATABASE "${name}"`);
      report.cleanup.push({ name, status: 'REMOVED' });
    } catch (error) {
      report.cleanup.push({ name, status: 'FAILED', code: error.code });
      report.status = 'FAIL';
      process.exitCode = 1;
    }
  }
  await admin.end({ timeout: 5 });
  console.log(JSON.stringify(report));
}
