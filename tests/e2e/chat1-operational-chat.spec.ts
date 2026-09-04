import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "./fixtures";

const axePath = fileURLToPath(new URL("../../node_modules/axe-core/axe.min.js", import.meta.url));

async function seriousAxeViolations(page: Page) {
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async () => {
    const axe = (window as typeof window & { axe: { run: () => Promise<{ violations: Array<{ impact: string | null }> }> } }).axe;
    return (await axe.run()).violations.filter((item) => item.impact === "serious" || item.impact === "critical");
  });
}

test("CHAT1 worker chat is mobile-safe, server-confirmed, and never a Delivery command", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/work");
  const chat = page.getByRole("region", { name: "Trao đổi vận hành" });
  await expect(chat).toBeVisible();
  await expect(chat.getByRole("article", { name: "Hội thoại Chuyến giao DLV-2026-000013" })).toBeVisible();
  const composer = chat.locator(".chat-composer").first();
  await composer.getByLabel("Nội dung trao đổi").fill("Tôi đã đến điểm giao và cần điều phối xác nhận lối vào.");
  await composer.getByRole("button", { name: "GỬI TIN NHẮN" }).click();
  await expect(composer.getByText(/ĐÃ GỬI — tin nhắn đã được ghi nhận/)).toBeVisible();
  await expect(composer.getByText(/không thay đổi báo giá, giao hàng hoặc thanh toán/)).toBeVisible();
  const controls = chat.locator("button, textarea, select");
  let visible = 0;
  for (let index = 0; index < await controls.count(); index += 1) {
    const control = controls.nth(index);
    if (!await control.isVisible()) continue;
    visible += 1;
    expect((await control.boundingBox())?.height).toBeGreaterThanOrEqual(48);
  }
  expect(visible).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await expect(seriousAxeViolations(page)).resolves.toEqual([]);
});

test("CHAT1 customer chat is context-safe and does not reveal an employee directory", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/customer/orders");
  const chat = page.getByRole("region", { name: "Trao đổi vận hành" });
  await expect(chat).toBeVisible();
  await expect(chat.getByText("Nhân viên phụ trách", { exact: true })).toBeVisible();
  await expect(chat.getByText("Tài xế Trần Văn Nam")).toHaveCount(0);
  const deliveryOpen = chat.getByRole("button", { name: "NHẮN NHÂN VIÊN PHỤ TRÁCH" }).first();
  expect((await deliveryOpen.boundingBox())?.height).toBeGreaterThanOrEqual(48);
  await deliveryOpen.click();
  await expect(chat.getByText(/Đã mở hội thoại theo đúng ngữ cảnh/)).toBeVisible();
  await expect(chat.getByText(/không thay nút xác nhận nghiệp vụ/).first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
