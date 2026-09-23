import { clients, database, capacity, personas, email, required, artifact } from './core.mjs';
import { seedFixtures, seedName } from './fixtures.mjs';
const { admin } = await clients();
const sql = await database();
try {
  await capacity(sql);
  const password = required('HX_QA_PASSWORD');
  if (password.length < 20) throw new Error('Use a unique QA password of at least 20 characters');
  const users = {};
  const existing = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw new Error('Cannot enumerate QA users');
    existing.push(...data.users);
    if (data.users.length < 100) break;
  }
  for (const role of personas) {
    const found = existing.find(user => user.email === email(role));
    if (found && found.app_metadata?.qa_seed !== seedName) throw new Error(`Refusing unrelated existing user: ${role}`);
    if (found) { users[role] = found.id; continue; }
    const { data, error } = await admin.auth.admin.createUser({ email: email(role), password, email_confirm: true, app_metadata: { qa_seed: seedName } });
    if (error) throw new Error(`Cannot create QA persona ${role}: ${error.code ?? 'auth_error'}`);
    users[role] = data.user.id;
  }
  const batches = Number(process.env.HX_QA_BATCHES ?? 1);
  if (!Number.isInteger(batches) || batches < 1 || batches > 100) throw new Error('HX_QA_BATCHES must be 1..100');
  const dataset = await sql.begin(async tx => {
    await tx`select pg_advisory_xact_lock(72421001)`;
    return seedFixtures((text, params) => tx.unsafe(text, params), users, batches, () => capacity(tx));
  });
  await artifact('seed', { status: 'PASS', dataset, databaseBytes: await capacity(sql) });
} finally { await sql.end(); }
