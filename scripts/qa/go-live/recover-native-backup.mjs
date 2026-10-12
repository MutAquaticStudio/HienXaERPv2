import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import postgres from "postgres";
import { argumentsForRun } from "../remediation/native-fixture.mjs";

const a = argumentsForRun();
for (const name of ["root", "runtime", "backup", "snapshot", "out"]) assert.ok(a[name]);
assert.ok(path.isAbsolute(a.root) && path.isAbsolute(a.runtime));
const database = "hx_remediation_go_live_browser175";
const directory = path.join(a.root, "cluster-data");
const bin = path.join(a.runtime, "Contents/Versions/17/bin");
try { await access(directory); throw new Error("Preserve existing cluster; choose a new owned root"); }
catch (error) { if (error.code !== "ENOENT") throw error; }
await mkdir(a.root, { recursive: true, mode: 0o700 });
const config = { host: "127.0.0.1", port: 49760, username: "postgres", password: randomBytes(32).toString("hex") };
const passwordFile = path.join(a.root, "init-password");
await writeFile(passwordFile, config.password, { mode: 0o600 });
await writeFile(path.join(a.root, "native-private-credentials.json"), JSON.stringify(config), { mode: 0o600 });
function run(name, args) {
  const result = spawnSync(path.join(bin, name), args, {
    env: { ...process.env, PGPASSWORD: config.password }, encoding: "utf8",
  });
  assert.equal(result.status, 0, `${name} failed: ${result.stderr}`);
}
run("initdb", ["-D", directory, "-U", "postgres", "--pwfile", passwordFile, "--auth-local=scram-sha-256", "--auth-host=scram-sha-256", "--encoding=UTF8", "--locale=C"]);
run("pg_ctl", ["-D", directory, "-l", path.join(a.root, "postgres.log"), "-o", "-h 127.0.0.1 -p 49760 -k " + a.root, "-w", "start"]);
const admin = postgres({ ...config, database: "postgres", max: 1, prepare: false });
let sql;
try {
  await admin.unsafe("create role anon nologin; create role authenticated nologin; create role service_role nologin;").simple();
  await admin.unsafe(`create database ${database} template template0`);
  run("pg_restore", ["--host", config.host, "--port", String(config.port), "--username", config.username, "--dbname", database, "--exit-on-error", "--no-owner", a.backup]);
  sql = postgres({ ...config, database, max: 1, prepare: false });
  const expected = JSON.parse(await readFile(a.snapshot, "utf8"));
  assert.equal(createHash("sha256").update(await readFile(a.backup)).digest("hex"), expected.backupSha256);
  const checks = [];
  for (const table of expected.tableChecks) {
    assert.match(table.table, /^[a-z_]+$/);
    const [actual] = await sql.unsafe(`select count(*)::int n,md5(coalesce(string_agg(md5(to_jsonb(x)::text),',' order by to_jsonb(x)::text),'')) hash from public.${table.table} x`);
    assert.equal(actual.n, table.n, table.table + " count");
    assert.equal(actual.hash, table.hash, table.table + " content");
    checks.push({ table: table.table, ...actual });
  }
  const [schema] = await sql`select count(*)::int n,max(version) version from supabase_migrations.schema_migrations`;
  assert.equal(schema.n, 176);
  await writeFile(a.out, JSON.stringify({
    status: "PASS_NATIVE_BACKUP_RESTORE", checkedAt: new Date().toISOString(), database,
    backupSha256: expected.backupSha256, backupPoint: "2026-10-12T04:20:14+07:00",
    schema, publicTables: checks, fullPublicRowContentMatches: true,
    laterBrowserEvidence: "Preserved as prior evidence; later writes are not present in this pre177 backup and are not replayed",
    productionAccess: "NONE", productionRecovery: "NOT_PROVEN_BY_THIS_NATIVE_RESTORE",
  }, null, 2));
  console.log(JSON.stringify({ status: "PASS_NATIVE_BACKUP_RESTORE", schema: schema.n, tables: checks.length, productionAccess: "NONE" }));
} finally { if (sql) await sql.end({ timeout: 3 }); await admin.end({ timeout: 3 }); }
