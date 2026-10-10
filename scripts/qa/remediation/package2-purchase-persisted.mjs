import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { argumentsForRun, openQA, stockFixture, salesFixture } from "./native-fixture.mjs";
const args = argumentsForRun();
const qa = await openQA(args);
try {
  const documents = await qa.sql.begin(async (tx) => {
    const s = await stockFixture(tx, qa);
    const buy = { ...s.common, quantity: "15", unit_cost_vnd: "150000", purchase_price_rule_id: s.cost, purchase_price_rule_version: 1, price_source_type: "CONTRACT" };
    const warehousePo = await qa.rpc(tx, "create_purchase_order_draft", [qa.fixtures.branch, qa.fixtures.supplier, qa.fixtures.warehouse, null, "QA nhận hàng phục hồi", [buy], randomUUID()]);
    await qa.rpc(tx, "confirm_purchase_order", [warehousePo, randomUUID()]);
    const sale = await salesFixture(tx, qa, s);
    const directPo = await qa.rpc(tx, "create_direct_purchase_from_sales_line", [sale.line, qa.fixtures.supplier, "15", buy, null, randomUUID()]);
    await qa.rpc(tx, "confirm_purchase_order", [directPo, randomUUID()]);
    return { branch: qa.fixtures.branch, warehousePo, directPo, material: s.material };
  });
  await writeFile(args.out, JSON.stringify({ scope: "COMMITTED_SYNTHETIC_PO_RECOVERY_FIXTURE", documents, productionAccess: "NONE" }, null, 2));
  console.log(JSON.stringify({ committedSyntheticFixture: true }));
} finally { await qa.sql.end({ timeout: 3 }); }
