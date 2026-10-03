import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { migrationBody, migrationManifest, migrationParity } from './migration-manifest.mjs';

const folder = resolve(process.env.HX_REHEARSAL_DIR ?? '/private/tmp/hx-local-candidate-rehearsal');
await mkdir(folder, { recursive: true });
const manifest = await migrationManifest();
const report = { environment: 'isolated local PostgreSQL/PGlite', migrationFingerprint: manifest.fingerprint,
  migrationManifest: manifest.migrations.map(migration => ({ order: migration.order, version: migration.version, path: migration.path, sha256: migration.sha256 })), checks: [], production: 'NOT_TOUCHED',
  managedAuthStorageRestore: 'NOT_TESTED', twoSessionConcurrency: 'NOT_SUPPORTED_BY_THIS_RUNTIME' };
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const databases = [];
async function fresh() {
  const db = await PGlite.create({ extensions: { pgcrypto } }); databases.push(db);
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key,email text);
    create table auth.identities(id uuid primary key,user_id uuid references auth.users(id),provider text);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean default false,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
    alter table storage.objects enable row level security;
    create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);`);
  return db;
}
async function apply(tx, migration) {
  await tx.exec(migrationBody(migration.sql));
  await tx.query('insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)',
    [migration.version, migration.path, [migration.sql]]);
}
async function catalog(db) {
  const queries = {
    columns: `select table_schema,table_name,column_name,data_type,udt_name,is_nullable,column_default from information_schema.columns where table_schema in ('public','private') order by 1,2,ordinal_position`,
    constraints: `select n.nspname,c.relname,p.conname,pg_get_constraintdef(p.oid) definition from pg_constraint p join pg_class c on c.oid=p.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') order by 1,2,3`,
    functions: `select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prokind='f' order by 1,2,3`,
    views: `select schemaname,viewname,definition from pg_views where schemaname='public' order by 1,2`,
    policies: `select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname in ('public','storage') order by 1,2,3`,
    indexes: `select schemaname,tablename,indexname,indexdef from pg_indexes where schemaname in ('public','private') order by 1,2,3`,
  };
  const result = {}; for (const [key, sql] of Object.entries(queries)) result[key] = (await db.query(sql)).rows;
  return result;
}
async function dataManifest(db) {
  const tables = (await db.query(`select schemaname,tablename from pg_tables where schemaname in ('public','auth','storage','supabase_migrations') order by 1,2`)).rows;
  const result = {};
  for (const table of tables) {
    const name = `${table.schemaname}.${table.tablename}`;
    if (!/^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/.test(name)) throw new Error('Unsafe fixture table name');
    const rows = (await db.query(`select to_jsonb(t)::text as row from ${name} t order by to_jsonb(t)::text`)).rows;
    result[name] = { count: rows.length, sha256: hash(rows) };
  }
  return result;
}
try {
  const clean = await fresh();
  for (const migration of manifest.migrations) await clean.transaction(tx => apply(tx, migration));
  const applied = (await clean.query('select version,statements from supabase_migrations.schema_migrations order by version')).rows;
  report.migrationParity = migrationParity(manifest, applied);
  assert.equal(report.migrationParity.result, 'PASS');
  const signature = (await clean.query(`select pg_get_function_identity_arguments(p.oid) as args from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='handoff_delivery'`)).rows;
  assert.deepEqual(signature.map(row => row.args), ['target_delivery_id uuid, expected_version integer, handed_off_at timestamp with time zone, operation_id uuid']);
  report.checks.push({ name: 'EXACT_MANIFEST_AND_HANDOFF_SIGNATURE', result: 'PASS' });

  const upgraded = await fresh();
  const boundary = manifest.migrations.findIndex(m => m.version === '20260914060713') + 1;
  assert.ok(boundary > 0, 'Historical bootstrap identity is required');
  for (const migration of manifest.migrations.slice(0, boundary)) await upgraded.transaction(tx => apply(tx, migration));
  const user = randomUUID();
  await upgraded.query('insert into auth.users values($1,$2)', [user, 'rehearsal@example.test']);
  await upgraded.query('insert into auth.identities values($1,$2,$3)', [randomUUID(), user, 'email']);
  await upgraded.query('insert into storage.buckets(id,name,public) values($1,$2,false)', ['hxqa-restore-private', 'Local synthetic evidence']);
  const before = await dataManifest(upgraded); const beforeCatalog = await catalog(upgraded);
  await assert.rejects(upgraded.transaction(async tx => {
    for (const migration of manifest.migrations.slice(boundary)) await apply(tx, migration);
    throw new Error('HX deliberately abort whole candidate upgrade');
  }), /deliberately abort/);
  assert.deepEqual(await dataManifest(upgraded), before);
  assert.deepEqual(await catalog(upgraded), beforeCatalog);
  await upgraded.transaction(async tx => { for (const migration of manifest.migrations.slice(boundary)) await apply(tx, migration); });
  assert.deepEqual(await catalog(upgraded), await catalog(clean));
  assert.equal((await upgraded.query('select id::text from auth.users where id=$1', [user])).rows[0].id, user);
  assert.equal((await upgraded.query("select public from storage.buckets where id='hxqa-restore-private'")).rows[0].public, false);
  report.checks.push({ name: 'UPGRADE_ROLLBACK_AND_PRESERVATION', result: 'PASS' });

  // Business data comes only from the isolated delivery runner, never a live DB.
  const source = process.env.HX_RULES_SNAPSHOT
    ? await PGlite.create({ extensions: { pgcrypto }, loadDataDir: new Blob([await readFile(process.env.HX_RULES_SNAPSHOT)]) }) : upgraded;
  if (source !== upgraded) databases.push(source);
  await source.exec('reset role');
  assert.deepEqual(await catalog(source), await catalog(clean), 'Business snapshot must match the exact current candidate schema');
  const sourceData = await dataManifest(source);
  const dump = await source.dumpDataDir('none');
  const bytes = Buffer.from(await dump.arrayBuffer()); await writeFile(`${folder}/local-fixture-backup.tar`, bytes, { mode: 0o600 });
  const restored = await PGlite.create({ extensions: { pgcrypto }, loadDataDir: new Blob([bytes]) }); databases.push(restored);
  await restored.exec('reset role');
  assert.deepEqual(await catalog(restored), await catalog(source));
  assert.deepEqual(await dataManifest(restored), sourceData);
  report.restoreTables = sourceData; report.backupSha256 = createHash('sha256').update(bytes).digest('hex');
  report.checks.push({ name: 'ACTUAL_LOCAL_RESTORE_AND_ALL_TABLE_RECONCILIATION', result: 'PASS' });
  report.result = 'PASS';
} catch (error) { report.result = 'FAIL'; report.error = { message: error.message, code: error.code }; process.exitCode = 1; }
finally { for (const db of databases) await db.close(); }
await writeFile(`${folder}/rehearsal.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ result: report.result, migrationParity: report.migrationParity?.result, checks: report.checks, error: report.error }));
