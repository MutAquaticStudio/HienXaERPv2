#!/usr/bin/env node
// Browser QA for the KiotViet feedback batch (FB-KIOTVIET-20261015, matrix in KE_HOACH_FEEDBACK_KIOTVIET_20261015.md §3.2).
// Drives a LOCAL app started with the QA project env; never Production. Read-only unless --writes is passed.
//
//   node scripts/qa/feedback-20261015/feedback-browser.mjs --env .env.qa.local [--origin http://127.0.0.1:3112]
//     [--out /var/tmp/hx-fb-qa] [--only B06,B11] [--writes --customer "<tìm khách>" --material "<mã vật tư>"]
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { email, percentiles } from "../core.mjs";
import { assertLocalOrigin, daySpan, DEFAULT_ORIGIN, loadQaEnv, parseArgs, parseVnd, sumVnd } from "./support.mjs";

const args = parseArgs(process.argv.slice(2));
const { env } = await loadQaEnv(args.env);
const origin = assertLocalOrigin(args.origin ?? DEFAULT_ORIGIN);
const out = args.out ?? "/var/tmp/hx-fb-qa";
const VIEWPORTS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };
const report = { batch: "FB-KIOTVIET-20261015", startedAt: new Date().toISOString(), origin, qaProject: env.HX_QA_PROJECT_REF, productionAccess: "NONE",
  writes: args.writes, source: { commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), dirty: Boolean(execFileSync("git", ["status", "--porcelain", "--", "src", "supabase/migrations"], { encoding: "utf8" }).trim()) },
  cases: [], pageErrors: [] };
await mkdir(out, { recursive: true });
const save = () => writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
const browser = await chromium.launch({ headless: true, executablePath: process.env.HX_QA_CHROMIUM ?? undefined });

async function login(role, { surface = "admin", viewport = VIEWPORTS.desktop } = {}) {
  const context = await browser.newContext({ viewport, locale: "vi-VN", timezoneId: "Asia/Ho_Chi_Minh" });
  const page = await context.newPage();
  page.on("pageerror", (error) => report.pageErrors.push({ role, url: page.url(), message: error.message }));
  await page.goto(origin + (surface === "admin" ? "/login" : `/${surface}/login`));
  await page.getByLabel("Thư điện tử").fill(email(role));
  await page.getByLabel("Mật khẩu", { exact: true }).fill(env.HX_QA_PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  // Each role lands on its own start page (e.g. a worker goes to /work), so accept anything past the login form.
  await page.waitForURL((url) => !url.pathname.endsWith("/login") && url.pathname !== "/");
  if (new URL(page.url()).pathname === "/select-branch") {
    const branch = page.getByLabel("Chi nhánh đang hoạt động");
    if (args.branch) await branch.selectOption(args.branch);
    await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
    await page.waitForURL((url) => url.pathname !== "/select-branch" && url.pathname !== "/");
  }
  return page;
}
const shot = (page, name) => page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
const dateOffset = (days) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(Date.now() + days * 86400000));

/** Chart table (Kỳ | Thu | Chi | Lợi nhuận) as cell texts. */
async function chartTable(page) {
  const chart = page.locator("[data-uat-dashboard-chart]");
  await chart.waitFor();
  const details = chart.locator("details", { hasText: "Xem bảng số liệu" });
  if (await details.getAttribute("open") === null) await details.locator("summary").click();
  return details.locator("tbody tr").evaluateAll((rows) => rows.map((row) => [...row.querySelectorAll("td")].map((cell) => cell.textContent.trim())));
}
const kpi = (page, label) => page.locator(".finance-metrics .metric-card", { has: page.locator(".metric-label", { hasText: new RegExp(`^${label}$`) }) }).locator(".metric-value").innerText();

