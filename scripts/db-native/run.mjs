// Native PostgreSQL migration and invariant check.
// Creates a disposable database on a LOCAL server, applies a Supabase stand-in, every migration in order,
// checks security invariants, then runs supabase/tests/native/*.sql (each rolled back).
// Usage: HX_TEST_PG_URL=postgres://postgres@127.0.0.1:5432/postgres node scripts/db-native/run.mjs
import { readdir, readFile } from "node:fs/promises";
import postgres from "postgres";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const root = new URL("../../", import.meta.url);
const migrationDir = new URL("supabase/migrations/", root);
const testDir = new URL("supabase/tests/native/", root);

const rawUrl = process.env.HX_TEST_PG_URL;
if (!rawUrl) {
  console.error("HX_TEST_PG_URL is required (a local PostgreSQL server, e.g. postgres://postgres@127.0.0.1:5432/postgres).");
  process.exit(1);
}
const serverUrl = new URL(rawUrl);
if (!LOCAL_HOSTS.has(serverUrl.hostname)) {
  console.error("Database guard rejected a non-local host.");
  process.exit(1);
}

const dbName = `hx_native_${process.pid}`;
const quiet = { onnotice: () => {}, max: 1 };
const admin = postgres(rawUrl, quiet);
const dbUrl = new URL(rawUrl);
dbUrl.pathname = `/${dbName}`;
let db;
let failed = false;

/** PostgreSQL < 17 has no MAINTAIN privilege; Supabase runs 17. Only used for local runs on older servers. */
function compat(sqlText) {
  return sqlText
    .replace(/has_table_privilege\(([^()]*),\s*'MAINTAIN'\)/gi, "false")
    .replace(/,\s*maintain\b/gi, "");
}

function lineOf(text, position) {
  return position ? text.slice(0, Number(position)).split("\n").length : "?";
}

async function offenders(label, query) {
  const rows = await db.unsafe(query);
  if (rows.length) {
    failed = true;
    console.error(`FAIL ${label}:`);
    for (const row of rows.slice(0, 20)) console.error(`  - ${Object.values(row).join(" ")}`);
  } else {
    console.info(`PASS ${label}`);
  }
}

try {
  await admin.unsafe(`create database ${dbName}`);
  db = postgres(dbUrl.toString(), quiet);
  const [{ server_version_num: version }] = await db`select current_setting('server_version_num')::int as server_version_num`;
  const legacy = version < 170000;
  if (legacy) console.warn(`WARN PostgreSQL ${version}: MAINTAIN privilege rewritten for local compatibility. CI uses PostgreSQL 17.`);

  await db.unsafe(await readFile(new URL("scripts/db-native/shim.sql", root), "utf8")).simple();

  const migrations = (await readdir(migrationDir)).filter((name) => name.endsWith(".sql")).sort();
  for (const name of migrations) {
    const original = await readFile(new URL(name, migrationDir), "utf8");
    const text = legacy ? compat(original) : original;
    try {
      await db.unsafe(text).simple();
    } catch (error) {
      console.error(`FAIL migration ${name}:${lineOf(text, error.position)} ${error.code ?? ""} ${error.message}`);
      process.exitCode = 1;
      throw new Error("migration_failed");
    }
  }
  console.info(`PASS ${migrations.length} migrations applied`);

  await offenders("RLS enabled on every public table", `
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity order by 1`);
  await offenders("anon has no table privileges in public", `
    select c.relname, p.privilege from pg_class c join pg_namespace n on n.oid = c.relnamespace
    cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) p(privilege)
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
      and has_table_privilege('anon', c.oid, p.privilege) order by 1, 2`);
  await offenders("SECURITY DEFINER functions pin search_path", `
    select n.nspname || '.' || p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where p.prosecdef and n.nspname in ('public', 'private')
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%') order by 1`);
  await offenders("anon cannot execute SECURITY DEFINER functions in public", `
    select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where p.prosecdef and n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE') order by 1`);

  let tests = [];
  try { tests = (await readdir(testDir)).filter((name) => name.endsWith(".sql") && !name.startsWith("_")).sort(); } catch { tests = []; }
  const setup = tests.length ? await readFile(new URL("_setup.sql", testDir), "utf8") : "";
  const rollback = new Error("rollback");
  for (const name of tests) {
    const text = `${setup}\n${await readFile(new URL(name, testDir), "utf8")}`;
    try {
      await db.begin(async (tx) => {
        await tx.unsafe(text).simple();
        throw rollback;
      });
    } catch (error) {
      if (error === rollback) {
        console.info(`PASS test ${name}`);
      } else {
        failed = true;
        console.error(`FAIL test ${name}:${lineOf(text, error.position)} ${error.code ?? ""} ${error.message}`);
      }
    }
  }
} catch (error) {
  if (error.message !== "migration_failed") console.error(error);
  failed = true;
} finally {
  await db?.end();
  if (process.env.HX_TEST_KEEP_DB === "1") console.info(`Kept database ${dbName}`);
  else await admin.unsafe(`drop database if exists ${dbName}`);
  await admin.end();
}

if (failed) process.exitCode = 1;
