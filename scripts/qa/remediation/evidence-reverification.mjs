import { createHash } from 'node:crypto';
import { open, readFile, mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const digest = value => createHash('sha256').update(value).digest('hex');
export const fingerprint = item => digest(JSON.stringify(item));
export function evidenceMime(bytes) {
  if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.length >= 8 && Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (bytes.length >= 5 && Buffer.from(bytes.subarray(0, 5)).toString() === '%PDF-') return 'application/pdf';
  return null;
}

// A successful download, not client metadata, establishes the measured values.
export async function inspectEvidence(item, download) {
  const base = { key: item.namespace + ':' + item.id, metadataFingerprint: fingerprint(item), sources: item.sources };
  let file;
  try { file = await download(item); }
  catch { return { ...base, classification: 'INCONCLUSIVE', reason: 'CONNECTION_OR_PERMISSION' }; }
  if (file.error) {
    // Storage may deliberately mask a permission denial as 404. Only an inventory
    // read with an authorized server credential can establish physical absence.
    return { ...base, classification: file.authoritativeMissing ? 'MISSING' : 'INCONCLUSIVE', reason: file.authoritativeMissing ? 'OBJECT_NOT_FOUND' : 'CONNECTION_OR_PERMISSION' };
  }
  const bytes = new Uint8Array(await file.data.arrayBuffer());
  const actual = { byteSize: bytes.length, checksumSha256: digest(bytes), mimeType: evidenceMime(bytes) };
  const basisKnown = /^[0-9a-f]{64}$/.test(item.checksumSha256 ?? '') && Number.isSafeInteger(item.byteSize) && item.byteSize > 0;
  const mismatch = bytes.length < 1 || bytes.length > 10485760 || !actual.mimeType ||
    (item.byteSize != null && item.byteSize !== bytes.length) ||
    (item.declaredByteSize != null && item.declaredByteSize !== bytes.length) ||
    (item.mimeType != null && item.mimeType !== actual.mimeType) ||
    (item.checksumSha256 != null && item.checksumSha256 !== actual.checksumSha256);
  return { ...base, actual, classification: mismatch ? 'MISMATCH' : basisKnown ? 'MATCH' : 'INCONCLUSIVE',
    reason: mismatch ? 'STORED_BYTES_DISAGREE_WITH_BASIS' : basisKnown ? 'STORED_BYTES_MATCH_BASIS' : 'NO_RECORDED_CHECKSUM_OR_SIZE',
    eligibleForReverification: !mismatch && basisKnown && ['READY','VERIFIED'].includes(item.state) };
}

export async function readCheckpoint(file, manifestHash) {
  let value;
  try { value = await readFile(file, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return new Map(); throw error; }
  const lines = value.split('\n');
  const header = JSON.parse(lines.shift());
  if (header.manifestHash !== manifestHash) throw new Error('Checkpoint belongs to a different metadata snapshot');
  const rows = new Map();
  for (let index = 0; index < lines.length; index++) {
    if (!lines[index]) continue;
    try { const result = JSON.parse(lines[index]); rows.set(result.key, result); }
    catch (error) {
      // Ignore only an incomplete final append. A corrupt complete record stops.
      if (index !== lines.length - 1 || value.endsWith('\n')) throw error;
    }
  }
  return rows;
}

export async function scanEvidence(manifest, download, checkpoint, options = {}) {
  await mkdir(path.dirname(checkpoint), { recursive: true, mode: 0o700 });
  const manifestHash = fingerprint(manifest), saved = await readCheckpoint(checkpoint, manifestHash);
  // Rewrite validated complete records first, dropping a torn final write.
  const temporary = checkpoint + '.tmp';
  await writeFile(temporary, [JSON.stringify({ version: 1, manifestHash }), ...[...saved.values()].map(JSON.stringify)].join('\n') + '\n', { mode: 0o600 });
  await rename(temporary, checkpoint);
  const output = await open(checkpoint, 'a', 0o600);
  let processed = 0;
  try {
    for (const item of manifest.items) {
      const key = item.namespace + ':' + item.id, previous = saved.get(key);
      if (previous && previous.metadataFingerprint === fingerprint(item) &&
        !(options.retryInconclusive && previous.classification === 'INCONCLUSIVE')) continue;
      if (processed >= (options.limit ?? Infinity)) break;
      const result = await inspectEvidence(item, download);
      await output.write(JSON.stringify(result) + '\n');
      await output.sync();
      saved.set(key, result); processed++;
    }
  } finally { await output.close(); }
  const results = manifest.items.flatMap(item => {
    const row = saved.get(item.namespace + ':' + item.id);
    return row && row.metadataFingerprint === fingerprint(item) ? [row] : [];
  });
  return { manifestHash, processedThisRun: processed, completed: results.length, total: manifest.items.length,
    counts: results.reduce((counts, row) => ({ ...counts, [row.classification]: (counts[row.classification] ?? 0) + 1 }), {}),
    results, mutatesBusinessData: false, attestsDatabase: false };
}
