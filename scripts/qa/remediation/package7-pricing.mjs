import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { argumentsForRun, openQA, rejected, stockFixture } from "./native-fixture.mjs";
const args = argumentsForRun(), qa = await openQA(args), { sql, rpc, fixtures: f } = qa;
const p = JSON.parse(await readFile(args.personas, "utf8")).personas;
const rollback = new Error("ROLLBACK_SERVER_PRICING");
const report = { scope: "G04_SERVER_PRICE_PRIORITY_SNAPSHOT_OVERRIDE_PERMISSION", database: args.database, productionAccess: "NONE", managedAuthTested: false, checks: [] };
try {
  try {
    await sql.begin(async tx => {
      const s = await stockFixture(tx, qa, "1");
      const line = { ...s.common, quantity: "1", unit_price_vnd: "230000", pricing_rule_id: s.price, pricing_rule_version: 1, price_source_type: "LIST" };
      const old = await rpc(tx, "create_sales_order_draft", [f.branch, s.customer, s.site, null, "Giá cũ đã ghi trước rulemới", [line], randomUUID()]);
      await rpc(tx, "confirm_sales_order", [old, randomUUID()]);
      const draft = await rpc(tx, "create_sales_order_draft", [f.branch, s.customer, s.site, null, "Giá đã lưu trên bản nháp", [line], randomUUID()]);
      const [draftLine] = await tx`select id from public.sales_order_lines where sales_order_id=${draft}`;
      const expires = new Date(Date.now() + 7 * 86400000).toISOString();
      const quote = await rpc(tx, "create_quote_draft", [f.branch, s.customer, s.site, expires, "Giá đã lưu trên báo giá", [line], randomUUID()]);
      const [quoteLine] = await tx`select l.id,r.id revision from public.quotation_lines l join public.quotation_revisions r on r.id=l.revision_id join public.quotations q on q.id=r.quotation_id where q.id=${quote}`;
      await tx.unsafe("set local role postgres");
      const preferred = randomUUID();
      await tx`insert into public.pricing_rules(id,branch_id,scope_type,customer_id,material_id,price_uom_id,unit_price_vnd,version,source_type,effective_from,created_by)
        values(${preferred},${f.branch},'CUSTOMER_MATERIAL',${s.customer},${s.material},${s.uom},260000,1,'CONTRACT','2020-01-01',${f.owner})`;
      const defaultInputs = [f.branch, s.customer, s.site, null, "Giả mạo ruleưu tiên thấp", [line], randomUUID()];
      if (args.phase === "before") {
        const id = await rpc(tx, "create_sales_order_draft", defaultInputs, p.sales.subject);
        const [fact] = await tx`select unit_price_vnd::text price,pricing_rule_id rule from public.sales_order_lines where sales_order_id=${id}`;
        assert.equal(fact.price, "230000"); assert.equal(fact.rule, s.price);
        report.checks.push({ name: "VALID_DEFAULT_RULE_BYPASSES_CUSTOMER_PRIORITY_AT_DB", reproduced: true, fact });
      } else {
        await rejected(tx, sp => rpc(sp, "create_sales_order_draft", defaultInputs, p.sales.subject), "pricing_rule_priority_mismatch", "22023");
        await rejected(tx, sp => rpc(sp, "create_quote_draft", [...defaultInputs.slice(0, 6), randomUUID()], p.sales.subject), "pricing_rule_priority_mismatch", "22023");
        const selected = { ...line, unit_price_vnd: "260000", pricing_rule_id: preferred, price_source_type: "CONTRACT" };
        const validInputs = [f.branch, s.customer, s.site, null, "Chọn ruleưu tiên server", [selected], randomUUID()];
        const id = await rpc(tx, "create_sales_order_draft", validInputs, p.sales.subject); assert.equal(await rpc(tx, "create_sales_order_draft", validInputs, p.sales.subject), id);
        const [fact] = await tx`select unit_price_vnd::text price,line_total_vnd::text total,pricing_rule_id rule from public.sales_order_lines where sales_order_id=${id}`;
        assert.deepEqual(fact, { price: "260000", total: "260000", rule: preferred });
        await rejected(tx, sp => rpc(sp, "create_sales_order_draft", [f.branch, s.customer, s.site, null, "Khônggiả nguồn giá", [{ ...selected, price_source_type: "LIST" }], randomUUID()], p.sales.subject), "pricing_source_snapshot_mismatch", "22023");
        const manual = { ...line, pricing_rule_id: null, pricing_rule_version: null, price_source_type: "MANUAL_APPROVED", override_reason: "Giá riêng có phê duyệt của Owner" };
        await rejected(tx, sp => rpc(sp, "create_sales_order_draft", [f.branch, s.customer, s.site, null, "Saleskhông override", [manual], randomUUID()], p.sales.subject), "manual_price_requires_permission_and_reason", "42501");
        await rejected(tx, sp => rpc(sp, "create_sales_order_draft", [f.branch, s.customer, s.site, null, "Ownerphải nêu lýdo", [{ ...manual, override_reason: "" }], randomUUID()]), "manual_price_requires_permission_and_reason", "42501");
        const overrideInputs = [f.branch, s.customer, s.site, null, "Giá riêng được duyệt", [manual], randomUUID()];
        const override = await rpc(tx, "create_sales_order_draft", overrideInputs); assert.equal(await rpc(tx, "create_sales_order_draft", overrideInputs), override);
        await tx.unsafe("set local role postgres");
        const [overridden] = await tx`select unit_price_vnd::text price,override_by actor,override_reason reason,
          (select count(*)::int from public.audit_events where trace_id=${overrideInputs[6]}) audits from public.sales_order_lines where sales_order_id=${override}`;
        assert.equal(overridden.price, "230000"); assert.equal(overridden.actor, f.owner); assert.equal(overridden.reason, manual.override_reason); assert.equal(overridden.audits, 1);
        const [preserved] = await tx`select unit_price_vnd::text price,line_total_vnd::text total,pricing_rule_id rule from public.sales_order_lines where sales_order_id=${old}`;
        assert.deepEqual(preserved, { price: "230000", total: "230000", rule: s.price });
        report.checks.push({ name: "LOWER_PRIORITY_DENIED_CURRENT_RULE_VALID_SOURCE_TYPE_EXACT", status: "PASS", fact });
        report.checks.push({ name: "MANUAL_OVERRIDE_REQUIRES_ACTOR_PERMISSION_REASON_HISTORY_RETRY_AND_OLD_FACTS_PRESERVED", status: "PASS", overridden, preserved });
        const changed = [{ ...line, source_line_id: draftLine.id, quantity: "2" }], update = [draft, 1, null, "Giữ giá đã ghi, thay lượng", changed, randomUUID()];
        assert.equal(await rpc(tx, "update_sales_order_draft", update, p.sales.subject), draft);
        assert.equal(await rpc(tx, "update_sales_order_draft", update, p.sales.subject), draft);
        const quoteUpdate = [quoteLine.revision, 1, expires, "Giữ giá báo giá đã ghi", [{ ...line, source_line_id: quoteLine.id, quantity: "2" }], randomUUID()];
        await rpc(tx, "update_quote_draft", quoteUpdate, p.sales.subject); await rpc(tx, "update_quote_draft", quoteUpdate, p.sales.subject);
        await tx.unsafe("set local role postgres");
        const [saved] = await tx`select unit_price_vnd::text price,line_total_vnd::text total,quantity::text quantity from public.sales_order_lines where sales_order_id=${draft}`;
        assert.deepEqual(saved, { price: "230000", total: "460000", quantity: "2.000000" });
        const [savedQuote] = await tx`select unit_price_vnd::text price,line_total_vnd::text total from public.quotation_lines where revision_id=${quoteLine.revision}`;
        assert.deepEqual(savedQuote, { price: "230000", total: "460000" });
        const forged = [{ ...line, source_line_id: draftLine.id }];
        await rejected(tx, sp => rpc(sp, "create_sales_order_draft", [f.branch, s.customer, s.site, null, "Khôngmượn snapshot từ chứngtừ khác", forged, randomUUID()], p.sales.subject), "pricing_rule_priority_mismatch", "22023");
        report.checks.push({ name: "SAVED_ORDER_QUOTE_PRICE_REUSED_WITH_SOURCE_ID_QTY_RECALCULATED_NO_FOREIGN_SNAPSHOT_BYPASS", status: "PASS", saved, savedQuote });
      }
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  report.status = args.phase === "before" ? "REPRODUCED_SERVER_PRIORITY_BYPASS" : "PASS_SERVER_PRICE_PRIORITY_AND_OVERRIDE"; report.rolledBack = true;
  await writeFile(args.out, JSON.stringify(report, null, 2)); console.log(JSON.stringify({ status: report.status, checks: report.checks.length }));
} finally { await sql.end({ timeout: 3 }); }
