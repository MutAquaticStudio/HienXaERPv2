// Read-only QA survey. Never turns a scan result into a database attestation.
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs, parseEnv } from 'node:util';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { database, guard } from '../core.mjs';
import { scanEvidence, fingerprint } from './evidence-reverification.mjs';

const { values: args } = parseArgs({ options: {
  env: { type: 'string' }, manifest: { type: 'string' }, checkpoint: { type: 'string' }, out: { type: 'string' },
  limit: { type: 'string' }, 'retry-inconclusive': { type: 'boolean', default: false },
} });
for (const name of ['env','manifest','checkpoint','out']) if (!args[name]) throw new Error('Missing --' + name);
const env = parseEnv(await readFile(args.env, 'utf8'));
Object.assign(process.env, env);
const config = guard();
if (config.ref !== 'ffrwiglcrlumfvhubaxg' || !env.SUPABASE_SECRET_KEY) throw new Error('An approved QA server connection is required');
const limit = args.limit === undefined ? Infinity : Number(args.limit);
if (!(limit === Infinity || Number.isSafeInteger(limit) && limit >= 0)) throw new Error('Invalid --limit');
const sql = await database();
const quote = name => '"' + name.replaceAll('"','""') + '"';
const client = createClient(config.url, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init = {}) => fetch(input, { ...init, cache: 'no-store', signal: AbortSignal.timeout(20000) }) },
});

async function snapshot() {
  return sql.begin(async tx => {
    await tx.unsafe('set transaction isolation level repeatable read, read only');
    const [schema] = await tx`select count(*)::int migrations,max(version) latest from supabase_migrations.schema_migrations`;
    const portal = await tx`select * from public.portal_evidence_objects order by id`;
    const internal = await tx`select * from public.evidence_objects order by id`;
    const references = await tx`select c.table_name,c.column_name from information_schema.columns c
      join information_schema.tables t using(table_schema,table_name)
      where c.table_schema='public' and t.table_type='BASE TABLE' and c.column_name in('evidence_id','evidence_object_id')
      and c.table_name not in('evidence_objects','portal_evidence_objects') order by c.table_name,c.column_name`;
    const links = new Map();
    for (const ref of references) {
      const rows = await tx.unsafe(`select ${quote(ref.column_name)}::text evidence_id,
        coalesce(to_jsonb(t)->>'id',to_jsonb(t)->>'work_result_id') source_id,
        to_jsonb(t)->>'branch_id' branch_id from public.${quote(ref.table_name)} t where ${quote(ref.column_name)} is not null`);
      for (const row of rows) {
        const key = row.evidence_id;
        links.set(key, [...(links.get(key) ?? []), { table: ref.table_name, column: ref.column_name, id: row.source_id, branchId: row.branch_id }]);
      }
    }
    const objects = await tx`select id::text,bucket_id,name,version from storage.objects order by bucket_id,name`;
    const items = [
      ...portal.map(e => ({ namespace: 'PORTAL', id: e.id, bucket: e.bucket_id, path: e.object_path,
        state: e.object_state, checksumSha256: e.checksum_sha256, byteSize: e.final_byte_size == null ? null : Number(e.final_byte_size),
        declaredByteSize: Number(e.declared_byte_size), mimeType: e.mime_type,
        context: { type: e.context_type, workItemId: e.work_item_id, customerId: e.customer_id, uploadedBy: e.uploaded_by }, sources: links.get(e.id) ?? [] })),
      ...internal.map(e => ({ namespace: 'INTERNAL', id: e.id, bucket: e.bucket_name, path: e.object_path,
        state: e.upload_state, checksumSha256: e.checksum_sha256, byteSize: e.byte_size == null ? null : Number(e.byte_size),
        mimeType: null, context: { branchId: e.branch_id, audience: e.audience, createdBy: e.created_by }, sources: links.get(e.id) ?? [] })),
    ];
    return { version: 1, projectRef: config.ref, schema, objects, items };
  });
}

try {
  const current = await snapshot();
  let manifest;
  try { manifest = JSON.parse(await readFile(args.manifest,'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    manifest = current;
    await writeFile(args.manifest, JSON.stringify(manifest,null,2), { mode: 0o600 });
  }
  if (fingerprint(manifest) !== fingerprint(current)) throw new Error('Metadata/object inventory changed: create a new manifest and checkpoint; keep the old survey');
  const report = await scanEvidence(manifest, async item => {
    const exists = manifest.objects.some(object => object.bucket_id === item.bucket && object.name === item.path);
    const result = await client.storage.from(item.bucket).download(item.path);
    if (result.error && !exists && String(result.error.statusCode) === '404') {
      // Verify absence again; do not infer missing from a denied download.
      const rows = await sql.begin(async tx => {
        await tx.unsafe('set transaction read only');
        return tx`select id from storage.objects where bucket_id=${item.bucket} and name=${item.path}`;
      });
      return { ...result, authoritativeMissing: rows.length === 0 };
    }
    return result;
  }, args.checkpoint, { limit, retryInconclusive: args['retry-inconclusive'] });
  await writeFile(args.out, JSON.stringify({
    scope: 'APPROVED_QA_REAL_STORAGE_LEGACY_READ_ONLY', createdAt: new Date().toISOString(),
    sourceCommit: execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
    projectRef: config.ref, schema: manifest.schema,
    businessSnapshotAfterUnchanged: fingerprint(await snapshot()) === fingerprint(manifest),
    ...report,
  }, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ completed: report.completed, total: report.total, processedThisRun: report.processedThisRun, counts: report.counts, writes: 0 }));
} catch {
  // Database/Storage errors can contain credential-bearing URLs. Never log them.
  console.error('Evidence survey stopped; configuration or metadata changed. No business data was written.');
  process.exitCode = 1;
} finally { await sql.end({timeout:3}); }
