import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import postgres from 'postgres';
import { capacity, database, guard, required } from './core.mjs';

// Prepare a guarded SQL Editor bundle; this script only connects to isolated QA.
const config = guard();
const folder = '/tmp/hienxa-cutover-20260922';
const files = (await readdir('supabase/migrations')).filter(f => /^\d+_.*\.sql$/.test(f)).sort();
const migrations = [];
for (const file of files) migrations.push({ file, text: await readFile(`supabase/migrations/${file}`, 'utf8') });
const fingerprint = createHash('sha256').update(JSON.stringify(migrations)).digest('hex');
assert.equal(fingerprint, '5355cde9dca41bffb2bb3633134f8a846793eb9099b3343bab80fb4bce42b4dc', 'Migration inputs changed: invalidate prior evidence');
assert.equal(migrations.length, 49);
for (const m of migrations.slice(9)) assert.ok(!/^\s*(?:BEGIN(?:\s+(?:TRANSACTION|WORK))?|COMMIT|ROLLBACK)\s*;/im.test(m.text), 'Nested transaction control requires review');
const versions = files.map(f => f.split('_')[0]);
const list = values => `ARRAY[${values.map(v => `'${v}'`).join(',')}]::text[]`;
const ledgerGuard = n => `IF ARRAY(SELECT version::text FROM supabase_migrations.schema_migrations ORDER BY version) <> ${list(versions.slice(0, n))} THEN RAISE EXCEPTION 'HX migration ledger mismatch: expected ${n} exact versions'; END IF;`;
const preserved = ['auth.users','auth.identities','public.branches','public.employees','public.roles','public.employee_branch_access','public.audit_events','storage.buckets','storage.objects','public.permissions','public.role_permissions'];
const collect = `EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),''[]''::jsonb) FROM %s t',item::regclass) INTO payload;`;
let bundle = `-- Target: nbwynrwkdbtfsitafsxa. Execute only after approved snapshot and browser target confirmation.
-- Exact source fingerprint: ${fingerprint}
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $hx_guard$ DECLARE item text; found_count bigint; expected_count bigint; BEGIN
 ${ledgerGuard(9)}
 IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')) <> 82 THEN RAISE EXCEPTION 'HX baseline table count changed'; END IF;
 FOR item IN SELECT format('%I.%I',n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY c.relname LOOP
  EXECUTE format('LOCK TABLE %s IN SHARE ROW EXCLUSIVE MODE',item);
  EXECUTE format('SELECT count(*) FROM %s',item) INTO found_count;
  expected_count := CASE WHEN item IN ('public.permissions','public.role_permissions') THEN 62 WHEN item IN ('public.branches','public.employees','public.roles','public.employee_branch_access','public.audit_events') THEN 1 ELSE 0 END;
  IF found_count <> expected_count THEN RAISE EXCEPTION 'HX data inventory changed for %',item; END IF;
 END LOOP;
 LOCK TABLE auth.users,auth.identities,storage.buckets,storage.objects IN SHARE ROW EXCLUSIVE MODE;
 IF (SELECT count(*) FROM auth.users)<>1 OR (SELECT count(*) FROM auth.identities)<>1 OR (SELECT count(*) FROM storage.buckets)<>3 OR EXISTS(SELECT 1 FROM storage.objects) THEN RAISE EXCEPTION 'HX managed data inventory changed'; END IF;
END $hx_guard$;
CREATE TEMP TABLE hx_cutover_snapshot(name text PRIMARY KEY,payload jsonb NOT NULL) ON COMMIT DROP;
DO $hx_capture$ DECLARE item text; payload jsonb; BEGIN
 FOREACH item IN ARRAY ${list(preserved)} LOOP
  ${collect}
  INSERT INTO hx_cutover_snapshot VALUES(item,payload);
 END LOOP;
END $hx_capture$;
`;
for (const m of migrations.slice(9)) {
 const version = m.file.split('_')[0];
 const name = m.file.slice(version.length + 1, -4);
 const delimiter = `$hx_migration_${version}$`;
 assert.ok(!m.text.includes(delimiter));
 bundle += `\n-- ${m.file}\n${m.text}\nINSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES ('${version}','${name}',ARRAY[${delimiter}${m.text}${delimiter}]);\n`;
}
bundle += `
DO $hx_verify$ DECLARE item text; payload jsonb; old_payload jsonb; BEGIN
 ${ledgerGuard(49)}
 FOREACH item IN ARRAY ${list(preserved)} LOOP
  ${collect}
  SELECT s.payload INTO old_payload FROM hx_cutover_snapshot s WHERE s.name=item;
  IF item IN ('public.permissions','public.role_permissions') THEN
   IF EXISTS(SELECT value FROM jsonb_array_elements(old_payload) EXCEPT ALL SELECT value FROM jsonb_array_elements(payload)) THEN RAISE EXCEPTION 'HX prior permission data lost: %',item; END IF;
  ELSIF payload IS DISTINCT FROM old_payload THEN RAISE EXCEPTION 'HX preserved data changed: %',item;
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND NOT c.relrowsecurity) THEN RAISE EXCEPTION 'HX public table without RLS'; END IF;
 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND has_table_privilege('anon',c.oid,'SELECT')) THEN RAISE EXCEPTION 'HX anonymous table read grant'; END IF;
END $hx_verify$;
NOTIFY pgrst,'reload schema';
-- HX_COMMIT
COMMIT;
SELECT 'HX_ATOMIC_UPGRADE_COMMITTED' AS result,count(*) AS migration_count FROM supabase_migrations.schema_migrations;
`;

