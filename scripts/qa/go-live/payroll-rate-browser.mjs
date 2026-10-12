import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { browserQA } from "./browser-kit.mjs";
const b = await browserQA("T37_RULE_RATE_REJECTION_AND_EXACT_STORAGE_SERVER_ACTION_BROWSER"), { qa, d, report: r, origin } = b;
r.documents.code ??= "GRT" + randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase(); await b.save();
try {
  const owner = await b.login("owner");
  for (const rate of ["NaN", "1.0000001", "1.123456"]) {
    if (r.checks.some(c => c.facts.input === rate)) continue;
    await owner.goto(origin + "/admin/compensation"); await owner.getByText("Tạo phiên bản quy tắc", { exact: true }).click();
    const f = owner.locator("form").filter({ has: owner.getByRole("button", { name: "Tạo phiên bản quy tắc mới", exact: true }) });
    await f.locator("input[name=code]").fill(r.documents.code); await f.locator("input[name=name]").fill("QA mức tính chính xác");
    await f.locator("select[name=earningType]").selectOption("BONUS"); await f.locator("select[name=employeeId]").selectOption(d.personas.worker.employee);
    await f.locator("input[name=rate]").fill(rate);
    const intent = await f.locator("input[name=operationId]").inputValue();
    await f.getByRole("button", { name: "Tạo phiên bản quy tắc mới", exact: true }).click();
    if (rate !== "1.123456") {
      await owner.getByText(/^Mức tính phải là số dương chính xác/).waitFor();
      const [effects] = await qa.sql`select (select count(*)::int from public.compensation_rules where branch_id=${d.branch} and code=${r.documents.code}) rules,(select count(*)::int from public.command_receipts where operation_id=${intent}) receipts,(select count(*)::int from public.audit_events where trace_id=${intent}) audits`;
      assert.deepEqual(effects, { rules: 0, receipts: 0, audits: 0 }); await b.record("INVALID_RATE_UI_SERVER_REJECTS_WITHOUT_EFFECT", { input: rate, effects });
    } else {
      await b.wait(async () => !!(await qa.sql`select id from public.compensation_rules where branch_id=${d.branch} and code=${r.documents.code}`)[0]);
      const [rule] = await qa.sql`select id,rate_vnd_per_unit::text rate,(select count(*)::int from public.audit_events where trace_id=${intent}) audits from public.compensation_rules where branch_id=${d.branch} and code=${r.documents.code}`;
      assert.equal(rule.rate, rate); assert.equal(rule.audits, 1); r.documents.rule = rule.id; await b.record("EXACT_RATE_UI_DB_READBACK_WITH_ATOMIC_AUDIT", { input: rate, rule });
    }
  }
  await b.shot(owner, "exact-compensation-rate"); await b.finish();
} catch (e) { r.status = "FAIL"; r.error = e.message; await b.debug(); await b.save(); throw e; }
finally { await b.close(); }
