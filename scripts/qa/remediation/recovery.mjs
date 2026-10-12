import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import postgres from "postgres";
import { argumentsForRun } from "./native-fixture.mjs";

const args = argumentsForRun();
for (const key of ["credentials", "database", "backup", "pg-bin", "expected", "out"]) assert.ok(args[key]);
const config = JSON.parse(await readFile(args.credentials, "utf8"));
assert.equal(config.host, "127.0.0.1");
assert.equal(config.port, 49760);
assert.match(args.database, /^hx_remediation_[a-z0-9_]+$/);
const expected = JSON.parse(await readFile(args.expected, "utf8"));
const admin = postgres({ ...config, database: "postgres", max: 1, prepare: false, onnotice() {} });
let restored;
try {
  const [identity] = await admin`select current_setting('data_directory') directory`;
  assert.match(identity.directory, /^\/private\/tmp\/hx-pr41-native\.[^/]+\/cluster-data$/);
  const [exists] = await admin`select exists(select 1 from pg_database where datname=${args.database}) present`;
  assert.equal(exists.present, false, "Never overwrite an existing database");
  await admin.unsafe(`create database "${args.database}" template template0`);
  const restore = spawnSync(args["pg-bin"] + "/pg_restore", ["--host", config.host, "--port", String(config.port),
    "--username", config.username, "--dbname", args.database, "--exit-on-error", args.backup],
  { env: { ...process.env, PGPASSWORD: config.password }, encoding: "utf8" });
  assert.equal(restore.status, 0, restore.stderr);
  restored = postgres({ ...config, database: args.database, max: 1, prepare: false, onnotice() {} });
  const quote = (value) => `"${value.replaceAll('"', '""')}"`;
  for (const table of expected.tableChecks) {
    const [actual] = await restored.unsafe(`select count(*)::int n,
      md5(coalesce(string_agg(md5(to_jsonb(x)::text),',' order by to_jsonb(x)::text),'')) hash
      from public.${quote(table.table)} x`);
    assert.equal(actual.n, table.n);
    assert.equal(actual.hash, table.hash);
  }
  const [history] = await restored`select count(*)::int n from supabase_migrations.schema_migrations`;
  assert.equal(history.n, expected.schemaHistoryCount - 1);
  await writeFile(args.out, JSON.stringify({ scope: "ISOLATED_NATIVE_DATABASE_ARCHIVE_RECOVERY", database: args.database,
    status: "PASS_NATIVE_DATA_RECOVERY", restoredTables: expected.tableChecks.length, migrationHistory: history.n,
    managedAuthStoragePitrRecovery: "NOT_VERIFIED", productionAccess: "NONE" }, null, 2));
  console.log(JSON.stringify({ status: "PASS_NATIVE_DATA_RECOVERY", tables: expected.tableChecks.length, migrationHistory: history.n }));
} finally { if (restored) await restored.end({ timeout: 3 }); await admin.end({ timeout: 3 }); }
