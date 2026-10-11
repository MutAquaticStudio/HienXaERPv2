import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { argumentsForRun, openQA, stockFixture } from "./native-fixture.mjs";
const args = argumentsForRun(), qa = await openQA(args), { sql, rpc, fixtures: f } = qa;
const rollback = new Error("ROLLBACK_HOUR_BASIS");
const report = { scope: "G02_DERIVED_HOUR_STORAGE_AND_PRICING_SAME_QUANTITY", database: args.database, productionAccess: "NONE",
  managedAuthTested: false, controlledClockFixture: "Synthetic work timestamps set before immutable result/log creation; no historic logged facts changed" };
try {
  try {
    await sql.begin(async tx => {
      const s = await stockFixture(tx, qa, "1");
      const [employee] = await tx`select id from public.employees where auth_user_id=${f.owner}`;
      const job = await rpc(tx, "create_service_job", [f.branch, s.customer, s.site, "Dịch vụ giờ QA", "Nguồn thời gian để kiểm tra lượng tính tiền", "2099-04-01T08:00:00Z", "2099-04-01T12:00:00Z", "1", "giờ", employee.id, null, null, randomUUID()]);
      const work = await rpc(tx, "publish_work_item", [f.branch, "SERVICE_JOB", job, "DIRECT", employee.id, randomUUID()]);
      const [w] = await tx`select version from public.work_items where id=${work}`;
      await rpc(tx, "start_work_item", [work, w.version, randomUUID()]);
      await tx.unsafe("set local role postgres");
      await tx`update public.work_items set created_at=now()-interval '15 minutes',started_at=now()-interval '12 minutes 30 seconds' where id=${work}`;
      const [started] = await tx`select version from public.work_items where id=${work}`;
      await rpc(tx, "submit_work_result", [work, "1", "Đã thực hiện dịch vụ QA", "QA", null, started.version, randomUUID()]);
      const [versions] = await tx`select j.version job,w.version work from public.service_jobs j join public.work_items w on w.service_job_id=j.id where j.id=${job}`;
      const v = await rpc(tx, "verify_service_job", [job, "1", "1", "100000", "2026-10-11", "Căn cứ thời gian QA", versions.job, versions.work, randomUUID()]);
      const rule = await rpc(tx, "create_compensation_rule", [f.branch, s.prefix + "_HOUR", "Giá giờ QA2m", employee.id,
        "PER_HOUR", "FIXED_PER_BASIS", "2000000", null, "OPEX", "2020-01-01", null, randomUUID()]);
      const op = randomUUID(), event = await rpc(tx, "calculate_earning_event", [rule, "SERVICE_VERIFICATION", v, op]);
      await tx.unsafe("set local role postgres");
      const [fact] = await tx`select basis_quantity::text quantity,calculated_amount_vnd::text amount,
        round(basis_quantity*rate_vnd_per_unit_snapshot)::text expected,(select count(*)::int from public.audit_events where trace_id=${op}) audits from public.earning_events where id=${event}`;
      assert.equal(fact.quantity, "0.208333"); assert.equal(fact.expected, "416666");
      if (args.phase === "before") { assert.equal(fact.amount, "416667"); report.status = "REPRODUCED_HOUR_AMOUNT_DIFFERS_FROM_STORED_QUANTITY"; }
      else { assert.equal(fact.amount, "416666"); assert.equal(fact.audits, 1); assert.equal(await rpc(tx, "calculate_earning_event", [rule, "SERVICE_VERIFICATION", v, op]), event); report.status = "PASS_HOUR_BASIS_NORMALIZED_BEFORE_PRICE"; }
      report.fact = fact;
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  report.rolledBack = true;
  await writeFile(args.out, JSON.stringify(report, null, 2)); console.log(JSON.stringify({ status: report.status, fact: report.fact }));
} finally { await sql.end({ timeout: 3 }); }
