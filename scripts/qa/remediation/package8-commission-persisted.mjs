import { readFile, writeFile } from "node:fs/promises";
import { argumentsForRun, openQA } from "./native-fixture.mjs";
import { commissionReviewScenario } from "./commission-review-fixture.mjs";
const args = argumentsForRun(), qa = await openQA(args);
const finance = JSON.parse(await readFile(args.personas, "utf8")).personas.finance.subject;
try {
 const documents = await qa.sql.begin(async tx => ({ recover: await commissionReviewScenario(tx, qa, finance), waive: await commissionReviewScenario(tx, qa, finance, false), branch: qa.fixtures.branch }));
 await writeFile(args.out, JSON.stringify({ scope: "COMMITTED_SYNTHETIC_LOCAL_COMMISSION_REVIEW_UI_FIXTURES", documents, productionAccess: "NONE", realAccountOrRulesChanged: false }, null, 2));
 console.log(JSON.stringify({ committedSyntheticFixtures: 2 }));
} finally { await qa.sql.end({ timeout: 3 }); }
