import { writeFile } from "node:fs/promises";
import { argumentsForRun, openQA } from "./native-fixture.mjs";

const args = argumentsForRun();
const qa = await openQA(args);
try {
  const functions = await qa.sql`select n.nspname schema,p.proname name,
    pg_get_function_identity_arguments(p.oid) arguments,pg_get_functiondef(p.oid) definition,
    has_function_privilege('authenticated',p.oid,'EXECUTE') callable
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private') and p.prokind='f'
    order by n.nspname,p.proname,p.oid`;
  const quantity = functions.filter((f) => /quantity|quantities/.test(f.definition));
  const versions = functions.filter((f) => /expected_version/.test(f.arguments));
  const report = { database: args.database, productionAccess: "NONE", schema: (await qa.sql`select count(*)::int n from supabase_migrations.schema_migrations`)[0].n,
    quantities: quantity.map((f) => ({ ...f, exactGuard: /require_exact_quantity|require_quantity_lines|assert_commercial_line|assert_purchase_line/.test(f.definition) })),
    versions: versions.map((f) => ({ ...f, unsafeComparison: /(?:<>|!=|=)\s*expected_version\b/.test(f.definition) })),
    operationGate: functions.filter((f) => /require_active_operations|branch_is_operational/.test(f.definition)),
    excludedReexecution: ["PACKAGE4_G07_CONCURRENCY", "PACKAGE4_G07_SAME_INTENT_CONCURRENCY"] };
  await writeFile(args.out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ schema: report.schema, quantityFunctions: quantity.length,
    quantityWithoutLocalExactGuard: report.quantities.filter((f) => f.callable && f.schema === "public" && !f.exactGuard).map((f) => f.name),
    versionCommands: versions.length, unsafeVersions: report.versions.filter((f) => f.unsafeComparison).map((f) => f.name) }));
} finally { await qa.sql.end({ timeout: 3 }); }