const admin = await database();
const name = `hxqa_atomic_${randomUUID().replaceAll('-','').slice(0,12)}`;
const report = { status: 'FAIL', sourceFingerprint: fingerprint, checks: [], cleanup: 'NOT_CREATED' };
let sql;
try {
 await capacity(admin);
 await admin.unsafe(`CREATE DATABASE "${name}" TEMPLATE template0`);
 report.cleanup = 'PENDING';
 const url = new URL(required('DATABASE_URL'));
 url.hostname = `db.${config.ref}.supabase.co`; url.port = '5432'; url.username = 'postgres'; url.pathname = `/${name}`; url.search = '';
 const ssl = process.env.HX_QA_CA_FILE ? { rejectUnauthorized: true, ca: await readFile(process.env.HX_QA_CA_FILE,'utf8') } : 'verify-full';
 sql = postgres(url.href,{ssl,max:1,prepare:false,connect_timeout:10,onnotice:()=>{}});
 await sql.unsafe(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text); CREATE TABLE auth.identities(id uuid PRIMARY KEY,user_id uuid,provider text);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 GRANT USAGE ON SCHEMA auth TO authenticated,anon; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;
 CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean DEFAULT false,file_size_limit bigint,allowed_mime_types text[]);
 CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text REFERENCES storage.buckets(id),name text); ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
 CREATE SCHEMA supabase_migrations; CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY,statements text[],name text);`);
 for(const m of migrations.slice(0,9)) await sql.begin(async t=>{await t.unsafe(m.text);await t`INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES(${m.file.split('_')[0]},${m.file})`;});
 const f={user:randomUUID(),branch:randomUUID(),employee:randomUUID(),role:randomUUID(),access:randomUUID()};
 await sql.begin(async t=>{
  await t`INSERT INTO auth.users VALUES(${f.user},'atomic-rehearsal@example.test')`;
  await t`INSERT INTO auth.identities VALUES(${randomUUID()},${f.user},'email')`;
  await t`INSERT INTO public.branches(id,code,name) VALUES(${f.branch},'HXQA_ATOMIC','QA atomic rehearsal')`;
  await t`INSERT INTO public.employees(id,auth_user_id,code,display_name) VALUES(${f.employee},${f.user},'HXQA_OWNER','QA owner')`;
  await t`INSERT INTO public.roles(id,code,name,system_role) VALUES(${f.role},'owner','QA owner',true)`;
  await t`INSERT INTO public.role_permissions(role_id,permission_code) SELECT ${f.role},code FROM public.permissions`;
  await t`INSERT INTO public.employee_branch_access(id,employee_id,branch_id,role_id) VALUES(${f.access},${f.employee},${f.branch},${f.role})`;
  await t`INSERT INTO public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id) VALUES(${f.user},${f.branch},'rehearsal.bootstrap','employee',${f.employee},${randomUUID()})`;
 });
 const failureSQL=bundle.replace('-- HX_COMMIT',()=>"DO $$ BEGIN RAISE EXCEPTION 'HX deliberate rollback probe'; END $$;");
 let rejected=false;
 try {await sql.unsafe(failureSQL);} catch(e){await sql.unsafe('ROLLBACK');assert.ok(e.message.includes('HX deliberate rollback probe'),e.message);rejected=true;}
 assert.ok(rejected);
 assert.equal((await sql`SELECT count(*)::int AS n FROM supabase_migrations.schema_migrations`)[0].n,9);
 assert.equal((await sql`SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')`)[0].n,82);
 report.checks.push({name:'FAILURE_BEFORE_COMMIT_ROLLS_BACK',status:'PASS'});
 await sql.unsafe(bundle);
 assert.equal((await sql`SELECT count(*)::int AS n FROM supabase_migrations.schema_migrations`)[0].n,49);
 report.checks.push({name:'ATOMIC_UPGRADE_AND_PRESERVATION',status:'PASS'});
 let replayRejected=false;
 try {await sql.unsafe(bundle);} catch(e){await sql.unsafe('ROLLBACK');assert.ok(e.message.includes('expected 9 exact versions'),e.message);replayRejected=true;}
 assert.ok(replayRejected);
 report.checks.push({name:'REPLAY_REJECTED',status:'PASS'});
 await writeFile(`${folder}/production-upgrade-9-to-49.sql`,bundle,{mode:0o600});
 report.bundleSha256=createHash('sha256').update(bundle).digest('hex');report.bundleBytes=Buffer.byteLength(bundle);report.status='PASS';
} catch(e) {report.error=e.message;process.exitCode=1;}
finally {
 if(sql) {try{await sql.unsafe('ROLLBACK');}catch{} await sql.end({timeout:5});}
 if(report.cleanup==='PENDING') {try{await admin.unsafe(`DROP DATABASE "${name}"`);report.cleanup='REMOVED';}catch(e){report.cleanup='FAILED';report.status='FAIL';report.error=e.message;process.exitCode=1;}}
 await admin.end({timeout:5});
 report.limitations=['Synthetic bootstrap, not Production identity replication','No managed Auth/Storage service recovery','No Production connection or mutation'];
 await writeFile(`${folder}/atomic-rehearsal.json`,JSON.stringify(report,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify(report));
}
