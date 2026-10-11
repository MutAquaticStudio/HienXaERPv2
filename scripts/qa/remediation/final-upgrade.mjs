import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import postgres from "postgres";
import { argumentsForRun } from "./native-fixture.mjs";

const args = argumentsForRun();
for (const name of ["credentials", "database", "out"]) assert.ok(args[name]);
assert.match(args.database, /^hx_remediation_upgrade136_[a-z0-9_]+$/);
const config = JSON.parse(await readFile(args.credentials, "utf8"));
assert.equal(config.host, "127.0.0.1");
assert.equal(config.port, 49760);
const db = postgres({ ...config, database: args.database, max: 1, prepare: false, onnotice() {} });
const quote = value => `"${value.replaceAll('"', '""')}"`;
try {
  const [identity] = await db`select current_setting('data_directory') directory`;
  assert.match(identity.directory, /^\/private\/tmp\/hx-pr41-native\.[^/]+\/cluster-data$/);
  const [baseline] = await db`select count(*)::int n from supabase_migrations.schema_migrations`;
  assert.equal(baseline.n, 136, "Use the restored preceding implementation, not an empty database");
  const tables = await db`select c.table_schema schema, c.table_name name,
    array_agg(c.column_name order by c.ordinal_position) columns
    from information_schema.columns c join pg_tables t
    on t.schemaname=c.table_schema and t.tablename=c.table_name
    where c.table_schema in ('public','private') group by c.table_schema,c.table_name
    order by c.table_schema,c.table_name`;
  async function snapshot() {
    const result = [];
    for (const table of tables) {
      const [facts] = await db.unsafe(`select count(*)::int n,
        md5(coalesce(string_agg(md5(to_jsonb(x)::text),',' order by to_jsonb(x)::text),'')) hash
        from (select ${table.columns.map(quote).join(',')} from ${quote(table.schema)}.${quote(table.name)}) x`);
      result.push({ schema: table.schema, table: table.name, ...facts });
    }
    return result;
  }
  const before = await snapshot();
  const directory = new URL('../../../supabase/migrations/', import.meta.url);
  const applied = [];
  for (const file of (await readdir(directory)).filter(name => name.endsWith('.sql')).sort()) {
    const version = file.split('_')[0];
    const [exists] = await db`select exists(select 1 from supabase_migrations.schema_migrations where schema_migrations.version=${version}) present`;
    if (exists.present) continue;
    const source = await readFile(new URL(file, directory), 'utf8');
    await db.unsafe(source).simple();
    await db`insert into supabase_migrations.schema_migrations(version) values(${version})`;
    assert.deepEqual(await snapshot(), before, `Existing source facts changed after ${file}`);
    applied.push({ file, sha256: createHash('sha256').update(source).digest('hex') });
  }
  assert.equal(applied.length, 28);
  const [history] = await db`select count(*)::int n from supabase_migrations.schema_migrations`;
  assert.equal(history.n, 164);
  const [security] = await db`select count(*)::int missing from pg_class c join pg_namespace n
    on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity`;
  assert.equal(security.missing, 0);
  const report = { scope: 'REPRESENTATIVE_RESTORED136_TO164_APPLICATION_UPGRADE', status: 'PASS',
    database: args.database, precedingSchema: baseline.n, finalSchema: history.n,
    oldPublicAndPrivateFactsUnchanged: true, tableChecks: before, migrations: applied,
    publicTablesMissingRls: security.missing, managedAuthStoragePitrRecovery: 'NOT_VERIFIED', productionAccess: 'NONE' };
  await writeFile(args.out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, precedingSchema: baseline.n, finalSchema: history.n,
    preservedTables: before.length, applied: applied.length }));
} finally { await db.end({ timeout: 3 }); }
