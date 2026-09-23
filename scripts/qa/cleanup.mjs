import { database, guard, artifact } from './core.mjs';
const config = guard();
if (process.env.HX_QA_CLEANUP_REF !== config.ref) throw new Error('Set HX_QA_CLEANUP_REF to the exact QA ref');
const sql = await database();
try {
  // Preserve financial/audit history and revoke only the explicitly namespaced QA actors.
  const result = await sql.begin(async tx => {
    const employees = await tx`update public.employees set active=false,deactivated_at=now() where code like 'HXQA-%' and active returning id`;
    const memberships = await tx`update public.customer_portal_memberships m set active=false,revoked_at=now() from auth.users u where m.auth_user_id=u.id and u.raw_app_meta_data->>'qa_seed'='hienxa-qa-v1' and m.active returning m.id`;
    const accounts = await tx`update public.finance_accounts set active=false where code like 'HXQA-P%' and name='HXQA performance account' returning id`;
    return { employees: employees.length, memberships: memberships.length, performanceAccounts: accounts.length };
  });
  await artifact('cleanup', { status: 'PASS', mode: 'REVOKE_QA_ACTORS_PRESERVE_HISTORY', ...result });
} finally { await sql.end(); }
