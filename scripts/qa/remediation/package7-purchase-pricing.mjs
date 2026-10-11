import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { argumentsForRun, openQA, rejected, stockFixture } from "./native-fixture.mjs";
const args = argumentsForRun(), qa = await openQA(args), { sql, rpc, fixtures: f } = qa;
const rollback = new Error("ROLLBACK_PURCHASE_PRIORITY");
const report = { scope: "G04_PURCHASE_SERVER_VERSION_PRIORITY_FROZEN_DRAFT_COST", database: args.database, productionAccess: "NONE", managedAuthTested: false, checks: [] };
try {
  try {
    await sql.begin(async tx => {
      const s = await stockFixture(tx, qa, "1");
      const line = { ...s.common, quantity: "1", unit_cost_vnd: "150000", purchase_price_rule_id: s.cost, purchase_price_rule_version: 1, price_source_type: "CONTRACT" };
      const saved = await rpc(tx, "create_purchase_order_draft", [f.branch, f.supplier, f.warehouse, null, "Giá mua đã lưu", [line], randomUUID()]);
      const [savedLine] = await tx`select id from public.purchase_order_lines where purchase_order_id=${saved}`;
      await tx.unsafe("set local role postgres");
      const preferred = randomUUID();
      await tx`insert into public.purchase_price_rules(id,branch_id,supplier_id,material_id,purchase_uom_id,unit_cost_vnd,version,source_type,effective_from,created_by)
        values(${preferred},${f.branch},${f.supplier},${s.material},${s.uom},160000,2,'CONTRACT','2020-01-01',${f.owner})`;
      await rejected(tx, sp => rpc(sp, "create_purchase_order_draft", [f.branch, f.supplier, f.warehouse, null, "Không dùng bản giá thấp", [line], randomUUID()]), "purchase_price_priority_mismatch", "22023");
      const chosen = { ...line, unit_cost_vnd: "160000", purchase_price_rule_id: preferred, purchase_price_rule_version: 2 };
      const newer = await rpc(tx, "create_purchase_order_draft", [f.branch, f.supplier, f.warehouse, null, "Giá mua server ưu tiên", [chosen], randomUUID()]);
      const update = [saved, 1, null, "Thay lượng giữ giá mua đã ghi", [{ ...line, source_line_id: savedLine.id, quantity: "2" }], randomUUID()];
      assert.equal(await rpc(tx, "update_purchase_order_draft", update), saved); assert.equal(await rpc(tx, "update_purchase_order_draft", update), saved);
      await tx.unsafe("set local role postgres");
      const [old] = await tx`select unit_cost_vnd::text cost,line_total_cost_vnd::text total from public.purchase_order_lines where purchase_order_id=${saved}`;
      const [current] = await tx`select unit_cost_vnd::text cost,line_total_cost_vnd::text total from public.purchase_order_lines where purchase_order_id=${newer}`;
      assert.deepEqual(old, { cost: "150000", total: "300000" }); assert.deepEqual(current, { cost: "160000", total: "160000" });
      report.checks.push({ name: "NEW_PURCHASE_USES_HIGHER_VERSION_SAVED_DRAFT_RETAINS150K_PRICE_RETRY_ONCE", status: "PASS", old, current });
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  report.status = "PASS_PURCHASE_PRICE_AUTHORITY_AND_SNAPSHOT"; report.rolledBack = true;
  await writeFile(args.out, JSON.stringify(report, null, 2)); console.log(JSON.stringify({ status: report.status, checks: report.checks.length }));
} finally { await sql.end({ timeout: 3 }); }
