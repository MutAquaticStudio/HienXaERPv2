import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import { argumentsForRun } from "../remediation/native-fixture.mjs";
import { migrationBody, migrationManifest } from "../migration-manifest.mjs";

// Reconstruct only the catalog version set. Never connect to managed Supabase,
// load business rows, or claim this replaces a Production backup/restore.
const args = argumentsForRun();
for (const key of ["credentials", "out"]) assert.ok(args[key], `Missing --${key}`);
const config = JSON.parse(await readFile(args.credentials, "utf8"));
assert.equal(config.host, "127.0.0.1");
assert.equal(config.port, 49761);
assert.equal(config.username, "postgres");
assert.equal(path.basename(path.dirname(args.credentials)), "target78-rehearsal");
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const prefix = `hx_remediation_target78_${suffix}_`;
const databaseNames = { baseline: prefix + "baseline", fresh: prefix + "fresh" };
for (const value of Object.values(databaseNames)) assert.match(value, /^hx_remediation_target78_[a-z0-9_]+$/);
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const report = {
  scope: "RECONSTRUCTED_TARGET78_NATIVE_APPLICATION_SCHEMA",
  status: "RUNNING", checkedAt: new Date().toISOString(), productionAccess: "NONE",
  managedQAAccess: "NONE", businessFixturesCreated: false,
  productionBackupReplacement: false, managedAuthStorageRecovery: "NOT_TESTED",
  reconstructedBaselineIsProductionClone: false, createdDatabases: [], cleanup: [],
  browserQAClusterAccess: "NONE_SEPARATE_CLUSTER_49761",
  baselineMigrations: [], freshMigrations: [], tailMigrations: [], legacyProbes: [],
  bridgeActions: [], limitations: [
    "Canonical SQL for the 78 ledger versions, not Production data or hand-edited definitions",
    "Minimal native Auth schema; Storage/Realtime services are absent",
    "No target backup, managed recovery, or business-state upgrade proof",
    "Bridge is a structural experiment; historical migration ledger repair is not performed",
  ],
};
try {
  const previous = JSON.parse(await readFile(args.out, "utf8"));
  if (previous.scope === report.scope) report.priorStructuralAttempt = previous.priorStructuralAttempt ?? {
    status: previous.status, completedAt: previous.completedAt, error: previous.error,
    naiveMissingHistoryReplay: previous.naiveMissingHistoryReplay,
    finalCatalog: previous.finalCatalog && { status: previous.finalCatalog.status, differences: previous.finalCatalog.differences },
  };
  if (previous.productionFunctionsReadOnly) report.productionFunctionsReadOnly = previous.productionFunctionsReadOnly;
  if (previous.experimentalBridgeArtifact) report.experimentalBridgeArtifact = previous.experimentalBridgeArtifact;
  if (args["bridge-sql"] && previous.bridgeActions) report.sourceBridgePlan = previous.bridgeActions;
} catch (error) { if (error.code !== "ENOENT") throw error; }
if (report.productionFunctionsReadOnly) report.productionAccess = "READ_ONLY_PUBLIC_PRIVATE_FUNCTION_CATALOG_NO_BUSINESS_ROWS";
const manifest = await migrationManifest();
const baselineCatalog = JSON.parse(await readFile("reports/go-live-acceptance/PRODUCTION_CATALOG_BASELINE.json", "utf8"));
const versions = new Set(baselineCatalog.versions);
assert.equal(versions.size, 78);
const baseline = manifest.migrations.filter(m => versions.has(m.version));
assert.equal(baseline.length, 78);
const missing = manifest.migrations.filter(m => !versions.has(m.version));
const head = [...versions].sort().at(-1);
const historical = missing.filter(m => m.version < head);
const tail = missing.filter(m => m.version > head);
assert.equal(historical.length, 8);
assert.equal(tail.length, 100);
assert.equal(manifest.migrations.length, 186);
report.migrationFingerprint = manifest.fingerprint;
report.targetLedgerHead = head;
report.sourceVersionDifference = { baseline: baseline.length, historical: historical.length, tail: tail.length };
const clients = [];
const admin = postgres({ ...config, database: "postgres", max: 1, prepare: false, onnotice() {} });
async function persist() { await writeFile(args.out, JSON.stringify(report, null, 2) + "\n"); }
async function owned(sql, name) {
  const [identity] = await sql`select current_database() db,current_setting('data_directory') directory`;
  assert.equal(identity.db, name);
  assert.equal(identity.directory, path.join(path.dirname(args.credentials), "cluster-data"));
}
async function create(mode) {
  const name = databaseNames[mode];
  assert.ok(name.startsWith(prefix));
  const [existing] = await admin`select exists(select 1 from pg_database where datname=${name}) present`;
  assert.equal(existing.present, false, "Preserve every existing database");
  await admin.unsafe(`create database "${name}" template template0`);
  report.createdDatabases.push(name);
  const sql = postgres({ ...config, database: name, max: 1, prepare: false, onnotice() {} });
  clients.push(sql);
  await owned(sql, name);
  await sql.unsafe(`create schema extensions; create extension pgcrypto with schema extensions;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
        nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
    $$;
    create schema supabase_migrations;
    create table supabase_migrations.schema_migrations(version text primary key,statements text[]);`).simple();
  return sql;
}
async function guardNoSharedRoleMutation() {
  // Re-check cluster identity before any DDL, including canonical ALTER ROLE.
  // This is a separate cluster, so the authenticator hook cannot affect browser QA.
  await owned(admin, "postgres");
}
async function apply(sql, migration, source = migration.sql, record = true) {
  await guardNoSharedRoleMutation();
  await sql.begin(async tx => {
    await tx.unsafe("set local statement_timeout='60s';set local lock_timeout='5s'").simple();
    await tx.unsafe(migrationBody(source)).simple();
    if (record) await tx`insert into supabase_migrations.schema_migrations(version,statements) values(${migration.version},${[migration.sql]})`;
  });
}
async function catalog(sql) {
  return {
    columns: await sql`select table_schema,table_name,column_name,ordinal_position,column_default,is_nullable,data_type,udt_name
      from information_schema.columns where table_schema in ('public','private') order by 1,2,4`,
    constraints: await sql`select n.nspname,c.relname,k.conname,pg_get_constraintdef(k.oid) definition,k.convalidated
      from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace
      where n.nspname in ('public','private') order by 1,2,3`,
    indexes: await sql`select schemaname,tablename,indexname,indexdef from pg_indexes
      where schemaname in ('public','private') order by 1,2,3`,
    views: await sql`select schemaname,viewname,definition from pg_views where schemaname='public' order by 1,2`,
    functions: await sql`select n.nspname schema,p.proname name,pg_get_function_identity_arguments(p.oid) args,
      pg_get_functiondef(p.oid) definition,md5(pg_get_functiondef(p.oid)) md5,p.proacl::text acl,
      pg_get_userbyid(p.proowner) owner,p.prosecdef,p.provolatile,p.proconfig,pg_get_function_result(p.oid) result,
      pg_get_expr(p.proargdefaults,0) defaults
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname in ('public','private') and p.prokind='f' order by 1,2,3`,
    relations: await sql`select n.nspname,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text,c.reloptions
      from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private')
      and c.relkind in ('r','p','v','m','S') order by 1,2`,
    policies: await sql`select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
      from pg_policies where schemaname in ('public','private','storage') order by 1,2,3`,
    triggers: await sql`select n.nspname,c.relname,t.tgname,pg_get_triggerdef(t.oid) definition,t.tgenabled
      from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
      where n.nspname in ('public','private') and not t.tgisinternal order by 1,2,3`,
  };
}
async function data(sql) {
  const tables = await sql`select schemaname,tablename from pg_tables where schemaname in ('public','private','auth') order by 1,2`;
  const rows = [];
  for (const t of tables) {
    assert.match(t.schemaname, /^[a-z_]+$/); assert.match(t.tablename, /^[a-z_][a-z0-9_]*$/);
    const [r] = await sql.unsafe(`select count(*)::int n,md5(coalesce(string_agg(to_jsonb(x)::text,E'\\n' order by to_jsonb(x)::text),'')) hash from ${t.schemaname}.${t.tablename} x`);
    rows.push({ schema: t.schemaname, table: t.tablename, ...r });
  }
  return rows;
}
async function functionRisks(sql) {
  const names = ["resolve_return_case", "review_payment_notice", "send_quote_revision", "accept_quote_revision", "cancel_planned_delivery", "cancel_scheduled_service_job"];
  const functions = await sql`select p.proname name,p.prosrc body,md5(pg_get_functiondef(p.oid)) md5,p.proacl::text acl
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(${names}) order by 1`;
  return functions.map(f => ({ name: f.name, md5: f.md5, acl: f.acl,
    custom40001: /errcode\s*=\s*'40001'/i.test(f.body), pt409: /errcode\s*=\s*'PT409'/i.test(f.body),
    transitGuard: f.body.includes("return_exceeds_transit_position"), directCost: f.body.includes("sum(sfl.payable_amount_vnd)"),
    explicitAudit: f.body.includes("insert into public.audit_events"),
  }));
}
function difference(left, right) {
  const changes = [];
  for (const key of Object.keys(left)) if (hash(left[key]) !== hash(right[key])) changes.push({ group: key, leftCount: left[key].length, rightCount: right[key].length });
  return changes;
}
function sqlWhitespaceShape(source) {
  // Preserve every quoted string and quoted identifier, including escaped quotes.
  // This is a formatting comparison, not a semantic-equivalence proof.
  let result = "", quote = null;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      result += c;
      if (c === quote) {
        if (source[i + 1] === quote) result += source[++i];
        else quote = null;
      }
    } else if (c === "'" || c === '"') { quote = c; result += c; }
    else if (!/\s/.test(c)) result += c;
  }
  return result;
}
async function rollbackProbe(sql, migrations) {
  const probe = { versions: migrations.map(m => m.version), before: await functionRisks(sql) };
  try {
    await sql.begin(async tx => {
      await tx.unsafe("set local statement_timeout='60s';set local lock_timeout='5s'").simple();
      for (const m of migrations) {
        probe.currentVersion = m.version;
        await tx.unsafe(migrationBody(m.sql)).simple();
      }
      probe.after = await functionRisks(tx);
      throw new Error("HX_TARGET78_PROBE_ROLLBACK");
    });
  } catch (error) {
    probe.status = error.message === "HX_TARGET78_PROBE_ROLLBACK" ? "APPLIED_IN_TRANSACTION_AND_ROLLED_BACK" : "FAILED_AND_ROLLED_BACK";
    if (error.message !== "HX_TARGET78_PROBE_ROLLBACK") probe.error = { code: error.code, message: error.message.split("\n")[0] };
  }
  probe.rolledBackRisks = await functionRisks(sql);
  assert.deepEqual(probe.rolledBackRisks, probe.before);
  return probe;
}
try {
  await owned(admin, "postgres"); await guardNoSharedRoleMutation();
  report.roleSettingsBefore = await admin`select r.rolname,s.setdatabase,s.setconfig from pg_db_role_setting s join pg_roles r on r.oid=s.setrole order by 1,2`;
  const target = await create("baseline");
  for (const m of baseline) {
    try { await apply(target, m); } catch (error) { report.failedMigration = { version: m.version, path: m.path }; throw error; }
    report.baselineMigrations.push({ version: m.version, path: m.path, sha256: m.sha256 });
  }
  const beforeCatalog = await catalog(target), beforeData = await data(target);
  report.baseline = { status: "PASS_RECONSTRUCTED_78", catalogHash: hash(beforeCatalog), counts: Object.fromEntries(Object.entries(beforeCatalog).map(([k,v]) => [k,v.length])), data: beforeData, risks: await functionRisks(target) };
  const actualByIdentity = new Map(baselineCatalog.functions.map(f => [`${f.schema}.${f.name}(${f.args})`, f]));
  report.baselineProductionFunctionMetadata = beforeCatalog.functions.map(f => {
    const actual = actualByIdentity.get(`${f.schema}.${f.name}(${f.args})`);
    return { schema: f.schema, name: f.name, args: f.args, reconstructedMd5: f.md5,
      productionMd5: actual?.md5 ?? null, md5Match: actual?.md5 === f.md5,
      aclMatch: actual?.acl === f.acl, presentInProductionMetadata: Boolean(actual) };
  });
  report.baselineProductionExtraFunctionMetadata = baselineCatalog.functions.filter(f => !beforeCatalog.functions.some(n => n.schema === f.schema && n.name === f.name && n.args === f.args));
  if (report.productionFunctionsReadOnly) report.productionFullDefinitionComparison = report.productionFunctionsReadOnly.functions.map(actual => {
    const native = beforeCatalog.functions.find(f => f.schema === actual.schema && f.name === actual.name && f.args === actual.args);
    const fields = ["acl", "owner", "prosecdef", "provolatile", "proconfig", "result", "defaults"];
    const attributeDifferences = native ? fields.filter(k => hash(native[k]) !== hash(actual[k])) : [];
    const formattingOnly = native && sqlWhitespaceShape(native.definition) === sqlWhitespaceShape(actual.definition);
    return { signature: `${actual.schema}.${actual.name}(${actual.args})`, classification: !native ? "PLATFORM_FUNCTION_NOT_IN_CANONICAL_NATIVE"
      : actual.definition === native.definition && !attributeDifferences.length ? "EXACT"
      : formattingOnly && !attributeDifferences.length ? "ONLY_OUTSIDE_QUOTED_TEXT_WHITESPACE_DIFFERS" : "UNRESOLVED_DEFINITION_DIFFERENCE",
      attributeDifferences, actualDefinition: actual.definition, reconstructedDefinition: native?.definition ?? null,
      quotedTextPreservedByFormattingComparison: true, formalSemanticEquivalence: "NOT_CLAIMED",
      authShimLimitation: "Auth table fixture is id-only; matching SQL text does not establish managed Auth/runtime dependency parity" };
  });
  await persist();
  for (const m of historical) { report.legacyProbes.push(await rollbackProbe(target, [m])); await persist(); }
  report.naiveMissingHistoryReplay = await rollbackProbe(target, historical);
  assert.deepEqual(await catalog(target), beforeCatalog, "Legacy rollback changed reconstructed schema");
  assert.deepEqual(await data(target), beforeData, "Legacy rollback changed reconstructed data");
  report.legacyProbeRollbackCatalogAndDataUnchanged = true;
  // Experimental bridge: preserve later direct-return/security forward and modern
  // conflict rewrite. Add missing mechanisms with PT409, without inventing an
  // historical applied ledger entry for modified or skipped legacy SQL.
  if (args["bridge-sql"]) {
    assert.equal(path.resolve(args["bridge-sql"]), path.resolve(report.experimentalBridgeArtifact.path));
    const source = await readFile(args["bridge-sql"], "utf8");
    assert.equal(createHash("sha256").update(source).digest("hex"), report.experimentalBridgeArtifact.sha256);
    await apply(target, { version: "EXPERIMENTAL_NATIVE_BRIDGE", sql: source }, source, false);
    report.bridgeActions.push({ action: "EXECUTE_EXPORTED_NATIVE_BRIDGE_ARTIFACT", path: args["bridge-sql"],
      sha256: report.experimentalBridgeArtifact.sha256, historicalLedgerRecorded: false });
    report.experimentalBridgeArtifact.executed = "PASS_EXACT_EXPORTED_SQL_GUARD_AND_VALIDATOR";
  } else for (const m of historical) {
    if (["20260930023428", "20260930081621"].includes(m.version)) {
      report.bridgeActions.push({ version: m.version, action: "KEEP_LATER_APPLIED_FORWARD_DO_NOT_REPLAY", historicalLedgerRecorded: false });
      continue;
    }
    const modified = ["20260930024101", "20260930025839", "20260930050137"].includes(m.version);
    const source = modified ? m.sql.replace(/errcode\s*=\s*'40001'/gi, "errcode = 'PT409'") : m.sql;
    await apply(target, m, source, false);
    report.bridgeActions.push({ version: m.version, action: modified ? "EXPERIMENTAL_FORWARD_PRESERVE_PT409" : "APPLY_MISSING_MECHANISM", sourceSha256: m.sha256,
      executedSha256: createHash("sha256").update(source).digest("hex"), historicalLedgerRecorded: false });
  }
  report.bridgeRisks = await functionRisks(target);
  const bridgeReturn = report.bridgeRisks.find(f => f.name === "resolve_return_case");
  assert.equal(bridgeReturn.transitGuard, true); assert.equal(bridgeReturn.directCost, true); assert.equal(bridgeReturn.custom40001, false);
  for (const name of ["cancel_planned_delivery", "cancel_scheduled_service_job", "review_payment_notice"]) {
    const f = report.bridgeRisks.find(f => f.name === name); assert.ok(f); assert.equal(f.custom40001, false); assert.equal(f.pt409, true);
  }
  const lateOpeningGateSql = `do $forward$
    declare t text;
    begin
      foreach t in array array['inventory_opening_sources','cash_opening_balances'] loop
        if to_regclass('public.'||t) is null or exists(
          select 1 from pg_trigger where tgrelid=to_regclass('public.'||t) and tgname='operational_posting_guard'
        ) then raise exception 'late_opening_gate_unexpected_prestate' using errcode='55000'; end if;
        execute format('create trigger operational_posting_guard before insert or update or delete on public.%I for each row execute function private.enforce_operational_write()',t);
      end loop;
      perform private.assert_operational_opening_writers_protected();
    end $forward$;`;
  if (!args["bridge-sql"]) {
    await guardNoSharedRoleMutation();
    await target.begin(tx => tx.unsafe(lateOpeningGateSql).simple());
    report.bridgeActions.push({ action: "EXPERIMENTAL_FORWARD_INSTALL_TWO_LATE_OPENING_GATES",
    sql: lateOpeningGateSql, sha256: createHash("sha256").update(lateOpeningGateSql).digest("hex"),
    validator: "private.assert_operational_opening_writers_protected()", historicalLedgerRecorded: false,
      reason: "Opening foundation installed after 20261009173806 needs the same gate on its two new public tables" });
  }
  report.bridgeValidator = { status: "PASS", returnTransitAndDirectCostPreserved: true, cancellationAndReviewPT409: true };
  for (const m of tail) {
    try { await apply(target, m); } catch (error) { report.failedMigration = { phase: "BRIDGE_TO_CANDIDATE", version: m.version, path: m.path }; throw error; }
    report.tailMigrations.push({ version: m.version, path: m.path, sha256: m.sha256 });
  }
  const fresh = await create("fresh");
  for (const m of manifest.migrations) {
    try { await apply(fresh, m); } catch (error) { report.failedMigration = { phase: "FRESH_CANDIDATE", version: m.version, path: m.path }; throw error; }
    report.freshMigrations.push({ version: m.version, path: m.path, sha256: m.sha256 });
  }
  const upgradedCatalog = await catalog(target), freshCatalog = await catalog(fresh);
  const operationalNames = ["assert_branch_operational", "enforce_operational_write", "require_active_operations", "activate_branch_operations", "operational_branch_state"];
  report.finalOperationalContracts = upgradedCatalog.functions.filter(f => operationalNames.includes(f.name)).map(f => ({
    schema: f.schema, name: f.name, args: f.args, md5: f.md5, definition: f.definition,
    matchesFreshCanonicalDefinition: freshCatalog.functions.some(x => x.schema === f.schema && x.name === f.name && x.args === f.args && x.definition === f.definition),
  }));
  const operations = report.finalOperationalContracts.find(f => f.name === "require_active_operations");
  assert.ok(operations?.definition.includes("FIRST_RECORDED_TRANSACTION"));
  assert.ok(operations?.definition.includes("branch_recorded_operations"));
  assert.ok(report.finalOperationalContracts.every(f => f.matchesFreshCanonicalDefinition));
  report.g11NewTransactionContractPreserved = { status: "PASS_EXACT_FRESH_DEFINITIONS", activationNotIntroducedByBridge: true,
    behaviorOnBusinessRows: "NOT_EXECUTED_ZERO_BUSINESS_FIXTURES", missingName: report.finalOperationalContracts.some(f => f.name === "assert_branch_operational") ? null : "assert_branch_operational is not a current canonical function" };
  const deltas = difference(upgradedCatalog, freshCatalog);
  report.finalCatalog = { status: deltas.length ? "DIFFERENCES_REQUIRE_REVIEW" : "PASS_ALL_APPLICATION_CATALOG_GROUPS", differences: deltas,
    upgradedHash: hash(upgradedCatalog), freshHash: hash(freshCatalog), counts: Object.fromEntries(Object.entries(upgradedCatalog).map(([k,v]) => [k,v.length])) };
  if (deltas.length) report.finalCatalog.differingObjects = Object.fromEntries(deltas.map(({group}) => [group, { upgraded: upgradedCatalog[group], fresh: freshCatalog[group] }]));
  assert.equal(deltas.length, 0, "Reconstructed target bridge differs from fresh canonical application catalog");
  const afterData = await data(target);
  const businessRows = afterData.filter(t => t.n > 0 && t.table !== "permissions");
  assert.equal(businessRows.length, 0, "No synthetic business facts are allowed in structural rehearsal");
  report.businessRowInvariant = { status: "PASS_ZERO_BUSINESS_ROWS", populatedTables: afterData.filter(t => t.n > 0), originalRows: beforeData };
  const [history] = await target`select count(*)::int count,max(version) latest from supabase_migrations.schema_migrations`;
  assert.equal(history.count, 178); assert.equal(history.latest, manifest.migrations.at(-1).version);
  report.rehearsalLedger = { ...history, historicalEightRecorded: false, explanation: "78 canonical subset + 100 tail. Eight historical mechanisms reconciled experimentally; no fake historical migration records" };
  report.roleSettingsAfter = await admin`select r.rolname,s.setdatabase,s.setconfig from pg_db_role_setting s join pg_roles r on r.oid=s.setrole order by 1,2`;
  const authenticator = report.roleSettingsAfter.find(x => x.rolname === "authenticator");
  assert.ok(authenticator?.setconfig.includes("pgrst.db_pre_request=public.require_active_api_actor"));
  assert.deepEqual(report.roleSettingsAfter.filter(x => x.rolname !== "authenticator"), report.roleSettingsBefore.filter(x => x.rolname !== "authenticator"));
  report.isolatedAuthenticatorHookConfiguredByCanonicalMigration = true;
  report.sharedBrowserClusterNotAccessed = true;
  report.status = "PASS_EXPERIMENTAL_RECONCILIATION_RAW_REPLAY_FAILS";
  report.verdicts = { canonical78Reconstruction: "PASS", naiveMissingVersionReplay: "FAIL",
    experimentalForwardApplicationCatalogParity: "PASS", productionBackupOrRehearsal: "NOT_PROVEN" };
} catch (error) {
  report.status = "FAIL_RECONSTRUCTED_STRUCTURAL_REHEARSAL";
  report.error = { code: error.code, message: error.message.split("\n")[0] };
  process.exitCode = 1;
} finally {
  for (const sql of clients) await sql.end({ timeout: 3 });
  for (const name of [...report.createdDatabases].reverse()) {
    try {
      assert.ok(name.startsWith(prefix)); assert.match(name, /^hx_remediation_target78_[a-z0-9_]+$/);
      await owned(admin, "postgres");
      await admin.unsafe(`drop database "${name}"`);
      report.cleanup.push({ database: name, status: "REMOVED_OWNED_RUN_DATABASE" });
    } catch (error) {
      report.cleanup.push({ database: name, status: "FAILED", code: error.code });
      report.status = "FAIL_CLEANUP"; process.exitCode = 1;
    }
  }
  await admin.end({ timeout: 3 });
  report.completedAt = new Date().toISOString(); await persist();
  console.log(JSON.stringify({ status: report.status, baseline: report.baselineMigrations.length,
    tail: report.tailMigrations.length, fresh: report.freshMigrations.length,
    naiveReplay: report.naiveMissingHistoryReplay?.status, catalog: report.finalCatalog?.status,
    cleanup: report.cleanup.map(x => x.status), error: report.error }));
}
