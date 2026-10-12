import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { argumentsForRun, openQA, stockFixture, salesFixture, rejected } from "../remediation/native-fixture.mjs";
import { finishDirectPurchaseDraft } from "../../../src/modules/purchasing/finish-direct-draft.ts";
const a = argumentsForRun(), q = await openQA(a), d = JSON.parse(await readFile(a.documents, "utf8")).documents;
const checks = [], rollback = new Error("ROLLBACK_LOCAL_DELTA_SEAMS");
try {
  try { await q.sql.begin(async tx => {
    const local = { ...q, fixtures: d.fixtures }, s = await stockFixture(tx, local, "1", { prepareOnly: true });
    const count = await q.rpc(tx, "open_stock_count", [d.branch, d.fixtures.warehouse, s.cutoff, randomUUID()]);
    for (const value of ["NaN", "Infinity", "-Infinity", "-1", null]) {
      await rejected(tx, sp => q.rpc(sp, "record_stock_count_line", [count, s.material, value, null, "QA kiểm lượng không hữu hạn", null, 1, randomUUID()]), "invalid_stock_count_quantity", "22023");
    }
    await rejected(tx, sp => q.rpc(sp, "record_stock_count_line", [count, s.material, "0", "NaN", "QA vốn không hữu hạn", null, 1, randomUUID()]), "invalid_stock_count_cost", "22023");
    const zero = await q.rpc(tx, "record_stock_count_line", [count, s.material, "0", null, "QA xác nhận đếm vật lý bằng0", null, 1, randomUUID()]);
    const [stored] = await tx`select counted_base_quantity::text quantity from public.stock_count_lines where id=${zero}`;
    assert.equal(stored.quantity, "0.000000"); checks.push({ name: "LOCAL_FINITE_COUNT_RULE_AND_VALID_PHYSICAL_ZERO_PRESERVED", status: "PASS", rejectedValues: 6, quantity: stored.quantity });
    const sale = await salesFixture(tx, local, s, d.personas.sales.subject);
    const line = { ...s.common, quantity: "0.25", linked_sales_order_line_id: sale.line, unit_cost_vnd: "150000", purchase_price_rule_id: s.cost, purchase_price_rule_version: 1, price_source_type: "CONTRACT" };
    const primary = randomUUID(), base = [sale.so, d.fixtures.supplier, [line], null, primary];
    const po = await q.rpc(tx, "create_direct_purchase_from_sales_order", base, d.personas.purchasing.subject);
    assert.equal(await q.rpc(tx, "create_direct_purchase_from_sales_order", base, d.personas.purchasing.subject), po);
    const client = {
      from(table) {
        assert.ok(["purchase_order_line_read", "purchase_orders"].includes(table));
        const filters = new Map();
        const read = async () => {
          await q.actor(tx, d.personas.purchasing.subject);
          if (table === "purchase_order_line_read") return { data: await tx`select id,linked_sales_order_line_id from public.purchase_order_line_read where purchase_order_id=${filters.get("purchase_order_id")}`, error: null };
          return { data: (await tx`select draft_version,commercial_terms,expected_at::text from public.purchase_orders where id=${filters.get("id")} and branch_id=${filters.get("branch_id")}`)[0] ?? null, error: null };
        };
        const query = { select: () => query, eq: (name, value) => { filters.set(name, value); return query; }, maybeSingle: read, then: (resolve, reject) => read().then(resolve, reject) };
        return query;
      },
      async rpc(name, args) {
        assert.equal(name, "update_purchase_order_draft");
        try { return { data: await q.rpc(tx, name, [args.target_purchase_order_id, args.expected_version, args.expected_at, args.commercial_terms, args.purchase_lines, args.operation_id], d.personas.purchasing.subject), error: null }; }
        catch (error) { return { data: null, error: { message: error.message } }; }
      },
    };
    const input = { purchaseOrderId: po, branchId: d.branch, expectedAt: null, terms: "QA điều khoản nguồn được giữ", operationId: primary, lines: [line] };
    await finishDirectPurchaseDraft(client, input); await finishDirectPurchaseDraft(client, input);
    const [terms] = await tx`select draft_version,commercial_terms from public.purchase_orders where id=${po}`;
    assert.deepEqual(terms, { draft_version: 2, commercial_terms: input.terms });
    await tx.savepoint(async sp => {
      // Test the canonical payload conflict in a real database savepoint.
      const { directDraftTermsOperationId } = await import("../../../src/modules/purchasing/finish-direct-draft.ts");
      const [sourceLine] = await sp`select id from public.purchase_order_lines where purchase_order_id=${po}`;
      await rejected(sp, inner => q.rpc(inner, "update_purchase_order_draft", [po, 1, null, "Điều khoản khác", [{ ...line, source_line_id: sourceLine.id }], directDraftTermsOperationId(primary)], d.personas.purchasing.subject), "operation_payload_conflict", "23505");
    });
    const legacy = randomUUID();
    const legacyPo = await q.rpc(tx, "create_direct_purchase_from_sales_order", [sale.so, d.fixtures.supplier, [line], null, legacy], d.personas.purchasing.subject);
    assert.equal(await q.rpc(tx, "create_direct_purchase_from_sales_order", [sale.so, d.fixtures.supplier, [line], null, legacy], d.personas.purchasing.subject), legacyPo);
    await tx.unsafe("set local role postgres");
    const [signature] = await tx`select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='create_direct_purchase_from_sales_order'`;
    assert.equal(signature.n, 1);
    checks.push({ name: "DIRECT_PO_TERMS_SOURCE_IDENTITY_TWO_COMMANDS_RETRY_AND_FIVE_ARGUMENT_COMPATIBILITY", status: "PASS", terms, signatures: signature.n, changedIntentPayloadRejected: true });
    throw rollback;
  }); } catch (error) { if (error !== rollback) throw error; }
  await writeFile(a.out, JSON.stringify({ status: "PASS_NATIVE_LOCAL_DELTA_SEAMS", checkedAt: new Date().toISOString(), checks, rolledBack: true, helperAndRpcIntegrated: true, authHTTP: false, productionAccess: "NONE" }, null, 2));
  console.log(JSON.stringify({ status: "PASS", checks: checks.length, rolledBack: true }));
} finally { await q.sql.end({ timeout: 3 }); }
