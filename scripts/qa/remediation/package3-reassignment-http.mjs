import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { argumentsForRun, openQA } from "./native-fixture.mjs";
import { realQAAuth } from "./auth.mjs";
const args = argumentsForRun(), qa = await openQA(args);
const docs = JSON.parse(await readFile(args.documents, "utf8")).documents;
const auth = await realQAAuth(args["auth-env"], {warehouse: "hxqa-warehouse-dispatch@example.test",owner: "hxqa-owner@example.test",worker: "hxqa-worker@example.test"});
const noAccessAuth = auth;
const report = {scope:"REAL_AUTHENTICATED_REASSIGNMENT_WORK_LIFECYCLE",database:args.database,checks:[],productionAccess:"NONE",tokensRecorded:false};
try {
  const [work] = await qa.sql`select id,version from public.work_items where delivery_id=${docs.reassign.delivery}`;
  if (work) {
    const start = { target_work_item_id: work.id, expected_version: work.version, operation_id: randomUUID() };
    const oldActor = await noAccessAuth.api("worker", "rpc/start_work_item", start);
    assert.equal(oldActor.status, 403);
    assert.equal((await auth.api("owner", "rpc/start_work_item", start)).status, 200);
    const [state] = await qa.sql`select d.version,w.version work_version,a.assignment_version
      from public.deliveries d join public.work_items w on w.delivery_id=d.id
      join public.delivery_assignments a on a.delivery_id=d.id and a.superseded_at is null where d.id=${docs.reassign.delivery}`;
    const loading = await auth.api("warehouse", "rpc/handoff_delivery_actual", { target_delivery_id: docs.reassign.delivery,
      expected_version: state.version, handed_off_at: new Date().toISOString(), operation_id: randomUUID(),
      loaded_lines: [{ delivery_line_id: docs.reassign.line, loaded_base_quantity: "14" }] });
    assert.equal(loading.status, 200);
    const resultPayload = { target_work_item_id: work.id, result_lines: [{ delivery_line_id: docs.reassign.line, actual_base_quantity: "14" }],
      receiver_name: "Người nhận QA", note: "", target_evidence_id: null, missing_arrival_reason: "Ghi nhận lúc mạng yếu",
      expected_work_version: state.work_version, expected_delivery_version: state.version + 1,
      expected_assignment_version: state.assignment_version, operation_id: randomUUID() };
    assert.equal((await noAccessAuth.api("worker", "rpc/submit_portal_delivery_result", resultPayload)).status, 403);
    const newActor = await auth.api("owner", "rpc/submit_portal_delivery_result", resultPayload);
    assert.equal(newActor.status, 200);
    assert.equal((await auth.api("owner", "rpc/submit_portal_delivery_result", resultPayload)).data, newActor.data);
    const [resultFacts] = await qa.sql`select d.execution_state,w.execution_state work_state,
      (select count(*)::int from public.delivery_results where delivery_id=d.id) results
      from public.deliveries d join public.work_items w on w.delivery_id=d.id where d.id=${docs.reassign.delivery}`;
    assert.deepEqual(resultFacts, { execution_state: "RESULT_SUBMITTED", work_state: "DONE", results: 1 });
    report.checks.push({ name: "G06_REAL_AUTH_OLD_ACTOR_REVOKED_NEW_ACTOR_START_AND_SUBMIT", status: "PASS",
      oldActorDenied: 403, newActor: auth.accounts.owner.subject, resultFacts });
  } else {
    report.checks.push({ name: "G06_REAL_AUTH_OLD_ACTOR_REVOKED_NEW_ACTOR_START_AND_SUBMIT", status: "NOT_RUN", reason: "Run Browser publish/reassign first" });
  }
  assert.ok(report.checks.every(c => c.status === "PASS"));
  report.status = "PASS_EXECUTED_AUTHENTICATED_REASSIGNMENT";
  await writeFile(args.out, JSON.stringify(report,null,2));
  console.log(JSON.stringify({status:report.status,checks:report.checks.length}));
} catch(error) {
  await writeFile(args.out.replace(/\.json$/, "-failure.json"),JSON.stringify({...report,status:"FAIL",error:error.message},null,2));
  throw error;
} finally {await qa.sql.end({timeout:3});}
