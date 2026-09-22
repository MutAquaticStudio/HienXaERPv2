import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';

export const PRODUCTION_REF = 'nbwynrwkdbtfsitafsxa';
let applicationFingerprint = null;
export function guard(env = process.env) {
  const ref = env.HX_QA_PROJECT_REF;
  if (env.HX_QA_RUNTIME_APPROVED !== 'true' || !/^[a-z]{20}$/.test(ref ?? '') || ref === PRODUCTION_REF) throw new Error('QA approval and a separate QA project ref are required');
  const url = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://invalid');
  if (url.origin !== `https://${ref}.supabase.co` || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Supabase URL does not match QA project');
  if (env.HX_EINVOICE_ENABLED === 'true') throw new Error('E-invoice is excluded from QA release');
  const maxMb = Number(env.HX_QA_MAX_DB_MB ?? 400);
  if (!Number.isFinite(maxMb) || maxMb <= 0 || maxMb > 400) throw new Error('QA DB limit must be in (0, 400] MB');
  if (env.DATABASE_URL) {
    const db = new URL(env.DATABASE_URL);
    const direct = db.hostname === `db.${ref}.supabase.co` && db.username === 'postgres';
    const pooled = /^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(db.hostname) && decodeURIComponent(db.username) === `postgres.${ref}`;
    if (!['postgres:', 'postgresql:'].includes(db.protocol) || !(direct || pooled) || db.pathname !== '/postgres') throw new Error('Database URL does not match QA project');
    if (db.searchParams.has('sslmode') && db.searchParams.get('sslmode') !== 'verify-full') throw new Error('QA database TLS verification cannot be disabled');
  }
  return { ref, url: url.origin, maxMb };
}
export function id(label) {
  const hex = createHash('sha256').update(`hienxa-qa-v1:${label}`).digest('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
export const personas = ['owner', 'sales', 'worker', 'finance', 'receiver', 'other_customer'];
export const email = role => `hxqa-${role}@example.test`;
export function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
export async function database() {
  guard();
  const { default: postgres } = await import('postgres');
  const ssl = process.env.HX_QA_CA_FILE
    ? { rejectUnauthorized: true, ca: await readFile(process.env.HX_QA_CA_FILE, 'utf8') }
    : 'verify-full';
  return postgres(required('DATABASE_URL'), { ssl, max: 1, connect_timeout: 10, prepare: false });
}
export async function clients() {
  const config = guard();
  const { createClient } = await import('@supabase/supabase-js');
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  return {
    admin: createClient(config.url, required('SUPABASE_SECRET_KEY'), options),
    login: async role => {
      const client = createClient(config.url, required('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'), options);
      const { error } = await client.auth.signInWithPassword({ email: email(role), password: required('HX_QA_PASSWORD') });
      if (error) throw new Error(`QA login failed for ${role}: ${error.code ?? 'auth_error'}`);
      return client;
    },
  };
}
export async function capacity(sql) {
  const [{ bytes }] = await sql`select pg_database_size(current_database())::text as bytes`;
  if (Number(bytes) >= guard().maxMb * 1024 * 1024) throw new Error('QA database safety limit reached');
  return Number(bytes);
}
export function percentiles(rows) {
  const values = rows.map(r => r.ms).sort((a,b) => a-b);
  const percentile = p => values.length ? values[Math.max(0, Math.ceil(values.length*p)-1)] : null;
  return { samples: values.length, errors: rows.filter(r => !r.ok).length, p50: percentile(.5), p95: percentile(.95), p99: percentile(.99) };
}
export async function artifact(kind, result) {
  const directory = `artifacts/qa/${new Date().toISOString().replace(/[:.]/g, '-')}-${kind}`;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const manifest = {
    kind, createdAt: new Date().toISOString(), projectRef: guard().ref,
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    workingTreeDirty: Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()),
    applicationFingerprint,
    environment: { platform: os.platform(), arch: os.arch(), node: process.version, cpus: os.cpus().length, memoryBytes: os.totalmem(), region: process.env.HX_QA_REGION ?? 'UNRECORDED' },
    ...result,
  };
  const text = JSON.stringify(manifest, null, 2);
  await writeFile(`${directory}/manifest.json`, text, { mode: 0o600 });
  await writeFile(`${directory}/sha256.txt`, createHash('sha256').update(text).digest('hex') + '\n');
  console.log(JSON.stringify({ artifact: directory, status: result.status }));
  return directory;
}
export async function preflight() {
  const { ref } = guard();
  const base = new URL(required('HX_QA_APP_URL'));
  if (base.protocol !== 'https:' && !['localhost','127.0.0.1'].includes(base.hostname)) throw new Error('QA app must use HTTPS');
  const response = await fetch(new URL('/api/qa/environment', base), { redirect: 'error', signal: AbortSignal.timeout(15000) });
  const body = await response.json();
  if (!response.ok || body.projectRef !== ref || body.einvoiceEnabled !== false) throw new Error('Application is not bound to the approved QA project');
  if (!['localhost','127.0.0.1'].includes(base.hostname) && (!process.env.HX_QA_BUILD_SHA || body.buildSha !== process.env.HX_QA_BUILD_SHA)) throw new Error('Hosted QA build does not match HX_QA_BUILD_SHA');
  applicationFingerprint = { origin:base.origin,projectRef:body.projectRef,buildSha:body.buildSha };
  return base.origin;
}
