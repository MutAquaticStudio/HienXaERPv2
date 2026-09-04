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

test("GPS1 worker tracking is explicit, foreground-only, and mobile-safe", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"], { origin: "http://127.0.0.1:3100" });
  await context.setGeolocation({ latitude: 21.1714382, longitude: 106.0697221, accuracy: 18 });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/work");
  const tracker = page.getByRole("region", { name: "Chia sẻ vị trí chuyến giao" });
  await expect(tracker).toBeVisible();
  await expect(tracker.getByText(/chỉ dùng vị trí khi trình duyệt này đang mở/)).toBeVisible();
  const start = tracker.getByRole("button", { name: "CHO PHÉP VỊ TRÍ VÀ BẮT ĐẦU" });
  expect((await start.boundingBox())?.height).toBeGreaterThanOrEqual(56);
  await start.click();
  await expect(tracker.getByText("ĐANG CHIA SẺ VỊ TRÍ")).toBeVisible();
  await expect(tracker.getByText("Đã gửi vị trí cho điều phối. Vị trí này không thay đổi trạng thái chuyến giao.")).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await expect(seriousAxeViolations(page)).resolves.toEqual([]);
});

test("GPS1 exposes the fleet only to dispatch and keeps customer tracking privacy-safe", async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 960 });
  await page.goto("/app/dispatch");
  const fleet = page.getByRole("region", { name: "Bản đồ xe đang giao" });
  await expect(fleet).toBeVisible();
  await expect(fleet.getByText("XE-02 · 29H-678.90")).toBeVisible();
  await expect(fleet.getByText("Đang có tín hiệu")).toBeVisible();
  await expect(fleet.getByText("ETA ước tính")).toBeVisible();
  await expect(fleet.getByText("21.1714382, 106.0697221")).toBeVisible();
  await expect(seriousAxeViolations(page)).resolves.toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/customer/orders");
  await expect(page.getByText("Tiến độ giao hàng").first()).toBeVisible();
  await expect(page.getByText("21.1714382, 106.0697221")).toHaveCount(0);
  await expect(page.getByText("Theo dõi theo trạng thái giao hàng đã được ghi nhận.").first()).toBeVisible();
  await expect(page.getByText("Dự kiến đến: chuyến đã hoàn tất giao hàng.").first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await expect(seriousAxeViolations(page)).resolves.toEqual([]);
});
