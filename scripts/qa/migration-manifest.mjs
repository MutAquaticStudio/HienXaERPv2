import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';

const checksum = text => createHash('sha256').update(text).digest('hex');

// Reviewed outer transaction envelopes only. Never strip PL/pgSQL blocks.
export function migrationBody(sql) {
  const envelope = /^((?:\s|--[^\n]*\n)*)begin\s*;([\s\S]*)commit\s*;\s*$/i.exec(sql);
  const body = envelope ? `${envelope[1]}${envelope[2]}` : sql;
  if (/^\s*(?:BEGIN(?:\s+(?:TRANSACTION|WORK))?|COMMIT|ROLLBACK)\s*;/im.test(body)) {
    throw new Error('Unreviewed transaction control in candidate migration');
  }
  return body;
}

export async function migrationManifest(directory = new URL('../../supabase/migrations/', import.meta.url)) {
  const files = (await readdir(directory)).filter(file => file.endsWith('.sql')).sort();
  const migrations = [];
  for (const [index, file] of files.entries()) {
    if (!/^\d{14}_.+\.sql$/.test(file)) throw new Error(`Invalid migration filename: ${file}`);
    const sql = await readFile(new URL(file, directory), 'utf8');
    migrations.push({ order: index + 1, version: file.slice(0, 14), path: `supabase/migrations/${file}`, sha256: checksum(sql), sql });
  }
  if (!migrations.length || new Set(migrations.map(m => m.version)).size !== migrations.length) throw new Error('Empty or duplicate migration manifest');
  const fingerprint = checksum(JSON.stringify(migrations.map(migration => ({ order: migration.order, version: migration.version, path: migration.path, sha256: migration.sha256 }))));
  return { fingerprint, migrations };
}

export function migrationParity(manifest, applied) {
  const byVersion = new Map(applied.map(row => [row.version, row]));
  const expected = new Set(manifest.migrations.map(row => row.version));
  const missing = [], different = [], unverifiable = [], matched = [];
  for (const migration of manifest.migrations) {
    const row = byVersion.get(migration.version);
    if (!row) { missing.push(migration.version); continue; }
    if (!Array.isArray(row.statements) || row.statements.length !== 1 || typeof row.statements[0] !== 'string') {
      unverifiable.push({ version: migration.version, reason: 'Original complete SQL/checksum not preserved by ledger' });
    } else if (checksum(row.statements[0]) === migration.sha256) matched.push(migration.version);
    else different.push({ version: migration.version, reason: 'Stored statement bytes differ; formatting/content equivalence not assumed' });
  }
  const extra = applied.filter(row => !expected.has(row.version)).map(row => row.version);
  return { result: missing.length || extra.length || different.length || unverifiable.length ? 'BLOCKED_ENV' : 'PASS', missing, extra, different, unverifiable, matched };
}
