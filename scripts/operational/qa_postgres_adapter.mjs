import assert from 'node:assert/strict';

// The importer query contract supplies serialized JSON for explicit ::jsonb
// parameters. postgres.js serializes JSON itself, so decode that envelope once.
// Never parse ordinary text parameters or strings nested inside a JSON payload.
export function postgresAdapter(tx) {
  return {
    query: async (text, args = []) => {
      const jsonIndexes = new Set([...text.matchAll(/\$(\d+)\s*::\s*jsonb\b/gi)].map(m => Number(m[1]) - 1));
      const parameters = args.map((value, index) => jsonIndexes.has(index)
        ? tx.json(typeof value === 'string' ? JSON.parse(value) : value)
        : value);
      return { rows: await tx.unsafe(text, parameters) };
    },
    exec: text => tx.unsafe(text),
    transaction: fn => tx.savepoint(child => fn(postgresAdapter(child))),
  };
}

export function assertIndependentReadback(writer, reader) {
  assert.equal(writer.transactionEnded, true, 'Writer transaction must have ended');
  assert.equal(writer.closed, true, 'Writer logical client must be closed');
  assert.ok(reader && reader !== writer.client, 'Readback requires a new logical client');
  // Backend PID deliberately has no acceptance role behind a pooler.
  return { independentLogicalClient: true, backendPidAcceptanceRole: 'INFORMATIONAL_ONLY' };
}
