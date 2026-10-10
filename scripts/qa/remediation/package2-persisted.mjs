import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { argumentsForRun, openQA, stockFixture } from "./native-fixture.mjs";
const args = argumentsForRun();
const qa = await openQA(args);
try {
  const documents = await qa.sql.begin(async (tx) => {
    const stock = await stockFixture(tx, qa);
    const account = await qa.rpc(tx, "create_finance_account", [qa.fixtures.branch, stock.prefix + "_CASH", "Quỹ kiểm thử phục hồi", "CASH", randomUUID()]);
    return { customer: stock.customer, account, branch: qa.fixtures.branch, material: stock.material };
  });
  await writeFile(args.out, JSON.stringify({ scope: "COMMITTED_SYNTHETIC_FIXTURE", documents, productionAccess: "NONE" }, null, 2));
  console.log(JSON.stringify({ committedSyntheticFixture: true }));
} finally { await qa.sql.end({ timeout: 3 }); }
