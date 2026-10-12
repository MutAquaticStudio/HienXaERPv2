import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { browserQA } from "./browser-kit.mjs";
const b = await browserQA("REPORT_FILTERS_VOUCHER_DELIVERY_QUOTE_PDF_REAL_AUTH_AND_SOURCE_VALUES"), { qa, d, report: r, origin } = b;
const standard = JSON.parse(await readFile("reports/go-live-acceptance/BROWSER_SOURCE_FLOW176.json", "utf8")).documents;
const quote = JSON.parse(await readFile("reports/go-live-acceptance/QUOTATION_MONEY183.json", "utf8")).documents;
const payroll = JSON.parse(await readFile("reports/go-live-acceptance/PAYROLL_BROWSER180.json", "utf8")).documents;
const dir = "/Users/nox/Downloads/HienXaERP-GoLive-Private-20261012/pdf-qa185"; await mkdir(dir, { recursive: true });
const python = "/Users/nox/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";
async function pdf(page, route, file, expected) {
  const response = await page.request.get(origin + route); assert.equal(response.status(), 200, route);
  assert.match(response.headers()["content-type"], /application\/pdf/); const bytes = await response.body();
  assert.equal(bytes.subarray(0, 5).toString(), "%PDF-"); await writeFile(dir + "/" + file, bytes);
  const read = spawnSync(python, ["-c", "import pdfplumber,sys,json; p=pdfplumber.open(sys.argv[1]); print(json.dumps({'pages':len(p.pages),'text':'\\n'.join(x.extract_text() or '' for x in p.pages)},ensure_ascii=False))", dir + "/" + file], { encoding: "utf8" });
  assert.equal(read.status, 0); const data = JSON.parse(read.stdout);
  for (const text of expected) assert.ok(data.text.includes(text), file + " missing " + text);
  await b.record("PDF_SOURCE_CONTENT_AND_PARSE_" + file, { route, pages: data.pages, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), expectedText: expected });
}
try {
  const sales = await b.login("sales"), finance = await b.login("finance-employee"), worker = await b.login("worker", "work"), customer = await b.login("finance", "customer"), receiver = await b.login("receiver", "customer"), other = await b.login("other_customer", "customer");
  await pdf(sales, `/api/quotation-revisions/${quote.revision}/pdf`, "quote-exact.pdf", ["9.007.199.254.740.993", "BÁO GIÁ"]);
  await pdf(customer, `/api/quotation-revisions/${quote.revision}/pdf`, "customer-quote-exact.pdf", ["9.007.199.254.740.993"]);
  await pdf(finance, `/api/payments/${payroll.payment}/voucher/pdf`, "payroll-voucher.pdf", ["23.457"]);
  await pdf(sales, `/api/deliveries/${standard.delivery}/note/pdf`, "delivery15-14-13.pdf", ["15 m³", "14 m³", "13 m³", "không phải hóa đơn"]);
  const cases = [[other, `/api/quotation-revisions/${quote.revision}/pdf`], [worker, `/api/payments/${payroll.payment}/voucher/pdf`], [receiver, `/api/customers/${d.customer}/debt-statement/pdf`]];
  for (const [p, url] of cases) { const response = await p.request.get(origin + url); assert.ok([403,404].includes(response.status()), url); await b.record("PDF_WRONG_ROLE_OR_CUSTOMER_DENIED", { url, status: response.status() }); }
  for (const [name, query, expected] of [
    ["AR_STANDARD_CUSTOMER_CURRENT", { report: "receivables", customer: d.customer, asOf: "2026-10-12", cutoff: new Date().toISOString() }, null],
    ["AR_STANDARD_CUSTOMER_PRIOR_ASOF", { report: "receivables", customer: d.customer, asOf: "2020-01-01", cutoff: new Date().toISOString() }, "0"],
    ["AR_KNOWLEDGE_CUTOFF_BEFORE_NEW_SOURCES", { report: "receivables", customer: d.customer, asOf: "2026-10-12", cutoff: "2020-01-01T00:00:00Z" }, "0"],
    ["OPEX_PERIOD_BEFORE_NEW_SOURCE", { report: "expenses", from: "2020-01-01", to: "2020-02-01", activity: "ADMIN" }, "0"],
  ]) {
    const params = new URLSearchParams(query), response = await finance.request.get(origin + "/api/reports/export?" + params); assert.equal(response.status(), 200);
    const csv = await response.text(), total = csv.match(/"total_vnd","(-?\d*)"/)?.[1]; assert.notEqual(total, undefined);
    if (expected !== null) assert.equal(total, expected);
    else {
      const [sum] = await qa.sql`select coalesce(sum(private.current_receivable_outstanding(ar.id)),0)::text value from public.receivable_obligations ar where customer_id=${d.customer}`;
      assert.equal(total, sum.value);
    }
    await b.record("REPORT_FILTER_" + name, { total, expected, source: "Independent current obligations or boundary before any source exists" });
  }
  const denied = await worker.request.get(origin + "/api/reports/export?report=payables"); assert.equal(denied.status(), 403);
  await b.record("REPORT_WORKER_CANNOT_EXPORT_AP", { http: denied.status() }); await b.finish();
} catch (e) { r.status = "FAIL"; r.error = e.message.split("\n")[0]; await b.debug(); await b.save(); throw e; }
finally { await b.close(); }
