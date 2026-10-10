import assert from "node:assert/strict";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import postgres from "postgres";
import { argumentsForRun } from "./native-fixture.mjs";

const args = argumentsForRun();
for (const key of ["credentials", "database", "out"]) assert.ok(args[key]);
const config = JSON.parse(await readFile(args.credentials, "utf8"));
assert.equal(config.host, "127.0.0.1");
assert.equal(config.port, 49760);
assert.match(args.database, /^hx_remediation_[a-z0-9_]+$/);
const admin = postgres({ ...config, database: "postgres", max: 1, prepare: false, onnotice() {} });
let database;
try {
  const [identity] = await admin`select current_setting('data_directory') directory`;
  assert.match(identity.directory, /^\/private\/tmp\/hx-pr41-native\.[^/]+\/cluster-data$/);
  const [existing] = await admin`select exists(select 1 from pg_database where datname=${args.database}) present`;
  assert.equal(existing.present, false, "Preserve existing databases; choose a fresh owned QA name");
  await admin.unsafe(`create database "${args.database}" template template0`);
  database = postgres({ ...config, database: args.database, max: 1, prepare: false, onnotice() {} });
  await database.unsafe(`create schema extensions; create extension pgcrypto with schema extensions;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
        nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
    $$;
    create schema supabase_migrations;
    create table supabase_migrations.schema_migrations(version text primary key);`).simple();
  const directory = new URL("../../../supabase/migrations/", import.meta.url);
  const manifest = [];
  for (const file of (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort()) {
    const source = await readFile(new URL(file, directory), "utf8");
    await database.unsafe(source).simple();
    await database`insert into supabase_migrations.schema_migrations(version) values(${file.split("_")[0]})`;
    manifest.push({ file, sha256: createHash("sha256").update(source).digest("hex") });
  }
  const [security] = await database`select count(*)::int unprotected_tables from pg_class c
    join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity`;
  assert.equal(security.unprotected_tables, 0);
  await database.unsafe("set role authenticated");
  const noIdentity = await database`select id from public.delivery_verification_line_read`;
  assert.equal(noIdentity.length, 0);
  await database.unsafe("reset role");
  await writeFile(args.out, JSON.stringify({ scope: "FRESH_NATIVE_APPLICATION_SCHEMA_AUTH_SHIM", database: args.database,
    status: "PASS_SCHEMA_FROM_ZERO", migrations: manifest, unprotectedPublicTables: security.unprotected_tables,
    authenticatedWithoutIdentityRows: noIdentity.length, managedAuthOrStorageRecovery: "NOT_TESTED", productionAccess: "NONE" }, null, 2));
  console.log(JSON.stringify({ status: "PASS_SCHEMA_FROM_ZERO", migrations: manifest.length, unprotectedPublicTables: 0 }));
} finally { if (database) await database.end({ timeout: 3 }); await admin.end({ timeout: 3 }); }