const CASES = {
  // Bộ lọc tự áp dụng; URL giữ trạng thái; "Đang làm việc"/"Đã hủy"/"Tất cả".
  async B06() {
    const page = await login("owner");
    await page.goto(origin + "/admin/orders");
    assert.equal(await page.getByRole("button", { name: "Áp dụng" }).count(), 0, "Không còn nút Áp dụng");
    const state = page.getByLabel("Trạng thái đơn");
    const options = await state.locator("option").allInnerTexts();
    assert.ok(options.includes("Đang làm việc") && options.includes("Đã hủy") && options.includes("Tất cả"));
    assert.ok(!options.some((text) => /trừ đã h[uủ]y/i.test(text)), "Không còn chữ 'trừ đã hủy'");
    await state.selectOption("ALL");
    await page.waitForURL((url) => url.searchParams.get("state") === "ALL");
    await page.getByLabel("Tìm kiếm").fill(args.orderQuery ?? "DH");
    await page.waitForURL((url) => url.searchParams.has("q") && url.searchParams.get("state") === "ALL");
    const filtered = page.url();
    await page.reload();
    assert.equal(page.url(), filtered, "Tải lại giữ bộ lọc");
    await shot(page, "B06-orders-filtered");
    return { options, filtered: new URL(filtered).search };
  },
  // Bấm tên khách (không chỉ mã) mở chi tiết.
  async B07() {
    const page = await login("owner");
    await page.goto(origin + "/admin/customers");
    const name = page.locator("table.row-link-table tbody tr").first().locator(".row-title a");
    const label = await name.innerText();
    await name.click();
    await page.waitForURL(/\/admin\/customers\/[0-9a-f-]{36}$/);
    await shot(page, "B07-customer-detail");
    return { opened: label };
  },
  // Đổi bộ lọc → KPI và biểu đồ đổi cùng; tổng biểu đồ = KPI khi READY.
  async B08() {
    const page = await login("owner");
    const results = [];
    for (const [from, to] of [[dateOffset(-14), dateOffset(1)], [dateOffset(-90), dateOffset(1)]]) {
      await page.goto(`${origin}/admin?from=${dateOffset(-3)}&to=${dateOffset(1)}`);
      await page.getByLabel("Từ ngày").fill(from);
      await page.waitForURL((url) => url.searchParams.get("from") === from);
      await page.getByLabel("Đến trước ngày").fill(to);
      await page.waitForURL((url) => url.searchParams.get("to") === to);
      const rows = await chartTable(page);
      const days = daySpan(from, to);
      const expected = days <= 31 ? days : days <= 217 ? Math.ceil(days / 7) : null;
      if (expected !== null) assert.ok(rows.length <= expected && rows.length >= expected - 1, `Số điểm biểu đồ ${rows.length} khớp kỳ ${days} ngày`);
      const kpiProfit = parseVnd(await kpi(page, "Lợi nhuận ròng"));
      const chartProfit = sumVnd(rows.map((row) => row[3]));
      if (kpiProfit !== null && chartProfit !== null) assert.equal(chartProfit, kpiProfit, "Tổng Lợi nhuận trên biểu đồ = KPI Lợi nhuận ròng");
      results.push({ from, to, points: rows.length, kpiProfit: kpiProfit?.toString() ?? "NOT_READY", chartProfit: chartProfit?.toString() ?? "HAS_GAPS" });
      await shot(page, `B08-dashboard-${days}d`);
    }
    return { results };
  },
  // Báo giá tắt ở nội bộ và cổng khách.
  async B11() {
    const page = await login("owner");
    await page.goto(origin + "/admin");
    assert.equal(await page.getByRole("link", { name: "Báo giá", exact: true }).count(), 0, "Menu không còn Báo giá");
    assert.equal((await page.goto(origin + "/admin/quotations")).status(), 404);
    assert.equal((await page.goto(origin + "/admin/quotations/new")).status(), 404);
    const customer = await login(args.customerRole ?? "receiver", { surface: "customer" });
    assert.equal(await customer.getByRole("link", { name: "Báo giá", exact: true }).count(), 0, "Cổng khách không còn Báo giá");
    assert.equal((await customer.goto(origin + "/customer/quotations")).status(), 404);
    return { internal: 404, portal: 404 };
  },
  // Cột giá/giá vốn/tồn theo quyền: ghi lại ma trận để đối chiếu vai trò (không tự suy ra quyền).
  async B12() {
    const matrix = {};
    // hxqa-finance is a customer-portal account; the internal finance role is hxqa-finance-employee.
    for (const role of (args.roles ?? "owner,sales,purchasing,warehouse-dispatch,finance-employee,worker").split(",")) {
      const page = await login(role.trim());
      const response = await page.goto(origin + "/admin/products");
      const landed = new URL(page.url()).pathname;
      matrix[role] = response.status() === 200 && landed === "/admin/products"
        ? await page.locator("table thead th").allInnerTexts()
        : `HTTP ${response.status()} → ${landed}`;
      for (const [name, viewport] of Object.entries(VIEWPORTS)) { await page.setViewportSize(viewport); await shot(page, `B12-products-${role}-${name}`); }
    }
    return { status: "RECORDED_FOR_REVIEW", matrix };
  },
  // p95 Tổng quan kỳ 12 tháng (SPEC-PERF-002: nội dung hữu ích < 2 giây).
  async B14() {
    const page = await login("owner");
    const url = `${origin}/admin?from=${dateOffset(-365)}&to=${dateOffset(1)}`;
    const samples = [];
    for (let i = 0; i < 21; i++) {
      const started = performance.now();
      await page.goto(url, { waitUntil: "commit" });
      await page.locator("[data-uat-dashboard-chart]").waitFor();
      if (i > 0) samples.push(performance.now() - started);
    }
    const { p95 } = percentiles(samples.map((ms) => ({ ms, ok: true })));
    assert.ok(p95 < 2000, `p95 ${Math.round(p95)}ms vượt 2 giây`);
    return { samples: samples.map(Math.round), p95: Math.round(p95), note: "Đo từ máy chạy script tới app local trỏ QA; ghi kèm cấu hình máy và mạng khi báo cáo" };
  },
  // Tạo đơn bán 1 dòng chỉ bằng bàn phím (ghi QA data).
  async B01() {
    assert.ok(args.writes && args.customer && args.material, "B01 cần --writes --customer --material");
    // "Tạo đơn" only shows with orders.confirm; pass --order-role owner when the QA sales account cannot confirm.
    const page = await login(args.orderRole ?? args["order-role"] ?? "sales");
    await page.goto(origin + "/admin/orders/new");
    const steps = [];
    const options = (name) => page.getByRole("listbox", { name, exact: true }).getByRole("option").first();
    await page.getByRole("combobox", { name: "Khách hàng", exact: true }).fill(args.customer); await options("Khách hàng").waitFor();
    await page.keyboard.press("Enter"); steps.push("Chọn khách");
    // SPEC-JOURNEY-003: the site is never auto-selected, but its box takes focus with the list open.
    const site = await page.getByRole("combobox", { name: "Công trình / điểm giao", exact: true }).elementHandle();
    await page.waitForFunction((node) => node === document.activeElement, site);
    assert.equal(await site.inputValue(), "", "Không tự chọn công trình");
    await options("Công trình / điểm giao").waitFor(); await page.keyboard.press("Enter"); steps.push("Chọn công trình");
    await page.keyboard.press("F3"); await page.keyboard.type(args.material); await options("Kết quả tìm vật tư").waitFor();
    await page.keyboard.press("Enter"); steps.push("Thêm vật tư");
    await page.getByLabel("Số lượng dòng 1").fill(args.quantity ?? "2"); steps.push("Nhập số lượng");
    const create = page.getByRole("button", { name: "Tạo đơn", exact: true });
    await create.and(page.locator(":enabled")).waitFor({ timeout: 15000 });
    await shot(page, "B01-order-ready");
    await create.click(); steps.push("Tạo đơn");
    await page.waitForURL(/\/admin\/orders\/[0-9a-f-]{36}\?notice=confirmed/, { timeout: 20000 });
    assert.ok(steps.length <= 5, `Số bước ${steps.length} > 5`);
    await shot(page, "B01-order-confirmed");
    return { steps, order: new URL(page.url()).pathname };
  },
  // Giá hàng loạt +10% → lưu; người thứ hai với dữ liệu cũ bị từ chối, không ghi một phần (ghi QA data).
  async B13() {
    assert.ok(args.writes && args.material, "B13 cần --writes --material");
    const url = `${origin}/admin/products/pricing?q=${encodeURIComponent(args.material)}`;
    const first = await login("owner"), second = await login("owner");
    await Promise.all([first.goto(url), second.goto(url)]);
    const row = first.locator(".price-book-table tbody tr").first();
    const name = (await row.locator(".price-book-name strong").innerText()).trim();
    const before = await row.locator('td[data-label="Giá hiện tại"]').innerText();
    assert.notEqual(parseVnd(before), null, "B13 cần vật tư đã có giá chung hiện hành");
    await first.getByLabel(`Chọn ${name}`).check();
    await first.getByLabel("Phần trăm (âm để giảm)").fill("10");
    await first.getByRole("button", { name: "Áp dụng cho dòng đã chọn" }).click();
    const proposed = await first.getByLabel(`Giá mới ${name}`).inputValue();
    await first.getByLabel("Lý do thay đổi *").fill("QA-FB-B13 tăng 10%");
    await first.getByRole("button", { name: /Lưu bảng giá/ }).click();
    await first.locator(".price-book-save [role=status]", { hasText: "Đã lưu" }).waitFor();
    await first.reload();
    const after = await first.locator(".price-book-table tbody tr").first().locator('td[data-label="Giá hiện tại"]').innerText();
    assert.equal(parseVnd(after), parseVnd(proposed), "Giá hiện tại = giá mới đã lưu");
    await second.getByLabel(`Giá mới ${name}`).fill("1000");
    await second.getByLabel("Lý do thay đổi *").fill("QA-FB-B13 dữ liệu cũ");
    await second.getByRole("button", { name: /Lưu bảng giá/ }).click();
    await second.locator(".price-book-save [role=status]", { hasText: "chưa có giá nào được lưu" }).waitFor();
    await second.reload();
    assert.equal(parseVnd(await second.locator(".price-book-table tbody tr").first().locator('td[data-label="Giá hiện tại"]').innerText()), parseVnd(proposed), "Lần lưu cũ không ghi gì");
    await shot(first, "B13-price-book-saved");
    return { material: name, before, saved: proposed };
  },
};

const selected = args.cases.length ? args.cases : Object.keys(CASES).filter((key) => args.writes || !["B01", "B13"].includes(key));
try {
  for (const key of selected) {
    const run = CASES[key];
    if (!run) { report.cases.push({ case: `QA-FB-${key}`, status: "MANUAL_ONLY" }); continue; }
    const startedAt = new Date().toISOString();
    try {
      const facts = await run();
      report.cases.push({ case: `QA-FB-${key}`, status: facts?.status ?? "PASS", startedAt, facts });
    } catch (error) {
      report.cases.push({ case: `QA-FB-${key}`, status: "FAIL", startedAt, error: error.message });
    }
    await save();
    console.log(JSON.stringify(report.cases.at(-1)));
  }
} finally {
  report.completedAt = new Date().toISOString();
  report.status = report.pageErrors.length || report.cases.some((item) => item.status === "FAIL") ? "FAIL" : "PASS";
  await save();
  await browser.close();
}
process.exitCode = report.status === "PASS" ? 0 : 1;
