import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { parseEnv } from "node:util";
import { chromium } from "@playwright/test";
import { argumentsForRun, openQA } from "./native-fixture.mjs";
const args = argumentsForRun();
const env = parseEnv(await readFile(args["auth-env"], "utf8"));
assert.equal(env.HX_QA_PROJECT_REF, "ffrwiglcrlumfvhubaxg");
const d = JSON.parse(await readFile(args.documents, "utf8")).documents;
const qa = await openQA(args);
await mkdir(args.screenshots, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const report = { scope: "REAL_BROWSER_RECEIPT_AND_DIRECT_FULFILLMENT_LOST_RESPONSE_AFTER_COMMIT", browserPlugin: "ABSENT", productionAccess: "NONE", checks: [] };
try {
  await page.goto("http://127.0.0.1:3110/login");
  await page.getByLabel("Thư điện tử").fill("hxqa-warehouse-dispatch@example.test");
  await page.getByLabel("Mật khẩu", { exact: true }).fill(env.HX_QA_PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.waitForURL((url) => /\/admin|\/select-branch/.test(url.pathname), { timeout: 30000 });
  if (page.url().includes("select-branch")) {
    await page.getByLabel("Chi nhánh đang hoạt động").selectOption(d.branch);
    await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
    await page.waitForURL(/\/admin/);
  }
  for (const [name, po, table, submit, notice] of [
    ["receipt", d.warehousePo, "purchase_receipts", "Xác nhận nhận hàng", "received"],
    ["direct", d.directPo, "supplier_fulfillments", "Xác minh NCC giao", "supplier-verified"],
  ]) {
    let aborted = false;
    await page.goto("http://127.0.0.1:3110/admin/purchase-orders/" + po);
    await page.locator('input[name="quantity"]').fill("15");
    await page.route("**/admin/purchase-orders/**", async (route) => {
      if (route.request().method() !== "POST" || aborted) return route.continue();
      const response = await route.fetch();
      const [fact] = await qa.sql.unsafe(`select count(*)::int n from public.${table} where purchase_order_id=$1`, [po]);
      if (fact.n === 1) { aborted = true; await route.abort("failed"); }
      else await route.fulfill({ response });
    });
    await page.getByRole("button", { name: submit, exact: true }).click();
    await page.getByText(/Phản hồi bị gián đoạn/).waitFor({ timeout: 30000 });
    assert.equal(aborted, true);
    await page.screenshot({ path: args.screenshots + "/g15-" + name + "-response-lost.png", fullPage: true });
    await page.unroute("**/admin/purchase-orders/**");
    await page.reload();
    await page.getByText(/Thao tác này đã được ghi nhận/).first().waitFor({ timeout: 30000 });
    const [facts] = await qa.sql.unsafe(`select (select count(*)::int from public.${table} where purchase_order_id=$1) effects,
      (select state from public.purchase_orders where id=$1) state`, [po]);
    assert.deepEqual(facts, { effects: 1, state: "CLOSED" });
    report.checks.push({ name: name.toUpperCase() + "_COMMIT_LOST_RESPONSE_RELOAD_ONE_EFFECT", status: "PASS", facts, expectedNotice: notice });
    await page.screenshot({ path: args.screenshots + "/g15-" + name + "-recovered.png", fullPage: true });
  }
  report.status = "PASS_EXECUTED_BROWSER_PURCHASE_RECOVERY_SCOPE";
  await writeFile(args.out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length }));
} catch (error) {
  await page.screenshot({ path: args.screenshots + "/g15-purchase-failure.png", fullPage: true });
  await writeFile(args.out.replace(/\.json$/, "-failure.json"), JSON.stringify({ url: page.url(), body: (await page.locator("body").innerText()).slice(0, 8000), error: error.message }, null, 2));
  throw error;
} finally { await browser.close(); await qa.sql.end({ timeout: 3 }); }
