import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { argumentsForRun, openQA } from "./native-fixture.mjs";
import { realQAAuth } from "./auth.mjs";

const args = argumentsForRun(), qa = await openQA(args);
const auth = await realQAAuth(args['auth-env'], { finance: 'hxqa-finance-employee@example.test', sales: 'hxqa-sales@example.test' });
const read = async name => JSON.parse(await readFile(new URL(name, 'file://' + args['evidence-root'] + '/'), 'utf8'));
const checks = [];
try {
  const [history] = await qa.sql`select count(*)::int n from supabase_migrations.schema_migrations`;
  assert.equal(history.n, Number(args["expected-schema"] ?? 164));
  const old = await read('PACKAGE4_G09_AUTH_REVENUE.json');
  const fee = await read('PACKAGE9_G16_FEE_AUTH142.json');
  async function snapshot(customer, cutoff = '2030-01-01', role = 'finance') {
    const result = await auth.api(role, 'rpc/finance_dashboard_snapshot', { target_branch_id: qa.fixtures.branch,
      from_inclusive: '2000-01-01', to_exclusive: '2030-01-01', knowledge_cutoff: cutoff,
      target_customer_id: customer, target_activity_kind: 'DELIVERY' });
    assert.equal(result.status, 200);
    return result.data;
  }
  const gross = await snapshot(old.docs.paid.stock.customer);
  assert.equal(gross.revenue.value_vnd, '2990000');
  assert.equal(gross.direct_cost.value_vnd, '1950000');
  assert.equal(gross.gross_profit.value_vnd, '1040000');
  checks.push({ name: 'EXISTING_GROSS_1040000_PRESERVED_WITHOUT_RECREATING_SOURCE', status: 'PASS', snapshot: gross });
  const historical = await snapshot(fee.documents.customer, fee.checks[0].feeOnly.scope.as_of);
  assert.equal(historical.gross_profit.quality, 'INCOMPLETE');
  assert.equal(historical.gross_profit.value_vnd, null);
  const current = await snapshot(fee.documents.customer);
  assert.equal(current.gross_profit.quality, 'READY');
  assert.equal(current.direct_cost.value_vnd, '1520000');
  assert.equal(current.gross_profit.value_vnd, '780000');
  checks.push({ name: 'EVERY_DIRECT_SOURCE_REQUIRED_AND_FEE_NOT_A_COMPLETENESS_SUBSTITUTE', status: 'PASS', historical, current });
  const denied = await snapshot(fee.documents.customer, '2030-01-01', 'sales');
  assert.equal(denied.direct_cost.quality, 'FORBIDDEN');
  assert.equal(denied.direct_cost.value_vnd, null);
  assert.equal(denied.gross_profit.value_vnd, null);
  checks.push({ name: 'SALES_READER_STILL_DENIED_COST_AND_PROFIT', status: 'PASS', denied });
  await writeFile(args.out, JSON.stringify({ scope: 'FINAL_SCHEMA164_REAL_JWT_READ_ONLY_G09_G16_G05',
    status: 'PASS', schema: history.n, checks, newBusinessWrites: 0, tokensRecorded: false, productionAccess: 'NONE' }, null, 2));
  console.log(JSON.stringify({ status: 'PASS', checks: checks.length, newBusinessWrites: 0 }));
} finally { await qa.sql.end({ timeout: 3 }); }
