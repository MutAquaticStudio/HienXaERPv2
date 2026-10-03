import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import postgres from "postgres";
import { migrationManifest, migrationParity } from "./qa/migration-manifest.mjs";
import { nativeRpcParameters, nativeRpcPlaceholders } from "./qa/native-rpc-parameters.mjs";

// Default: an in-memory database. Native race checks require the separately
// owned disposable QA database and fail closed for every other target.
// Expected money values are hand-calculated fixtures.
const baseline = process.env.HX_RULES_BASELINE === "1";
const directory = new URL("../supabase/migrations/", import.meta.url);
const files = (await readdir(directory)).filter((name) => name.endsWith(".sql")
  && (!baseline || (!name.endsWith("fix_verified_delivery_rules.sql") && !name.endsWith("audit_worker_quantity_verification.sql")))).sort();
const manifest = await migrationManifest();
const nativeName = process.env.HX_RULES_NATIVE_DATABASE;
let nativeAdmin, nativeSql, nativeOptions;
let db;
if (nativeName) {
  assert.match(nativeName, /^hxqa_candidate_[a-f0-9]{12}$/);
  assert.ok(!baseline && !process.env.HX_RULES_SNAPSHOT, "Native runner is candidate-only; file snapshots use PGlite");
  const ownership = JSON.parse(await readFile(process.env.HX_RULES_NATIVE_OWNERSHIP, "utf8"));
  assert.equal(ownership.isolatedDatabase, nativeName);
  assert.equal(ownership.project, "ffrwiglcrlumfvhubaxg");
  assert.equal(ownership.result, "PASS");
  process.loadEnvFile("/Users/nox/Downloads/HienXaERP/.env.qa.local");
  const { guard, database, capacity } = await import("./qa/core.mjs");
  guard(); nativeAdmin = await database(); await capacity(nativeAdmin);
  nativeOptions = { ...nativeAdmin.options, database: nativeName, max: 1, prepare: false, connect_timeout: 8 };
  nativeSql = postgres(nativeOptions);
  assert.equal((await nativeSql.unsafe("select current_database() as name"))[0].name, nativeName);
  assert.equal((await nativeSql.unsafe("select count(*)::int as n from pg_tables where schemaname in ('public','auth','storage')"))[0].n, 0, "Never overwrite an existing fixture/database");
  await nativeSql.unsafe("create extension if not exists pgcrypto");
  db = { exec: async text => { await nativeSql.unsafe(text).simple(); },
    query: async (text, args = []) => ({ rows: await nativeSql.unsafe(text, args) }),
    close: async () => { await nativeSql.end({ timeout: 3 }); await nativeAdmin.end({ timeout: 3 }); } };
} else db = await PGlite.create({ extensions: { pgcrypto } });
const results = [];
const ids = Object.fromEntries(["owner", "worker", "stranger", "branch", "otherBranch", "employee", "otherEmployee", "ownerRole", "workerRole", "customer", "site", "supplier", "unit", "kg", "group", "material", "secondMaterial", "price", "secondPrice", "purchasePrice", "purchasePrice2", "purchasePrice3"].map((key) => [key, randomUUID()]));
const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
const signatures = new Map();
const signatureEvidence = [];
async function nativeParameters(sql, name, args, argumentNames) {
  assert.match(name, /^[a-z_]+$/);
  if (!nativeName) return { values: args, placeholders: args.map((_, index) => `$${index + 1}`) };
  if (!signatures.has(name)) signatures.set(name, await rows(`select p.pronargs as arity,p.pronargdefaults as defaults,
    p.proargnames as names,pg_get_function_identity_arguments(p.oid) as identity,
    (select jsonb_agg(t.type::int order by t.position) from unnest(p.proargtypes) with ordinality t(type,position)) as types
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$1`, [name]));
  const matching = signatures.get(name).filter((item) => args.length >= item.arity - item.defaults && args.length <= item.arity
    && (!argumentNames || argumentNames.every((key) => item.names?.slice(0, item.arity).includes(key))));
  assert.equal(matching.length, 1, `RPC ${name} must have one matching candidate signature; never guess an overload`);
  const signature = matching[0];
  const types = argumentNames ? argumentNames.map((key) => signature.types[signature.names.indexOf(key)]) : signature.types.slice(0, args.length);
  if (!signatureEvidence.some((item) => item.name === name && item.identity === signature.identity)) signatureEvidence.push({ name, identity: signature.identity });
  return { values: nativeRpcParameters(sql, args, types), placeholders: nativeRpcPlaceholders(types) };
}
const rpc = async (name, args) => {
  const bound = await nativeParameters(nativeSql, name, args);
  return (await rows(`select public.${name}(${bound.placeholders.join(",")}) as id`, bound.values))[0].id;
};
const namedRpc = async (name, args) => {
  const entries = Object.entries(args);
  assert.match(name, /^[a-z_]+$/);
  for (const [key] of entries) assert.match(key, /^[a-z_]+$/);
  const bound = await nativeParameters(nativeSql, name, entries.map(([, value]) => value), entries.map(([key]) => key));
  return (await rows(`select public.${name}(${entries.map(([key], i) => `${key} => ${bound.placeholders[i]}`).join(",")}) as id`, bound.values))[0].id;
};
const as = async (actor) => db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${actor}',false)`);
// Ledger diagnostics run as the isolated fixture administrator. Business RPCs
// still run as their authenticated actors; raw-ledger grants are not widened.
async function ledgerRows(sql, args = []) {
  await db.exec("reset role");
  try { return await rows(sql, args); }
  finally { await as(ids.owner); }
}
const denied = async (action, pattern) => assert.rejects(action, (error) => !pattern || pattern.test(error.message));
async function check(name, action) {
  try { await action(); results.push({ name, result: "PASS" }); }
  catch (error) { results.push({ name, result: "FAIL", error: error.message, code: error.code }); }
  console.log(JSON.stringify(results.at(-1)));
}
let serial = 0;
let checkedParity;
const raceEvidence = [];
const adapterEvidence = [];
let nativeEnvironment;
async function race(actor, name, argumentsForSession) {
  assert.ok(nativeOptions, "A race requires independent native PostgreSQL sessions");
  assert.match(name, /^[a-z_]+$/);
  const connections = [postgres(nativeOptions), postgres(nativeOptions)];
  const pids = [];
  const intervals = [{}, {}];
  // Resolve metadata before starting either transaction; do not serialize race
  // participants through the fixture connection while they hold business locks.
  const sessionArgs = [0, 1].map((index) => typeof argumentsForSession === "function" ? argumentsForSession(index) : argumentsForSession);
  const boundArgs = [];
  let ready = 0;
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  try {
    for (let index = 0; index < 2; index += 1) boundArgs[index] = await nativeParameters(connections[index], name, sessionArgs[index]);
    const outcomes = await Promise.allSettled(connections.map(async (connection, index) => {
      try { const result = await connection.begin(async (tx) => {
      intervals[index].startedAt = Date.now();
      await tx.unsafe("set local role authenticated; set local statement_timeout='20s'").simple();
      await tx.unsafe("select set_config('request.jwt.claim.sub',$1,true)", [actor]);
      const [session] = await tx.unsafe("select pg_backend_pid() as pid,transaction_timestamp()::text as transaction_started_at");
      pids[index] = session.pid;
      intervals[index].serverTransactionStartedAt = session.transaction_started_at;
      intervals[index].barrierReachedAt = Date.now();
      ready += 1;
      if (ready === 2) release();
      let timer;
      try {
        await Promise.race([barrier, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("two-session barrier timed out")), 10000); })]);
      } finally { clearTimeout(timer); }
      assert.equal(new Set(pids).size, 2, "Race must use distinct PostgreSQL backend sessions");
      const { values: args, placeholders } = boundArgs[index];
      intervals[index].commandStartedAt = Date.now();
      return (await tx.unsafe(`select public.${name}(${placeholders.join(",")}) as id`, args))[0].id;
      }); intervals[index].outcome = "COMMIT"; return result;
      } catch (error) { intervals[index].outcome = "ROLLBACK"; throw error; }
      finally { intervals[index].finishedAt = Date.now(); }
    }));
    const overlappingTransactions = Math.max(...intervals.map((item) => item.barrierReachedAt)) < Math.min(...intervals.map((item) => item.finishedAt));
    raceEvidence.push({ command: name, backendPids: pids, intervals, overlappingTransactions, outcomes: outcomes.map((item) => item.status === "fulfilled" ? { status: item.status, id: item.value } : { status: item.status, error: item.reason.message, code: item.reason.code }) });
    assert.ok(overlappingTransactions, "Both native transactions must overlap before their business commands");
    return outcomes;
  } finally { await Promise.all(connections.map((connection) => connection.end({ timeout: 2 }))); }
}
async function fixture({ publish = false, missingContact = false, firstQuantity = "2", secondQuantity = "3" } = {}) {
  if (!baseline && !checkedParity) {
    checkedParity = migrationParity(manifest, await ledgerRows("select version,statements from supabase_migrations.schema_migrations order by version"));
    assert.equal(checkedParity.result, "PASS", "Business evidence requires exact candidate migration parity");
  }
  await as(ids.owner);
  const warehouse = randomUUID(), vehicle = randomUUID();
  await db.exec("reset role");
  await rows("insert into public.warehouses(id,branch_id,code,name,address_text) values($1,$2,$3,'Rules QA warehouse','Synthetic QA warehouse address')", [warehouse, ids.branch, "WH_" + (++serial)]);
  await rows("insert into public.vehicles(id,branch_id,code,plate_number) values($1,$2,$3,$4)", [vehicle, ids.branch, "VH_" + serial, "QA-" + serial]);
  await as(ids.owner);
  const buyLine = (material, quantity, price, rule, version) => ({ material_id: material, ordered_uom_id: material === ids.secondMaterial ? ids.kg : ids.unit, quantity: String(quantity), conversion_numerator: "1", conversion_denominator: "1", rounding_mode: "HALF_UP", unit_cost_vnd: String(price), purchase_price_rule_id: rule, purchase_price_rule_version: version, price_source_type: "CONTRACT" });
  const po = await rpc("create_purchase_order_draft", [ids.branch, ids.supplier, warehouse, "2030-01-01", "ISOLATED RULES FIXTURE", JSON.stringify([
    buyLine(ids.material, 168, 16100, ids.purchasePrice, 1), buyLine(ids.material, 1, 15479, ids.purchasePrice2, 2),
    buyLine(ids.secondMaterial, 10, 8000, ids.purchasePrice3, 1),
  ]), randomUUID()]);
  await rpc("confirm_purchase_order", [po, randomUUID()]);
  const poLines = await rows("select id,quantity from public.purchase_order_lines where purchase_order_id=$1 order by line_number", [po]);
  await rpc("receive_purchase_order", [po, JSON.stringify(poLines.map((line) => ({ purchase_order_line_id: line.id, received_quantity: line.quantity }))), null, new Date().toISOString(), randomUUID()]);
  const saleLine = (material, quantity, price, rule) => ({ material_id: material, ordered_uom_id: material === ids.secondMaterial ? ids.kg : ids.unit, quantity: String(quantity), conversion_numerator: "1", conversion_denominator: "1", rounding_mode: "HALF_UP", unit_price_vnd: String(price), pricing_rule_id: rule, pricing_rule_version: 1, price_source_type: "LIST" });
  const order = await rpc("create_sales_order_draft", [ids.branch, ids.customer, ids.site, "2030-01-01", "ISOLATED RULES FIXTURE",
    JSON.stringify([saleLine(ids.material, firstQuantity, 120000, ids.price), saleLine(ids.secondMaterial, secondQuantity, 80000, ids.secondPrice)]), randomUUID()]);
  await rpc("confirm_sales_order", [order, randomUUID()]);
  const saleLines = await rows("select id from public.sales_order_lines where sales_order_id=$1 order by line_number", [order]);
  const allocations = [];
  for (let i = 0; i < saleLines.length; i++) allocations.push(await rpc("upsert_supply_allocation", [saleLines[i].id, "WAREHOUSE", null, warehouse, i === 0 ? firstQuantity : secondQuantity, null, null, randomUUID()]));
  const delivery = await rpc("create_delivery_from_allocations", [order, JSON.stringify(allocations.map((id, i) => ({ supply_allocation_id: id, planned_base_quantity: i === 0 ? firstQuantity : secondQuantity }))), `2030-01-${String(serial + 1).padStart(2, "0")}T09:00:00Z`, randomUUID()]);
  await rpc("assign_delivery", [delivery, ids.employee, vehicle, null, null, 1, randomUUID()]);
  if (missingContact) {
    await db.exec("reset role");
    await rows("update public.deliveries set receiver_name_snapshot=null,receiver_phone_snapshot=null where id=$1", [delivery]);
    await as(ids.owner);
  }
  let work;
  if (publish) work = await rpc("publish_work_item", [ids.branch, "DELIVERY", delivery, "DIRECT", null, randomUUID()]);
  const lines = await rows("select id,material_id from public.delivery_lines where delivery_id=$1 order by material_id", [delivery]);
  const first = lines.find((line) => line.material_id === ids.material);
  const second = lines.find((line) => line.material_id === ids.secondMaterial);
  const quantities = (firstQty, secondQty) => JSON.stringify([{ delivery_line_id: first.id, actual_base_quantity: firstQty }, { delivery_line_id: second.id, actual_base_quantity: secondQty }]);
  return { warehouse, vehicle, order, delivery, first, second, allocations, work, quantities };
}
async function arrive(f) {
  await as(ids.owner);
  const [{ version }] = await rows("select version from public.deliveries where id=$1", [f.delivery]);
  await namedRpc("handoff_delivery", { target_delivery_id: f.delivery, expected_version: version, handed_off_at: new Date().toISOString(), operation_id: randomUUID() });
  await rpc("mark_delivery_arrived", [f.delivery, version + 1, randomUUID()]);
}
async function verify(f, first = 1, second = 0) {
  await as(ids.owner);
  const [{ id }] = await rows("select id from public.delivery_results where delivery_id=$1", [f.delivery]);
  const [{ version }] = await rows("select version from public.deliveries where id=$1", [f.delivery]);
  return rpc("verify_delivery", [id, JSON.stringify([{ delivery_line_id: f.first.id, accepted_base_quantity: first, billable_base_quantity: first },
    { delivery_line_id: f.second.id, accepted_base_quantity: second, billable_base_quantity: second }]), version, randomUUID()]);
}
async function partial(f) {
  await arrive(f);
  const [{ version }] = await rows("select version from public.deliveries where id=$1", [f.delivery]);
  await rpc("submit_delivery_result", [f.delivery, "PARTIAL", f.quantities(1, 0), "QA Receiver", "Partial fixture", null, null, version, randomUUID()]);
  await verify(f);
}
async function returnFirst(f) {
  const [{ id }] = await rows("select id from public.delivery_verification_lines where delivery_line_id=$1", [f.first.id]);
  const returned = await rpc("open_return_case", [id, "TRANSIT_REMAINDER", 1, "ISOLATED return remainder", null, randomUUID()]);
  await rpc("resolve_return_case", [returned, "RETURNED", f.warehouse, "ISOLATED physical return", null, 1, randomUUID()]);
}
try {
  await db.exec(`do $$ begin
    if not exists(select from pg_roles where rolname='anon') then create role anon nologin; end if;
    if not exists(select from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  end $$;
    create schema auth; create table auth.users(id uuid primary key,email text);
    create table auth.identities(id uuid primary key,user_id uuid references auth.users(id),provider text);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean default false,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
    alter table storage.objects enable row level security;
    create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);`);
  for (const name of files) {
    const text = await readFile(new URL(name, directory), "utf8");
    await db.exec(text);
    await rows("insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)", [name.slice(0,14),name,[text]]);
  }
  if (nativeName) {
    checkedParity = migrationParity(manifest, await rows("select version,statements from supabase_migrations.schema_migrations order by version"));
    assert.equal(checkedParity.result, "PASS");
    [nativeEnvironment] = await rows("select current_database() as database,version() as version");
    const handoff = await rows("select pg_get_function_identity_arguments(p.oid) as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='handoff_delivery'");
    assert.deepEqual(handoff.map((item) => item.signature), ["target_delivery_id uuid, expected_version integer, handed_off_at timestamp with time zone, operation_id uuid"]);
    const probes = [
      ["object", { quantity: "1" }, "object"],
      ["multiple elements", '[{"quantity":"1"},{"quantity":"2"}]', "array"],
      ["nested Vietnamese", { note: "Ti\u1ebfng Vi\u1ec7t \"\u0111\u00fang\"", lines: [{ detail: { quantities: [1, 2] } }] }, "object"],
      ["empty object", {}, "object"], ["empty array", [], "array"],
      ["SQL NULL", null, null], ["JSON null", "null", "null"], ["JSON string", '"quoted"', "string"],
    ];
    for (const [name, input, expectedType] of probes) {
      const [actual] = await rows("select jsonb_typeof($1::jsonb) as type,$1::jsonb as document", nativeRpcParameters(nativeSql, [input], [3802]));
      assert.equal(actual.type, expectedType);
      assert.deepEqual(actual.document, typeof input === "string" ? JSON.parse(input) : input);
      adapterEvidence.push({ name, result: "PASS", receivedType: actual.type });
    }
    const text = '{"ordinary":"text"}', array = [randomUUID(), randomUUID()];
    const [untouched] = await rows("select $1::uuid[] as participants,$2::text as note", nativeRpcParameters(nativeSql, [array, text], [2951, 25]));
    assert.deepEqual(untouched.participants, array); assert.equal(untouched.note, text);
    adapterEvidence.push({ name: "PostgreSQL array and ordinary text", result: "PASS" });
  }
  await db.exec(`insert into auth.users(id) values('${ids.owner}'),('${ids.worker}'),('${ids.stranger}');
    insert into public.branches(id,code,name) values('${ids.branch}','RULES_A','Rules A'),('${ids.otherBranch}','RULES_B','Rules B');
    insert into public.roles(id,code,name) values('${ids.ownerRole}','rules_owner','Rules owner'),('${ids.workerRole}','rules_worker','Rules worker');
    insert into public.role_permissions(role_id,permission_code) select '${ids.ownerRole}',code from public.permissions;
    insert into public.role_permissions(role_id,permission_code) values('${ids.workerRole}','work.read'),('${ids.workerRole}','work.claim');
    insert into public.employees(id,auth_user_id,code,display_name) values('${ids.employee}','${ids.worker}','RULES_WORKER','Rules worker'),('${ids.otherEmployee}','${ids.owner}','RULES_OWNER','Rules owner');
    insert into public.employee_branch_access(employee_id,branch_id,role_id) values('${ids.employee}','${ids.branch}','${ids.workerRole}'),('${ids.otherEmployee}','${ids.branch}','${ids.ownerRole}');
    insert into public.customers(id,branch_id,code,display_name,credit_limit_vnd) values('${ids.customer}','${ids.branch}','RULES_CUSTOMER','Rules customer',100000000);
    insert into public.customer_sites(id,customer_id,code,name,address_text,receiver_name,receiver_phone) values('${ids.site}','${ids.customer}','RULES_SITE','Rules site','Synthetic QA address','QA Receiver','0900000000');
    insert into public.suppliers(id,branch_id,code,name) values('${ids.supplier}','${ids.branch}','RULES_SUPPLIER','Rules supplier');
    insert into public.units_of_measure(id,code,name,symbol,decimal_scale) values('${ids.unit}','rules_unit','Rules unit','unit',6),('${ids.kg}','rules_kg','Rules kg','kg',6);
    insert into public.material_groups(id,code,name) values('${ids.group}','RULES_GROUP','Rules group');
    insert into public.materials(id,group_id,code,name,base_uom_id) values('${ids.material}','${ids.group}','RULES_A','Material A','${ids.unit}'),('${ids.secondMaterial}','${ids.group}','RULES_B','Material B','${ids.kg}');
    insert into public.pricing_rules(id,branch_id,scope_type,material_id,price_uom_id,unit_price_vnd,version,source_type,effective_from,created_by) values
      ('${ids.price}','${ids.branch}','DEFAULT','${ids.material}','${ids.unit}',120000,1,'LIST','2026-01-01','${ids.owner}'),
      ('${ids.secondPrice}','${ids.branch}','DEFAULT','${ids.secondMaterial}','${ids.kg}',80000,1,'LIST','2026-01-01','${ids.owner}');
    insert into public.purchase_price_rules(id,branch_id,supplier_id,material_id,purchase_uom_id,unit_cost_vnd,version,source_type,effective_from,created_by) values
      ('${ids.purchasePrice}','${ids.branch}','${ids.supplier}','${ids.material}','${ids.unit}',16100,1,'CONTRACT','2026-01-01','${ids.owner}'),
      ('${ids.purchasePrice2}','${ids.branch}','${ids.supplier}','${ids.material}','${ids.unit}',15479,2,'CONTRACT','2026-01-01','${ids.owner}'),
      ('${ids.purchasePrice3}','${ids.branch}','${ids.supplier}','${ids.secondMaterial}','${ids.kg}',8000,1,'CONTRACT','2026-01-01','${ids.owner}');`);

  await check("P1 publish rejects missing receiver with no WorkItem effect", async () => {
    const f = await fixture({ missingContact: true });
    await denied(() => rpc("publish_work_item", [ids.branch, "DELIVERY", f.delivery, "DIRECT", null, randomUUID()]), /delivery_contact_or_lines_missing/);
    assert.equal((await rows("select count(*)::int as count from public.work_items where delivery_id=$1", [f.delivery]))[0].count, 0);
  });
  await check("P1 contact repair is audited, idempotent and locked after publish", async () => {
    const f = await fixture({ missingContact: true }); const op = randomUUID();
    const args = [f.delivery, "QA Receiver", "0900000000", "ISOLATED contact correction", 2, op];
    assert.equal(await rpc("update_delivery_receiver", args), f.delivery);
    assert.equal(await rpc("update_delivery_receiver", args), f.delivery);
    assert.equal((await rows("select count(*)::int as count from public.audit_events where trace_id=$1", [op]))[0].count, 1);
    await rpc("publish_work_item", [ids.branch, "DELIVERY", f.delivery, "DIRECT", null, randomUUID()]);
    await denied(() => rpc("update_delivery_receiver", [f.delivery, "New receiver", "0900000001", "ISOLATED locked change", 3, randomUUID()]), /delivery_contact_locked/);
  });
  await check("P1 multiline worker report bridges atomically, denies bad actors and replays once", async () => {
    const f = await fixture({ publish: true }); await arrive(f); await as(ids.worker);
    await rpc("start_work_item", [f.work, 1, randomUUID()]);
    const args = [f.work, f.quantities(1, 0), "QA Receiver", "ISOLATED worker result", null, null, 2, 4, 1, randomUUID()];
    if (baseline) {
      await rpc("submit_portal_work_result", [f.work, 1, "ISOLATED worker result", "QA Receiver", null, 2, args[9]]);
      assert.equal((await rows("select public.worker_portal_job($1) as job", [f.work]))[0].job.state, "DONE");
      await as(ids.owner);
      assert.equal((await rows("select execution_state from public.deliveries where id=$1", [f.delivery]))[0].execution_state, "RESULT_SUBMITTED");
      return;
    }
    const job = (await rows("select public.worker_portal_job($1) as job", [f.work]))[0].job;
    assert.equal(job.delivery.lines.length, 2); assert.equal(job.receiver_name, "QA Receiver");
    assert.ok(!JSON.stringify(job).includes("unit_cost"));
    await denied(() => rpc("submit_portal_delivery_result", [...args.slice(0, 7), 3, 1, randomUUID()]), /stale_work_or_delivery_version/);
    await denied(() => rpc("submit_portal_delivery_result", [f.work, JSON.stringify([{ delivery_line_id: f.first.id, actual_base_quantity: 1 }]), ...args.slice(2, 9), randomUUID()]), /delivery_result_line_missing/);
    await denied(() => rpc("submit_portal_delivery_result", [f.work, f.quantities("NaN", 0), ...args.slice(2, 9), randomUUID()]), /invalid_delivery_result_line/);
    await denied(() => rpc("submit_portal_work_result", [f.work, 1, "Legacy quantity", "QA Receiver", null, 2, randomUUID()]), /delivery_line_result_required/);
    await as(ids.stranger); await denied(() => rpc("submit_portal_delivery_result", args), /work_result_forbidden/);
    await as(ids.worker);
    const result = await rpc("submit_portal_delivery_result", args); assert.equal(await rpc("submit_portal_delivery_result", args), result);
    await denied(() => rpc("submit_portal_delivery_result", [f.work, f.quantities(2, 0), ...args.slice(2)]), /operation_payload_conflict/);
    await as(ids.owner);
    assert.equal((await rows("select execution_state from public.deliveries where id=$1", [f.delivery]))[0].execution_state, "RESULT_SUBMITTED");
    assert.equal((await rows("select actual_quantity from public.work_item_results where id=$1", [result]))[0].actual_quantity, null);
    assert.equal((await rows("select count(*)::int as count from public.receivable_read where sales_order_id=$1", [f.order]))[0].count, 0);
    assert.equal((await rows("select count(*)::int as count from public.delivery_results where delivery_id=$1 and source_work_item_result_id=$2", [f.delivery, result]))[0].count, 1);
    await verify(f);
    assert.equal((await rows("select original_amount_vnd::text as original_amount_vnd from public.receivable_read where sales_order_id=$1", [f.order]))[0].original_amount_vnd, "120000");
    await db.exec("reset role");
    await rows("update public.employee_branch_access set active=false, revoked_at=now() where employee_id=$1", [ids.employee]);
    await as(ids.worker); await denied(() => rpc("submit_portal_delivery_result", args), /work_result_forbidden/);
    await db.exec("reset role"); await rows("update public.employee_branch_access set active=true, revoked_at=null where employee_id=$1", [ids.employee]);
  });
  await check("P1 follow-up consumes accepted plus unresolved transit, not old planned quantity", async () => {
    const f = await fixture(); await partial(f);
    const plan = JSON.stringify([{ supply_allocation_id: f.allocations[0], planned_base_quantity: 1 }]);
    await denied(() => rpc("create_delivery_from_allocations", [f.order, plan, "2030-02-01T09:00:00Z", randomUUID()]), /delivery_exceeds_allocation/);
    await returnFirst(f); const op = randomUUID();
    const next = await rpc("create_delivery_from_allocations", [f.order, plan, "2030-02-01T09:00:00Z", op]);
    assert.equal(await rpc("create_delivery_from_allocations", [f.order, plan, "2030-02-01T09:00:00Z", op]), next);
    await denied(() => rpc("create_delivery_from_allocation", [f.allocations[0], 1, "2030-02-02T09:00:00Z", randomUUID()]), /delivery_exceeds_allocation/);
  });
  await check("P1 singular delivery command also allows the released remainder", async () => {
    const f = await fixture(); await partial(f); await returnFirst(f);
    const op = randomUUID(); const next = await rpc("create_delivery_from_allocation", [f.allocations[0], 1, "2030-02-02T09:00:00Z", op]);
    assert.equal(await rpc("create_delivery_from_allocation", [f.allocations[0], 1, "2030-02-02T09:00:00Z", op]), next);
  });
  await check("P2 zero-quantity transit has zero value after final return, no AR refund", async () => {
    const f = await fixture(); await partial(f); await returnFirst(f);
    const [position] = await ledgerRows("select sum(base_quantity_delta)::text as qty,sum(inventory_value_delta_vnd)::text as value from public.inventory_movements where location_kind='IN_TRANSIT' and delivery_id=$1 and material_id=$2", [f.delivery, ids.material]);
    assert.equal(Number(position.qty), 0); assert.equal(position.value, "0");
    const [stock] = await rows("select on_hand_base_quantity,inventory_value_vnd::text as inventory_value_vnd from public.warehouse_inventory_read where warehouse_id=$1 and material_id=$2", [f.warehouse, ids.material]);
    assert.equal(Number(stock.on_hand_base_quantity), 168); assert.equal(stock.inventory_value_vnd, "2704183");
    assert.equal((await rows("select outstanding_amount_vnd::text as outstanding_amount_vnd from public.receivable_read where sales_order_id=$1", [f.order]))[0].outstanding_amount_vnd, "120000");
  });
  await check("P2 canonical fulfillment states do not alter the independent payment axis", async () => {
    const f = await fixture();
    assert.equal((await rows("select fulfillment_state,payment_state from public.sales_order_read where id=$1", [f.order]))[0].fulfillment_state, "NOT_STARTED");
    await partial(f);
    assert.deepEqual((await rows("select fulfillment_state,payment_state from public.sales_order_read where id=$1", [f.order]))[0], { fulfillment_state: "PARTIAL", payment_state: "UNPAID" });
    await returnFirst(f);
    const remainderArgs = [f.order, JSON.stringify([{ supply_allocation_id: f.allocations[0], planned_base_quantity: 1 }]), null, randomUUID()];
    await db.exec("begin");
    try { assert.ok(await rpc("create_delivery_from_allocations", remainderArgs)); }
    finally { await db.exec("rollback"); }
    await db.exec("reset role"); await rows("update public.sales_orders set commercial_state='CLOSED' where id=$1", [f.order]); await as(ids.owner);
    assert.deepEqual((await rows("select fulfillment_state,payment_state from public.sales_order_read where id=$1", [f.order]))[0], { fulfillment_state: "CLOSED_REMAINDER", payment_state: "UNPAID" });
    await denied(() => rpc("create_delivery_from_allocations", remainderArgs));
    assert.equal((await rows("select count(*)::int as count from public.deliveries where sales_order_id=$1", [f.order]))[0].count, 1);
    const full = await fixture(); await arrive(full);
    await rpc("submit_delivery_result", [full.delivery, "FULL", full.quantities(2, 3), "QA Receiver", "ISOLATED full result", null, null, 4, randomUUID()]); await verify(full, 2, 3);
    assert.equal((await rows("select fulfillment_state from public.sales_order_read where id=$1", [full.order]))[0].fulfillment_state, "FULFILLED");
    assert.equal((await ledgerRows("select sum(inventory_value_delta_vnd)::text as value from public.inventory_movements where delivery_id=$1", [full.delivery]))[0].value, "0");
  });
  if (!baseline) {
    await check("P1 Owner adjustment preserves worker quantities and requires a separate audit reason", async () => {
      const f = await fixture({ publish: true }); await arrive(f); await as(ids.worker);
      await rpc("start_work_item", [f.work, 1, randomUUID()]);
      await rpc("submit_portal_delivery_result", [f.work, f.quantities(2, 3), "QA Receiver", "ISOLATED original worker quantities", null, null, 2, 4, 1, randomUUID()]);
      await as(ids.owner);
      const result = (await rows("select id from public.delivery_results where delivery_id=$1", [f.delivery]))[0].id;
      await denied(() => verify(f), /worker_quantity_adjustment_reason_required/);
      assert.equal((await rows("select count(*)::int as count from public.delivery_verifications where delivery_id=$1", [f.delivery]))[0].count, 0);
      const reason = `ISOLATED verification correction ${f.delivery}`;
      const lines = JSON.stringify([{ delivery_line_id: f.first.id, accepted_base_quantity: 1, billable_base_quantity: 1, verification_adjustment_reason: reason }, { delivery_line_id: f.second.id, accepted_base_quantity: 0, billable_base_quantity: 0, verification_adjustment_reason: reason }]);
      const op = randomUUID();
      const verified = await rpc("verify_delivery", [result, lines, 5, op]);
      assert.equal(await rpc("verify_delivery", [result, lines, 5, op]), verified);
      const originals = await rows("select actual_base_quantity::text as quantity from public.delivery_result_lines where delivery_result_id=$1 order by delivery_line_id", [result]);
      assert.deepEqual(originals.map((line) => line.quantity.replace(/\.0+$/, "")).sort(), ["2", "3"]);
      assert.equal((await rows("select count(*)::int as count from public.delivery_verifications where delivery_id=$1", [f.delivery]))[0].count, 1);
      const audited = await ledgerRows("select reason from public.audit_events where entity_type='delivery_verification' and entity_id=$1 and reason like $2", [verified, `%${reason}%`]);
      assert.equal(audited.length, 1);
      assert.equal((await rows("select original_amount_vnd::text as amount from public.receivable_read where sales_order_id=$1", [f.order]))[0].amount, "120000");
    });
    await check("P1 a transaction fault rolls back WorkItem, Delivery and downstream effects together", async () => {
      const f = await fixture({ publish: true }); await arrive(f); await as(ids.worker);
      await rpc("start_work_item", [f.work, 1, randomUUID()]);
      const before = await ledgerRows("select execution_state,version from public.deliveries where id=$1", [f.delivery]);
      const beforeWork = await ledgerRows("select execution_state,version from public.work_items where id=$1", [f.work]);
      await db.exec("reset role");
      await db.exec(`create function public.hx_isolated_fault() returns trigger language plpgsql as $$ begin if new.delivery_id='${f.delivery}'::uuid then raise exception 'HX isolated transaction failure'; end if; return new; end $$; create trigger hx_isolated_fault after insert on public.delivery_results for each row execute function public.hx_isolated_fault()`);
      try {
        await as(ids.worker);
        await denied(() => rpc("submit_portal_delivery_result", [f.work, f.quantities(1, 0), "QA Receiver", "ISOLATED forced rollback", null, null, 2, 4, 1, randomUUID()]), /HX isolated transaction failure/);
        assert.deepEqual(await ledgerRows("select execution_state,version from public.deliveries where id=$1", [f.delivery]), before);
        assert.deepEqual(await ledgerRows("select execution_state,version from public.work_items where id=$1", [f.work]), beforeWork);
        await as(ids.owner);
        assert.equal((await rows("select count(*)::int as count from public.delivery_results where delivery_id=$1", [f.delivery]))[0].count, 0);
        assert.equal((await rows("select count(*)::int as count from public.work_item_results where work_item_id=$1", [f.work]))[0].count, 0);
        assert.equal((await rows("select count(*)::int as count from public.receivable_read where sales_order_id=$1", [f.order]))[0].count, 0);
      } finally {
        await db.exec("reset role; drop trigger hx_isolated_fault on public.delivery_results; drop function public.hx_isolated_fault()");
        await as(ids.owner);
      }
    });
    await check("P1 SO20 accepts18, returns2, redelivers2 and completes without duplicate revenue or cost", async () => {
      const f = await fixture({ firstQuantity: "20" }); await arrive(f);
      await rpc("submit_delivery_result", [f.delivery, "PARTIAL", f.quantities(18, 3), "QA Receiver", "ISOLATED eighteen accepted", null, null, 4, randomUUID()]);
      await verify(f, 18, 3);
      const verificationLine = (await rows("select id from public.delivery_verification_lines where delivery_line_id=$1", [f.first.id]))[0].id;
      const opened = await rpc("open_return_case", [verificationLine, "TRANSIT_REMAINDER", 2, "ISOLATED two not delivered", null, randomUUID()]);
      const returnOp = randomUUID();
      await rpc("resolve_return_case", [opened, "RETURNED", f.warehouse, "ISOLATED warehouse received two", null, 1, returnOp]);
      await rpc("resolve_return_case", [opened, "RETURNED", f.warehouse, "ISOLATED warehouse received two", null, 1, returnOp]);
      const [position] = await ledgerRows("select base_quantity::text as qty,inventory_value_vnd::text as value from private.delivery_line_transit_position($1)", [f.first.id]);
      assert.equal(position.qty.replace(/\.0+$/, ""), "0"); assert.equal(position.value, "0");
      const plan = JSON.stringify([{ supply_allocation_id: f.allocations[0], planned_base_quantity: 2 }]);
      const nextOp = randomUUID(); const next = await rpc("create_delivery_from_allocations", [f.order, plan, null, nextOp]);
      assert.equal(await rpc("create_delivery_from_allocations", [f.order, plan, null, nextOp]), next);
      await denied(() => rpc("create_delivery_from_allocation", [f.allocations[0], 1, null, randomUUID()]), /delivery_exceeds_allocation/);
      await rpc("assign_delivery", [next, ids.employee, f.vehicle, null, null, 1, randomUUID()]);
      await arrive({ delivery: next });
      const nextLine = (await rows("select id from public.delivery_lines where delivery_id=$1", [next]))[0].id;
      await rpc("submit_delivery_result", [next, "FULL", JSON.stringify([{ delivery_line_id: nextLine, actual_base_quantity: 2 }]), "QA Receiver", "ISOLATED final two", null, null, 4, randomUUID()]);
      const nextResult = (await rows("select id from public.delivery_results where delivery_id=$1", [next]))[0].id;
      await rpc("verify_delivery", [nextResult, JSON.stringify([{ delivery_line_id: nextLine, accepted_base_quantity: 2, billable_base_quantity: 2 }]), 5, randomUUID()]);
      assert.equal((await rows("select fulfillment_state from public.sales_order_read where id=$1", [f.order]))[0].fulfillment_state, "FULFILLED");
      const [debt] = await rows("select count(*)::int as count,sum(original_amount_vnd)::text as amount from public.receivable_read where sales_order_id=$1", [f.order]);
      assert.equal(debt.count, 2); assert.equal(debt.amount, "2640000");
      const [cost] = await ledgerRows("select (-sum(inventory_value_delta_vnd))::text as amount from public.inventory_movements where location_kind='IN_TRANSIT' and source_delivery_verification_line_id in (select id from public.delivery_verification_lines where delivery_line_id in (select id from public.delivery_lines where delivery_id in ($1,$2)))", [f.delivery, next]);
      assert.equal(cost.amount, "345927");
      const [stock] = await rows("select on_hand_base_quantity::text as qty,inventory_value_vnd::text as value from public.warehouse_inventory_read where warehouse_id=$1 and material_id=$2", [f.warehouse, ids.material]);
      assert.equal(stock.qty.replace(/\.0+$/, ""), "149"); assert.equal(stock.value, "2398352");
    });
    await check("P1 multiline remainder returns and follow-up preserve each source line and finish exactly", async () => {
      const f = await fixture(); await arrive(f);
      await rpc("submit_delivery_result", [f.delivery, "PARTIAL", f.quantities(1, 1), "QA Receiver", "ISOLATED multiline partial", null, null, 4, randomUUID()]);
      await verify(f, 1, 1);
      for (const [lineId, quantity] of [[f.first.id, 1], [f.second.id, 2]]) {
        const verificationLine = (await rows("select id from public.delivery_verification_lines where delivery_line_id=$1", [lineId]))[0].id;
        const returned = await rpc("open_return_case", [verificationLine, "TRANSIT_REMAINDER", quantity, "ISOLATED multiline warehouse return", null, randomUUID()]);
        await rpc("resolve_return_case", [returned, "RETURNED", f.warehouse, "ISOLATED received remaining line", null, 1, randomUUID()]);
        const position = (await ledgerRows("select base_quantity::text as quantity,inventory_value_vnd::text as value from private.delivery_line_transit_position($1)", [lineId]))[0];
        assert.equal(position.quantity.replace(/\.0+$/, ""), "0"); assert.equal(position.value, "0");
      }
      const plan = JSON.stringify([{ supply_allocation_id: f.allocations[0], planned_base_quantity: 1 }, { supply_allocation_id: f.allocations[1], planned_base_quantity: 2 }]);
      const op = randomUUID(); const next = await rpc("create_delivery_from_allocations", [f.order, plan, null, op]);
      assert.equal(await rpc("create_delivery_from_allocations", [f.order, plan, null, op]), next);
      await denied(() => rpc("create_delivery_from_allocations", [f.order, plan, null, randomUUID()]), /delivery_exceeds_allocation/);
      await rpc("assign_delivery", [next, ids.employee, f.vehicle, null, null, 1, randomUUID()]); await arrive({ delivery: next });
      const lines = await rows("select id,material_id,planned_base_quantity::text as quantity from public.delivery_lines where delivery_id=$1", [next]);
      assert.equal(lines.length, 2);
      assert.equal(lines.find((line) => line.material_id === ids.material).quantity.replace(/\.0+$/, ""), "1");
      assert.equal(lines.find((line) => line.material_id === ids.secondMaterial).quantity.replace(/\.0+$/, ""), "2");
      await rpc("submit_delivery_result", [next, "FULL", JSON.stringify(lines.map((line) => ({ delivery_line_id: line.id, actual_base_quantity: line.quantity }))), "QA Receiver", "ISOLATED complete both remaining lines", null, null, 4, randomUUID()]);
      const result = (await rows("select id from public.delivery_results where delivery_id=$1", [next]))[0].id;
      await rpc("verify_delivery", [result, JSON.stringify(lines.map((line) => ({ delivery_line_id: line.id, accepted_base_quantity: line.quantity, billable_base_quantity: line.quantity }))), 5, randomUUID()]);
      assert.equal((await rows("select fulfillment_state from public.sales_order_read where id=$1", [f.order]))[0].fulfillment_state, "FULFILLED");
      const [debt] = await rows("select count(*)::int as count,sum(original_amount_vnd)::text as amount from public.receivable_read where sales_order_id=$1", [f.order]);
      assert.equal(debt.count, 2); assert.equal(debt.amount, "480000");
      for (const line of lines) {
        const position = (await ledgerRows("select base_quantity::text as quantity,inventory_value_vnd::text as value from private.delivery_line_transit_position($1)", [line.id]))[0];
        assert.equal(position.quantity.replace(/\.0+$/, ""), "0"); assert.equal(position.value, "0");
      }
    });
    await check("DB invalid SO quantities reject the entire multiline command", async () => {
      await as(ids.owner);
      const sale = (quantity) => ({ material_id: ids.material, ordered_uom_id: ids.unit, quantity, conversion_numerator: "1", conversion_denominator: "1", rounding_mode: "HALF_UP", unit_price_vnd: "120000", pricing_rule_id: ids.price, pricing_rule_version: 1, price_source_type: "LIST" });
      const args = [ids.branch, ids.customer, ids.site, "2030-01-01", "ISOLATED quantity validation"];
      const valid = await rpc("create_sales_order_draft", [...args, JSON.stringify([sale("1"), sale("2")]), randomUUID()]);
      assert.equal((await rows("select count(*)::int as count from public.sales_order_lines where sales_order_id=$1", [valid]))[0].count, 2);
      const before = (await rows("select count(*)::int as count from public.sales_orders where branch_id=$1", [ids.branch]))[0].count;
      for (const quantity of ["", "0", "-1"]) {
        await denied(() => rpc("create_sales_order_draft", [...args, JSON.stringify([sale(quantity), sale("2")]), randomUUID()]));
        assert.equal((await rows("select count(*)::int as count from public.sales_orders where branch_id=$1", [ids.branch]))[0].count, before);
      }
    });
    await check("DB route Apply rejects changed assignment then applies a refreshed plan once", async () => {
      const f = await fixture();
      const stops = (deliveryVersion, assignmentVersion) => JSON.stringify([{ delivery_id: f.delivery, stop_order: 1, expected_delivery_version: deliveryVersion, expected_assignment_version: assignmentVersion, address_snapshot: "ISOLATED route address" }]);
      const routeArgs = [ids.branch, "2030-03-01T09:00:00Z", f.vehicle, ids.employee, "MANUAL_FALLBACK", null, null, "ISOLATED no external routing call"];
      const oldPlan = await rpc("create_route_plan", [...routeArgs, stops(2, 1), randomUUID()]);
      await rpc("assign_delivery", [f.delivery, ids.employee, f.vehicle, null, null, 2, randomUUID()]);
      await denied(() => rpc("apply_route_plan", [oldPlan, 1, randomUUID()]), /route_delivery_stale|route_assignment_stale/);
      assert.equal((await rows("select status from public.route_plans where id=$1", [oldPlan]))[0].status, "DRAFT");
      assert.equal((await ledgerRows("select max(assignment_version)::int as version from public.delivery_assignments where delivery_id=$1", [f.delivery]))[0].version, 2);
      const refreshed = await rpc("create_route_plan", [...routeArgs, stops(3, 2), randomUUID()]);
      const op = randomUUID(); assert.equal(await rpc("apply_route_plan", [refreshed, 1, op]), refreshed);
      assert.equal(await rpc("apply_route_plan", [refreshed, 1, op]), refreshed);
      assert.equal((await ledgerRows("select count(*)::int as count,max(assignment_version)::int as version from public.delivery_assignments where delivery_id=$1", [f.delivery]))[0].count, 3);
      assert.equal((await rows("select status from public.route_plans where id=$1", [refreshed]))[0].status, "APPLIED");
    });
    await check("DB stale GPS cannot replace a newer position or confirm a delivery", async () => {
      const f = await fixture(); await as(ids.worker);
      const session = await rpc("start_gps_tracking", [f.delivery, 1, randomUUID()]);
      const captured = (await rows("select now()::text as captured"))[0].captured;
      const op = randomUUID(); const args = [session, 2, captured, "10.5", "106.5", "5", null, null, op];
      const position = await rpc("record_gps_ping", args);
      assert.equal(await rpc("record_gps_ping", args), position);
      await denied(() => rpc("record_gps_ping", [session, 1, captured, "10.4", "106.4", "5", null, null, randomUUID()]), /gps_ping_out_of_order/);
      const older = (await rows("select (now()-interval '10 seconds')::text as captured"))[0].captured;
      await denied(() => rpc("record_gps_ping", [session, 3, older, "10.4", "106.4", "5", null, null, randomUUID()]), /gps_ping_out_of_order/);
      const positions = await ledgerRows("select id,sequence::text as sequence,latitude::text as latitude from public.gps_positions where session_id=$1", [session]);
      assert.equal(positions.length, 1); assert.equal(positions[0].id, position); assert.equal(positions[0].sequence, "2");
      assert.equal(positions[0].latitude.replace(/0+$/, ""), "10.5");
      assert.equal((await rows("select execution_state from public.deliveries where id=$1", [f.delivery]))[0].execution_state, "ASSIGNED");
      assert.equal((await rows("select count(*)::int as count from public.delivery_verifications where delivery_id=$1", [f.delivery]))[0].count, 0);
      assert.equal((await rows("select count(*)::int as count from public.receivable_read where sales_order_id=$1", [f.order]))[0].count, 0);
      await rpc("assign_delivery", [f.delivery, ids.employee, f.vehicle, null, null, 2, randomUUID()]); await as(ids.worker);
      await denied(() => rpc("record_gps_ping", [session, 3, captured, "10.6", "106.6", "5", null, null, randomUUID()]), /gps_session_not_active|gps_assignment_revoked/);
      await as(ids.owner);
    });
    await check("DB chat separates customer/internal audiences and reads persisted messages after session reset", async () => {
      const customerActor = randomUUID();
      await db.exec("reset role");
      await rows("insert into auth.users(id) values($1)", [customerActor]);
      await rows("insert into public.customer_portal_memberships(auth_user_id,customer_id,membership_role) values($1,$2,'OWNER')", [customerActor, ids.customer]);
      await as(ids.owner);
      const internal = await rpc("create_conversation", [ids.branch, "INTERNAL", null, "ISOLATED internal conversation", "customer", ids.customer, [ids.worker], randomUUID()]);
      const customerConversation = await rpc("create_conversation", [ids.branch, "CUSTOMER", ids.customer, "ISOLATED customer conversation", "customer", ids.customer, [customerActor], randomUUID()]);
      const op = randomUUID(); const message = await rpc("send_message", [internal, "ISOLATED internal-only body", op]);
      assert.equal(await rpc("send_message", [internal, "ISOLATED internal-only body", op]), message);
      await as(customerActor);
      await denied(() => rows("select * from public.conversation_message_page($1,null,null,50)", [internal]), /forbidden/);
      await denied(() => rpc("send_message", [internal, "Forbidden cross-audience reply", randomUUID()]), /forbidden/);
      const customerMessage = await rpc("send_message", [customerConversation, "ISOLATED synthetic customer reply", randomUUID()]);
      await as(ids.worker);
      await denied(() => rows("select * from public.conversation_message_page($1,null,null,50)", [customerConversation]), /forbidden/);
      assert.equal((await rows("select * from public.conversation_message_page($1,null,null,1)", [internal]))[0].id, message);
      await as(ids.stranger); await denied(() => rows("select * from public.conversation_message_page($1,null,null,50)", [internal]), /forbidden/);
      await db.exec("reset role"); await as(ids.owner);
      assert.equal((await rows("select * from public.conversation_message_page($1,null,null,50)", [customerConversation]))[0].id, customerMessage);
      assert.equal((await rows("select count(*)::int as count from public.messages where conversation_id=$1", [internal]))[0].count, 1);
    });
    await check("DB report job dedupe, lease and completed retry do not duplicate export rows", async () => {
      await as(ids.owner);
      const cutoff = (await rows("select now()::text as cutoff"))[0].cutoff;
      const args = [ids.branch, "AR", "2030-03-01", cutoff, ids.customer];
      const job = await rpc("create_report_export_job", args);
      assert.equal(await rpc("create_report_export_job", args), job);
      await ledgerRows("update public.report_export_jobs set lease_until=now()+interval '30 seconds' where id=$1", [job]);
      const leased = await rpc("advance_report_export_job", [job]); assert.equal(leased.attempt, 0);
      await ledgerRows("update public.report_export_jobs set lease_until=null,next_run_at=now() where id=$1", [job]);
      const completed = await rpc("advance_report_export_job", [job]); assert.equal(completed.state, "COMPLETED"); assert.equal(completed.attempt, 1);
      const [stored] = await rows("select rows_json,processed_rows from public.report_export_jobs where id=$1", [job]);
      assert.ok(stored.processed_rows > 0); assert.equal(stored.rows_json.length, stored.processed_rows);
      assert.equal(new Set(stored.rows_json.map((item) => item.id)).size, stored.processed_rows);
      assert.deepEqual(await rpc("advance_report_export_job", [job]), completed);
      assert.deepEqual((await rows("select rows_json,processed_rows from public.report_export_jobs where id=$1", [job]))[0], stored);
      await as(ids.worker); await denied(() => rpc("advance_report_export_job", [job]), /report_export_forbidden/); await as(ids.owner);
    });
    if (nativeName) {
      await check("RACE two distinct requests cannot both consume the same released remainder", async () => {
        const f = await fixture(); await partial(f); await returnFirst(f);
        const outcomes = await race(ids.owner, "create_delivery_from_allocations", () => [f.order, JSON.stringify([{ supply_allocation_id: f.allocations[0], planned_base_quantity: 1 }]), null, randomUUID()]);
        assert.equal(outcomes.filter((item) => item.status === "fulfilled").length, 1);
        assert.equal(outcomes.filter((item) => item.status === "rejected" && /delivery_exceeds_allocation/.test(item.reason.message)).length, 1);
        assert.equal((await rows("select count(*)::int as count from public.deliveries where sales_order_id=$1", [f.order]))[0].count, 2);
      });
      await check("RACE duplicate worker submission creates one linked result", async () => {
        const f = await fixture({ publish: true }); await arrive(f); await as(ids.worker);
        await rpc("start_work_item", [f.work, 1, randomUUID()]); await as(ids.owner);
        const args = [f.work, f.quantities(1, 0), "QA Receiver", "ISOLATED racing submit", null, null, 2, 4, 1, randomUUID()];
        const outcomes = await race(ids.worker, "submit_portal_delivery_result", args);
        assert.ok(outcomes.every((item) => item.status === "fulfilled"));
        assert.equal(outcomes[0].value, outcomes[1].value);
        assert.equal((await rows("select count(*)::int as count from public.delivery_results where delivery_id=$1", [f.delivery]))[0].count, 1);
        assert.equal((await rows("select count(*)::int as count from public.work_item_results where work_item_id=$1", [f.work]))[0].count, 1);
      });
      await check("RACE duplicate Owner verification posts one AR and one verification", async () => {
        const f = await fixture(); await arrive(f);
        await rpc("submit_delivery_result", [f.delivery, "PARTIAL", f.quantities(1, 0), "QA Receiver", "ISOLATED racing verify", null, null, 4, randomUUID()]);
        const result = (await rows("select id from public.delivery_results where delivery_id=$1", [f.delivery]))[0].id;
        const args = [result, JSON.stringify([{ delivery_line_id: f.first.id, accepted_base_quantity: 1, billable_base_quantity: 1 }, { delivery_line_id: f.second.id, accepted_base_quantity: 0, billable_base_quantity: 0 }]), 5, randomUUID()];
        const outcomes = await race(ids.owner, "verify_delivery", args);
        assert.ok(outcomes.every((item) => item.status === "fulfilled"));
        assert.equal(outcomes[0].value, outcomes[1].value);
        assert.equal((await rows("select count(*)::int as count from public.delivery_verifications where delivery_id=$1", [f.delivery]))[0].count, 1);
        const [debt] = await rows("select count(*)::int as count,sum(original_amount_vnd)::text as amount from public.receivable_read where sales_order_id=$1", [f.order]);
        assert.equal(debt.count, 1); assert.equal(debt.amount, "120000");
      });
      await check("RACE two final custody returns preserve exact total value and zero residual", async () => {
        const f = await fixture(); await partial(f);
        const line = (await rows("select id from public.delivery_verification_lines where delivery_line_id=$1", [f.first.id]))[0].id;
        const cases = [];
        for (let i = 0; i < 2; i += 1) cases.push(await rpc("open_return_case", [line, "TRANSIT_REMAINDER", "0.5", "ISOLATED concurrent half return", null, randomUUID()]));
        const outcomes = await race(ids.owner, "resolve_return_case", (i) => [cases[i], "RETURNED", f.warehouse, "ISOLATED final half returned", null, 1, randomUUID()]);
        assert.ok(outcomes.every((item) => item.status === "fulfilled"));
        const [position] = await ledgerRows("select base_quantity::text as qty,inventory_value_vnd::text as value from private.delivery_line_transit_position($1)", [f.first.id]);
        assert.equal(position.qty.replace(/\.0+$/, ""), "0"); assert.equal(position.value, "0");
        assert.equal((await rows("select inventory_value_vnd::text as value from public.warehouse_inventory_read where warehouse_id=$1 and material_id=$2", [f.warehouse, ids.material]))[0].value, "2704183");
      });
      await check("RACE two assignments cannot both change the same delivery version", async () => {
        const f = await fixture();
        const outcomes = await race(ids.owner, "assign_delivery", () => [f.delivery, ids.employee, f.vehicle, null, null, 2, randomUUID()]);
        assert.equal(outcomes.filter((item) => item.status === "fulfilled").length, 1);
        assert.equal(outcomes.filter((item) => item.status === "rejected").length, 1);
        assert.equal((await ledgerRows("select count(*)::int as count from public.delivery_assignments where delivery_id=$1", [f.delivery]))[0].count, 2);
        assert.equal((await rows("select version from public.deliveries where id=$1", [f.delivery]))[0].version, 3);
      });
    }
  }
} catch (error) {
  results.push({ name: "setup/migration", result: "FAIL", error: error.message, code: error.code });
  console.error(error.message);
} finally {
  if (baseline && process.env.HX_RULES_HISTORICAL_UPGRADE === "1") {
    await db.exec("reset role");
    for (const item of manifest.migrations.filter((item) => !files.includes(item.path.split("/").at(-1)))) {
      await db.exec(item.sql);
      await rows("insert into supabase_migrations.schema_migrations(version,name,statements) values ($1,$2,$3)", [item.version, item.path.split("/").at(-1), [item.sql]]);
    }
  }
  if (process.env.HX_RULES_SNAPSHOT) {
    const snapshot=await db.dumpDataDir('none');
    await writeFile(process.env.HX_RULES_SNAPSHOT,Buffer.from(await snapshot.arrayBuffer()));
  }
  await db.close(); }
const report = { environment: nativeName ? "Supabase QA isolated disposable native database" : "PGlite isolated in-memory", isolatedDatabase: nativeName ?? null, nativeEnvironment, baseline, migrations: files, migrationManifestFingerprint: manifest.fingerprint, migrationParity: checkedParity ?? null, signatureEvidence, adapterEvidence, raceEvidence, results,
  passed: results.filter((r) => r.result === "PASS").length, failed: results.filter((r) => r.result === "FAIL").length,
  production: "NOT_TOUCHED", cloudQA: nativeName ? "ISOLATED_CHILD_DATABASE_ONLY" : "NOT_TOUCHED" };
if (process.env.HX_RULES_REPORT) await writeFile(process.env.HX_RULES_REPORT, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ passed: report.passed, failed: report.failed, baseline }));
if (report.failed) process.exitCode = 1;
