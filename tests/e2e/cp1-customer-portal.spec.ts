import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

const axePath = fileURLToPath(new URL("../../node_modules/axe-core/axe.min.js", import.meta.url));

async function seriousAxeViolations(page: Page) {
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async () => {
    const axe = (window as typeof window & { axe: { run: () => Promise<{ violations: Array<{ impact: string | null }> }> } }).axe;
    return (await axe.run()).violations.filter((item) => item.impact === "serious" || item.impact === "critical");
  });
}

async function controlsAreLargeEnough(page: Page) {
  const controls = page.locator(".customer-command-form button, .customer-command-form input, .customer-command-form select, .customer-command-form textarea, .customer-nav a");
  let visible = 0;
  for (let index = 0; index < await controls.count(); index += 1) {
    const control = controls.nth(index);
    if (!await control.isVisible()) continue;
    visible += 1;
    expect((await control.boundingBox())?.height).toBeGreaterThanOrEqual(48);
  }
  expect(visible).toBeGreaterThan(0);
}

test("CP1 customer portal is mobile-safe and keeps invalid feedback recoverable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/customer");
  await expect(page.getByRole("heading", { name: "Công ty Xây dựng An Phát" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Điều hướng khách hàng" }).getByRole("link")).toHaveCount(4);
  await page.getByLabel("Số lượng").fill("0");
  await page.getByRole("button", { name: "Gửi yêu cầu" }).click();
  await expect(page.getByText("Số lượng phải lớn hơn 0.")).toBeVisible();
  await expect(page.getByLabel("Số lượng")).toHaveValue("0");
  await controlsAreLargeEnough(page);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  const base = await page.locator("html").evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  await page.getByRole("button", { name: "Bật chế độ chữ lớn" }).click();
  const large = await page.locator("html").evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(large).toBeGreaterThan(base);
  await expect(seriousAxeViolations(page)).resolves.toEqual([]);
});

test("CP1 keeps customer-safe orders, delivery actuals, and P8 debt projections separate", async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 960 });
  await page.goto("/customer/orders");
  await expect(page.getByRole("heading", { name: "Đơn hàng" })).toBeVisible();
  await expect(page.getByText("Kho thử")).toHaveCount(0);
  await expect(page.getByText("SO-2026-0042", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("30 / 30 m³")).toBeVisible();
  await page.goto("/customer/debt");
  await expect(page.getByRole("heading", { name: "Công nợ" })).toBeVisible();
  await expect(page.getByText("Số liệu chỉ đọc, lấy trực tiếp từ phải thu đã ghi nhận (P8).")).toBeVisible();
  await expect(page.getByText("Thông báo không tạo phiếu thu, phân bổ hoặc điều chỉnh công nợ.")).toBeVisible();
});
