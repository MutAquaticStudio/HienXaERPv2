import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile, chmod, access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { argumentsForRun, openQA } from "../remediation/native-fixture.mjs";
const a = argumentsForRun(), q = await openQA(a);
assert.equal(a.database, "hx_remediation_go_live_browser175");
assert.ok(path.isAbsolute(a.backup) && !a.backup.startsWith(process.cwd() + path.sep));
try { await access(a.backup); throw new Error("Preserve existing backup"); }
catch (error) { if (error.code !== "ENOENT") throw error; }
try {
  const [schema] = await q.sql`select count(*)::int count,max(version) latest from supabase_migrations.schema_migrations`;
  assert.equal(schema.count, 177);
  const tables = await q.sql`select c.relname name from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by c.relname`;
  const facts = [];
  for (const table of tables) {
    assert.match(table.name, /^[a-z_]+$/);
    const [row] = await q.sql.unsafe(`select count(*)::int n,md5(coalesce(string_agg(md5(to_jsonb(x)::text),',' order by to_jsonb(x)::text),'')) hash from public.${table.name} x`);
    facts.push({ table: table.name, ...row });
  }
  const config = JSON.parse(await readFile(a.credentials, "utf8"));
  const args = ["--host", config.host, "--port", String(config.port), "--username", config.username, "--dbname", a.database];
  const run = spawnSync(a.bin + "/pg_dump", [...args, "--format=custom", "--file", a.backup], { env: { ...process.env, PGPASSWORD: config.password }, encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr); await chmod(a.backup, 0o600);
  const readable = spawnSync(a.bin + "/pg_restore", ["--list", a.backup], { encoding: "utf8" });
  assert.equal(readable.status, 0, readable.stderr);
  const hash = createHash("sha256").update(await readFile(a.backup)).digest("hex");
  await writeFile(a.out, JSON.stringify({ status: "PASS_NATIVE_CHECKPOINT_ARCHIVE_READABLE", checkedAt: new Date().toISOString(), database: a.database, schema, backupSha256: hash, tableChecks: facts, restoreOfThisNewCheckpoint: "NOT_YET_RUN", priorRestoreProof: "NATIVE_BACKUP_RECOVERY_RESUME.json", managedAuthAndStorageBackup: false, productionAccess: "NONE" }, null, 2));
  console.log(JSON.stringify({ status: "PASS_NATIVE_CHECKPOINT_ARCHIVE_READABLE", schema: schema.count, tables: facts.length }));
} finally { await q.sql.end({ timeout: 3 }); }
