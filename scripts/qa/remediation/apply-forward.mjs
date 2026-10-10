import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const args = Object.fromEntries(process.argv.slice(2).reduce((rows, value, index, all) => {
  if (index % 2 === 0) rows.push([value.replace(/^--/, ""), all[index + 1]]);
  return rows;
}, []));
for (const key of ["credentials", "database", "migration", "pg-bin", "backup", "out"]) assert.ok(args[key], `Missing --${key}`);
const config = JSON.parse(await readFile(args.credentials, "utf8"));
assert.equal(config.host, "127.0.0.1");
assert.equal(config.port, 49760);
assert.match(args.database, /^hx_remediation_[a-z0-9_]+$/);
const migrationPath = path.resolve(args.migration);
assert.match(migrationPath, /\/supabase\/migrations\/\d{14}_[a-z0-9_]+\.sql$/);
const database = postgres({ ...config, database: args.database, max: 1, prepare: false, onnotice() {} });
const quote = (value) => `"${value.replaceAll('"', '""')}"`;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
try {
  const [identity] = await database`select current_database() db,current_setting('data_directory') directory`;
  assert.equal(identity.db, args.database);
  assert.match(identity.directory, /^\/private\/tmp\/hx-pr41-native\.[^/]+\/cluster-data$/);
  const version = path.basename(migrationPath).split("_")[0];
  const [present] = await database`select exists(select 1 from supabase_migrations.schema_migrations where schema_migrations.version=${version}) value`;
  assert.equal(present.value, false, "Do not replay an applied migration");
  const dump = spawnSync(path.join(args["pg-bin"], "pg_dump"), ["--host", config.host, "--port", String(config.port),
    "--username", config.username, "--dbname", args.database, "--format=custom", "--file", args.backup],
  { env: { ...process.env, PGPASSWORD: config.password }, encoding: "utf8" });
  assert.equal(dump.status, 0, dump.stderr);
  await chmod(args.backup, 0o600);
  const tables = await database`select table_name,array_agg(column_name order by ordinal_position) columns
    from information_schema.columns where table_schema='public'
    and table_name in(select tablename from pg_tables where schemaname='public') group by table_name order by table_name`;
  async function snapshot() {
    const result = [];
    for (const table of tables) {
      const [value] = await database.unsafe(`select count(*)::int n,
        md5(coalesce(string_agg(md5(to_jsonb(x)::text),',' order by to_jsonb(x)::text),'')) hash
        from(select ${table.columns.map(quote).join(",")} from public.${quote(table.table_name)}) x`);
      result.push({ table: table.table_name, ...value });
    }
    return result;
  }
  const before = await snapshot();
  const migration = await readFile(migrationPath, "utf8");
  // The migration has its own BEGIN/COMMIT. A failure rolls its schema changes back.
  await database.unsafe(migration).simple();
  const after = await snapshot();
  assert.deepEqual(after, before, "Existing business columns/rows changed; review the impact before recording acceptance");
  await database`insert into supabase_migrations.schema_migrations(version) values(${version})`;
  const [history] = await database`select count(*)::int n from supabase_migrations.schema_migrations`;
  await writeFile(args.out, JSON.stringify({ name: "FORWARD_QA_UPGRADE", database: args.database,
    migration: path.basename(migrationPath), sha256: sha256(migration), backupSha256: sha256(await readFile(args.backup)),
    existingPublicDataUnchanged: true, tableChecks: before, schemaHistoryCount: history.n, productionAccess: "NONE" }, null, 2));
  process.stdout.write(JSON.stringify({ applied: path.basename(migrationPath), existingPublicDataUnchanged: true, history: history.n }) + "\n");
} finally {
  await database.end({ timeout: 3 });
}
