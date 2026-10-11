import assert from "node:assert/strict";
import { writeFile, readFile } from "node:fs/promises";
import { argumentsForRun, openQA } from "./native-fixture.mjs";
import { paidReturnScenario, nextReceivableFromReturnedStock } from "./package4-return-fixture.mjs";
const args = argumentsForRun(), qa = await openQA(args);
const finance = JSON.parse(await readFile(args.personas, "utf8")).personas.finance.subject;
let observer;
try {
  const documents = await qa.sql.begin(async tx => {
    const [{ pid: writerPid }] = await tx`select pg_backend_pid() pid`;
    const refund = await paidReturnScenario(tx, qa, finance), offset = await paidReturnScenario(tx, qa, finance);
    offset.nextObligation = await nextReceivableFromReturnedStock(tx, qa, offset);
    return { refund, offset, branch: qa.fixtures.branch, writerPid };
  });
  observer = await openQA(args);
  const [{ pid: readerPid }] = await observer.sql`select pg_backend_pid() pid`;
  assert.notEqual(readerPid, documents.writerPid);
  const rows = await observer.sql`select id,state from public.return_cases where id in(${documents.refund.returnCase},${documents.offset.returnCase})`;
  assert.equal(rows.length, 2); assert.ok(rows.every(row => row.state === "RETURNED"));
  await writeFile(args.out, JSON.stringify({ scope: "G08_FRESH_COMMITTED_BROWSER_SOURCES", database: args.database,
    status: "PASS_PERSISTED_SETUP", documents, readerPid, sourceStates: rows, productionAccess: "NONE" }, null, 2));
  console.log(JSON.stringify({ status: "PASS_PERSISTED_SETUP", distinctReadbackConnection: true, sources: rows.length }));
} finally { if (observer) await observer.sql.end({ timeout: 3 }); await qa.sql.end({ timeout: 3 }); }
