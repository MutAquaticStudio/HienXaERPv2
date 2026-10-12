import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import postgres from "postgres";
import { argumentsForRun, openQA } from "../remediation/native-fixture.mjs";
const a = argumentsForRun(), q = await openQA(a);
assert.equal(a.database, "hx_remediation_go_live_browser175");
const config = JSON.parse(await readFile(a.credentials, "utf8"));
const fresh = postgres({ ...config, database: "hx_remediation_go_live_fresh177_resume", max: 1, prepare: false });
const read = sql => sql`select n.nspname schema,p.proname name,pg_get_function_identity_arguments(p.oid) signature,
  md5(pg_get_functiondef(p.oid)) hash,p.proacl::text acl
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in('public','private') and p.prokind='f' order by 1,2,3`;
try {
  const [left, right] = await Promise.all([read(q.sql), read(fresh)]);
  const differences = left.flatMap(x => {
    const y = right.find(y => x.schema === y.schema && x.name === y.name && x.signature === y.signature);
    return y && y.hash === x.hash && y.acl === x.acl ? [] : [{ restored: x, fresh: y ?? null }];
  });
  const old = JSON.parse(await readFile("reports/business-flow-remediation/evidence/RELEASE_EFFECTIVE174.json", "utf8"));
  const unchanged = [];
  for (const x of old.functions) {
    const [actual] = await q.sql`select pg_get_functiondef(p.oid) definition,p.proacl::text acl from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace where n.nspname=${x.schema} and p.proname=${x.name}
      and pg_get_function_identity_arguments(p.oid)=${x.signature}`;
    assert.equal(actual.definition, x.definition, x.name); assert.equal(actual.acl, x.acl, x.name);
    unchanged.push({ schema: x.schema, name: x.name, signature: x.signature });
  }
  const report = { checkedAt: new Date().toISOString(), status: differences.length ? "DIFFERENCES_REQUIRE_REVIEW" : "PASS_ALL_NATIVE_FUNCTIONS_AND_ACL", restoredCount: left.length, freshCount: right.length, differences, old174RelevantContractsUnchanged: unchanged, functions: left, productionAccess: "NONE", managedDatabaseParity: "NOT_CLAIMED_BY_NATIVE_COMPARISON" };
  await writeFile(a.out, JSON.stringify(report, null, 2));
  assert.equal(left.length, right.length); assert.equal(differences.length, 0, "Review recorded effective differences");
  console.log(JSON.stringify({ status: report.status, functions: left.length, oldRelevantContracts: unchanged.length }));
} finally { await fresh.end({ timeout: 3 }); await q.sql.end({ timeout: 3 }); }
