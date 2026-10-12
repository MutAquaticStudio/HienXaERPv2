import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { argumentsForRun, openQA, stockFixture } from "./native-fixture.mjs";
import { realQAAuth } from "./auth.mjs";
const args = argumentsForRun(), qa = await openQA(args), { sql, rpc, fixtures: f } = qa;
const p = JSON.parse(await readFile(args.personas, "utf8")).personas;
const auth = await realQAAuth(args["auth-env"], { sales: "hxqa-sales@example.test" });
assert.equal(auth.accounts.sales.subject, p.sales.subject);
const report = { scope: "G04_REAL_SALES_AUTH_SERVER_PRIORITY_AND_SAVED_PRICE_RETRY", database: args.database, productionAccess: "NONE", managedQaBusinessWrites: 0, tokensRecorded: false, checks: [] };
let observer;
try {
  const d = await sql.begin(async tx => {
    const s = await stockFixture(tx, qa, "1");
    const line = { ...s.common, quantity: "1", unit_price_vnd: "230000", pricing_rule_id: s.price, pricing_rule_version: 1, price_source_type: "LIST" };
    const saved = await rpc(tx, "create_sales_order_draft", [f.branch, s.customer, s.site, null, "Giá đã lưu để kiểm traUI", [line], randomUUID()], p.sales.subject);
    const [savedLine] = await tx`select id from public.sales_order_lines where sales_order_id=${saved}`;
    await tx.unsafe("set local role postgres");
    const preferred = randomUUID();
    await tx`insert into public.pricing_rules(id,branch_id,scope_type,customer_id,material_id,price_uom_id,unit_price_vnd,version,source_type,effective_from,created_by)
      values(${preferred},${f.branch},'CUSTOMER_MATERIAL',${s.customer},${s.material},${s.uom},260000,1,'CONTRACT','2020-01-01',${f.owner})`;
    const [{ pid }] = await tx`select pg_backend_pid() pid`;
    return { stock: s, branch: f.branch, saved, savedLine: savedLine.id, preferred, line, writerPid: pid };
  });
  report.documents = d;
  await writeFile(args.out.replace(/\.json$/, "-sources.json"), JSON.stringify({ documents: d, productionAccess: "NONE" }, null, 2));
  const create = line => ({ target_branch_id: f.branch, target_customer_id: d.stock.customer, target_site_id: d.stock.site,
    requested_delivery_at: null, commercial_terms: "Sales thật kiểm tra nguồn giá", order_lines: [line], operation_id: randomUUID() });
  const lower = await auth.api("sales", "rpc/create_sales_order_draft", create(d.line)); assert.equal(lower.status, 400); assert.equal(lower.data.message, "pricing_rule_priority_mismatch");
  const manual = await auth.api("sales", "rpc/create_sales_order_draft", create({ ...d.line, pricing_rule_id: null, pricing_rule_version: null, price_source_type: "MANUAL_APPROVED", override_reason: "Không thể tự phê duyệt giá" }));
  assert.equal(manual.status, 403);
  const valid = await auth.api("sales", "rpc/create_sales_order_draft", create({ ...d.line, unit_price_vnd: "260000", pricing_rule_id: d.preferred, price_source_type: "CONTRACT" })); assert.equal(valid.status, 200);
  const update = { target_order_id: d.saved, expected_version: 1, requested_delivery_at: null, commercial_terms: "Giữ giá230k thay lượng2",
    order_lines: [{ ...d.line, source_line_id: d.savedLine, quantity: "2" }], operation_id: randomUUID() };
  const updated = await auth.api("sales", "rpc/update_sales_order_draft", update); assert.equal(updated.status, 200, JSON.stringify(updated.data));
  const retried = await auth.api("sales", "rpc/update_sales_order_draft", update); assert.equal(retried.status, 200); assert.equal(retried.data, updated.data);
  observer = await openQA(args);
  const [{ pid: readerPid }] = await observer.sql`select pg_backend_pid() pid`; assert.notEqual(readerPid, d.writerPid);
  const [saved] = await observer.sql`select quantity::text qty,unit_price_vnd::text price,line_total_vnd::text total from public.sales_order_lines where sales_order_id=${d.saved}`;
  assert.deepEqual(saved, { qty: "2.000000", price: "230000", total: "460000" });
  const [newer] = await observer.sql`select unit_price_vnd::text price from public.sales_order_lines where sales_order_id=${valid.data}`; assert.equal(newer.price, "260000");
  const [audit] = await observer.sql`select count(*)::int n from public.audit_events where trace_id=${update.operation_id}`; assert.equal(audit.n, 1);
  report.checks.push({ name: "REAL_SALES_LOW_PRIORITY400_MANUAL403_CURRENT260K_VALID", status: "PASS", lowerStatus: lower.status, manualStatus: manual.status, newer });
  report.checks.push({ name: "REAL_SALES_SAVED230K_QTY2_RETRY_ONE_UPDATE_AND_AUDIT", status: "PASS", saved, audit });
  report.status = "PASS_REAL_AUTH_PRICE_PRIORITY_AND_SNAPSHOT"; report.readerPid = readerPid;
  await writeFile(args.out, JSON.stringify(report, null, 2)); console.log(JSON.stringify({ status: report.status, checks: report.checks.length }));
} catch (error) {
  await writeFile(args.out.replace(/\.json$/, "-failure.json"), JSON.stringify({ ...report, status: "FAIL", error: error.message }, null, 2)); throw error;
} finally { if (observer) await observer.sql.end({ timeout: 3 }); await sql.end({ timeout: 3 }); }
