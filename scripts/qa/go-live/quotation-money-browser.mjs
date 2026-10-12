import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { stockFixture } from "../remediation/native-fixture.mjs";
import { browserQA } from "./browser-kit.mjs";
const b = await browserQA("G02_QUOTATION_MONEY_EXACT_TRANSPORT_ADMIN_CUSTOMER"), { qa, d, report: r, origin } = b;
try {
  if (!r.documents.quote) {
    const created = await qa.sql.begin(async tx => {
      const s = await stockFixture(tx, qa, "1", { prepareOnly: true, unitPriceVnd: "9007199254740993" });
      const quote = await qa.rpc(tx, "create_quote_draft", [d.branch, d.customer, d.site, "2099-01-01T00:00:00Z", "QA tiền lớn có nguồn, không ghi sổ", [{ ...s.common, unit_price_vnd: "9007199254740993", pricing_rule_id: s.price, pricing_rule_version: 1, price_source_type: "LIST" }], randomUUID()], d.personas.sales.subject);
      const [q] = await tx`select current_revision_id from public.quotations where id=${quote}`;
      await qa.rpc(tx, "send_quote_revision", [q.current_revision_id, randomUUID()], d.personas.sales.subject);
      return { quote, revision: q.current_revision_id, material: s.material, po: s.po };
    }); Object.assign(r.documents, created); await b.save();
  }
  const sales = await b.login("sales"), customer = await b.login("finance", "customer");
  const [fact] = await qa.sql`select total_vnd::text amount from public.quotation_revisions where id=${r.documents.revision}`; assert.equal(fact.amount, "9007199254740993");
  const surfaces = [];
  for (const [role, p, path] of [["sales", sales, "/admin/quotations/"], ["customer-finance", customer, "/customer/quotations/"]]) {
    await p.goto(origin + path + r.documents.quote);
    await p.getByText("QA tiền lớn có nguồn, không ghi sổ", { exact: false }).waitFor();
    const body = await p.locator("body").innerText();
    surfaces.push({ role, exactExpectedShown: body.includes("9.007.199.254.740.993"), roundedValueShown: body.includes("9.007.199.254.740.992") });
  }
  r.source = fact; r.surfaces = surfaces;
  if (b.args.phase === "before") {
    assert.ok(surfaces.every(s => s.roundedValueShown));
    r.status = "REPRODUCED_QUOTATION_ONE_DONG_JSON_TRANSPORT_LOSS"; await b.save();
    console.log(JSON.stringify({ status: r.status, surfaces, posting: "NONE" }));
  } else {
    assert.ok(surfaces.every(s => s.exactExpectedShown && !s.roundedValueShown));
    await b.record("EXACT_QUOTATION_AMOUNT_ADMIN_AND_OWN_CUSTOMER_AFTER_RELOAD", { source: fact.amount, surfaces }); await b.finish();
  }
} catch (e) { r.status = "FAIL"; r.error = e.message.split("\n")[0]; await b.debug(); await b.save(); throw e; }
finally { await b.close(); }
