import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { argumentsForRun, openQA } from "./native-fixture.mjs";
import { advanceScenario } from "./package4-fixture.mjs";
const args = argumentsForRun(), qa = await openQA(args);
const finance = JSON.parse(await readFile(args.personas, "utf8")).personas.finance.subject;
try {
  const documents = await qa.sql.begin(async tx => {
    const [{ pid }] = await tx`select pg_backend_pid() pid`;
    const docs = { branch: qa.fixtures.branch, writerPid: pid };
    for (const name of ["http", "browser", "race", "sameIntent"]) docs[name] = await advanceScenario(tx, qa, finance);
    return docs;
  });
  const reader = await openQA(args);
  try {
    const [{ pid }] = await reader.sql`select pg_backend_pid() pid`;
    assert.notEqual(pid, documents.writerPid);
    for (const name of ["http", "browser", "race", "sameIntent"]) {
      const doc = documents[name];
      const [facts] = await reader.sql`select private.current_receivable_outstanding(${doc.obligation})::text debt,
        private.payment_available(${doc.payment})::text available,private.advance_remaining(${doc.advance})::text advance`;
      assert.deepEqual(facts, { debt: "1000000", available: "1000000", advance: "1000000" });
    }
    await writeFile(args.out, JSON.stringify({ scope: "G07_COMMITTED_REAL_SOURCE_FIXTURES", database: args.database,
      status: "PASS_PERSISTED_SETUP", readerPid: pid, documents, productionAccess: "NONE" }, null, 2));
    console.log(JSON.stringify({ status: "PASS_PERSISTED_SETUP", independentReader: true, scenarios: 4 }));
  } finally { await reader.sql.end({ timeout: 3 }); }
} finally { await qa.sql.end({ timeout: 3 }); }
