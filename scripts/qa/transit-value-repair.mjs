import { readFile, writeFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

// Deliberately no live DATABASE_URL/Production connection and no ledger rewrite.
const snapshot = process.env.HX_REPAIR_SNAPSHOT;
if (!snapshot) throw new Error('An isolated historical fixture snapshot is required; live databases are not supported');
const db = await PGlite.create({ extensions: { pgcrypto }, loadDataDir: new Blob([await readFile(snapshot)]) });
const report = { mode: 'DRY_RUN', production: 'NOT_TOUCHED', repairMechanism: 'BLOCKED_POLICY', candidates: [], needsReview: [] };
try {
  await db.exec('reset role');
  const positions = (await db.query(`select l.id::text as delivery_line_id,l.delivery_id::text,l.material_id::text,
    p.base_quantity::text,p.inventory_value_vnd::text
    from public.delivery_lines l cross join lateral private.delivery_line_transit_position(l.id) p
    where p.base_quantity=0 and p.inventory_value_vnd<>0 order by l.id`)).rows;
  for (const row of positions) {
    const item = { ...row, proposedDeltaVnd: (-BigInt(row.inventory_value_vnd)).toString(),
      reason: 'Final transit return rounding discrepancy; source-line reconciliation is required before apply' };
    if (row.inventory_value_vnd === '1') report.candidates.push(item); else report.needsReview.push(item);
  }
  // Existing ledger requires a nonzero quantity and value with matching signs.
  // An apply cannot be fabricated with compensating quantities or edited history.
  if (process.argv.includes('--apply')) {
    report.applyResult = 'BLOCKED_POLICY'; process.exitCode = 2;
  }
} finally { await db.close(); }
if (process.env.HX_REPAIR_REPORT) await writeFile(process.env.HX_REPAIR_REPORT, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
