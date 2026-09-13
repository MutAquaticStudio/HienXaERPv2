const base = process.argv[2];
if (!base || !/^https?:\/\//.test(base)) {
  throw new Error('Usage: node scripts/check-deployment.mjs https://deployment-url');
}
const cases = [
  ['/', 200], ['/login', 200], ['/work/login', 200],
  ['/customer/login', 200], ['/api/health', 200],
  ['/work', 'login'], ['/customer', 'login'],
  ['/api/evidence/00000000-0000-4000-8000-000000000000/signed', 401],
];
let failed = 0;
for (const [path, expected] of cases) {
  try {
    const response = await fetch(new URL(path, base), {
      redirect: 'manual', signal: AbortSignal.timeout(30000),
    });
    const body = await response.text();
    const location = response.headers.get('location');
    const streamedRedirect = body.includes('NEXT_REDIRECT') && body.includes('/login');
    const passed = expected === 'login'
      ? (([303, 307, 308].includes(response.status) && Boolean(location?.includes('/login'))) ||
        (response.status === 200 && streamedRedirect))
      : response.status === expected && !body.includes('Supabase runtime is not configured');
    if (!passed) failed++;
    console.log(JSON.stringify({ path, status: response.status, passed }));
  } catch (error) {
    failed++;
    console.log(JSON.stringify({ path, passed: false, error: error.message }));
  }
}
process.exitCode = failed ? 1 : 0;
