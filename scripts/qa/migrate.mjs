import { spawn } from 'node:child_process';
import { guard, required } from './core.mjs';
const { ref } = guard();
const args = ['exec','supabase','db','push','--skip-vault','--yes'];
if (process.env.DATABASE_URL) {
  const url = new URL(process.env.DATABASE_URL);
  url.searchParams.set('sslmode','verify-full');
  if (process.env.HX_QA_CA_FILE) url.searchParams.set('sslrootcert',process.env.HX_QA_CA_FILE);
  args.push('--db-url',url.href);
} else {
  required('SUPABASE_ACCESS_TOKEN');
  required('SUPABASE_DB_PASSWORD');
  args.push('--project-ref',ref);
}
// Explicit ref; never use a persisted production project link.
const child = spawn('pnpm', args, { stdio:'inherit', env:process.env });
child.on('error', () => { console.error('Could not launch Supabase CLI'); process.exitCode=1; });
child.on('exit', code => { process.exitCode=code ?? 1; });
