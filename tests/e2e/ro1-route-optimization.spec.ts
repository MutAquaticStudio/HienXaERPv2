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

test("RO1 dispatcher creates a guarded recommendation and exposes explicit P7 apply", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/app/dispatch");
  await expect(page.getByRole("heading", { name: "Tối ưu lộ trình giao hàng" })).toBeVisible();
  await expect(page.getByText(/POOL_CLAIM.*không nhận việc hộ/)).toBeVisible();
  const create = page.locator(".route-plan-create");
  await create.locator('select[name="vehicleId"]').selectOption("71000000-0000-4000-8000-000000000001");
  await create.locator('select[name="driverUserId"]').selectOption("00000000-0000-4000-8000-000000000002");
  await create.getByRole("button", { name: "Tạo đề xuất lộ trình" }).click();
  await expect(create.getByText("Đã lưu đề xuất. Delivery chưa bị thay đổi; hãy kiểm tra cảnh báo trước khi duyệt.")).toBeVisible();
  const draft = page.locator(".route-plan-card").filter({ hasText: "RTE-2026-000001" });
  await draft.locator("summary").filter({ hasText: "Duyệt đề xuất" }).click();
  await draft.getByRole("button", { name: "Duyệt đề xuất" }).click();
  await expect(draft.getByText("Đã duyệt đề xuất lộ trình. Chuyến giao vẫn chưa được phân công.")).toBeVisible();
  const approved = page.locator(".route-plan-card").filter({ hasText: "RTE-2026-000002" });
  await approved.locator("summary").filter({ hasText: "Áp dụng lộ trình bằng P7" }).click();
  await expect(approved.getByRole("checkbox", { name: /Tôi hiểu thao tác/ })).toBeVisible();
  await expect(seriousAxeViolations(page)).resolves.toEqual([]);
});

test("RO1 driver sees only an approved route and remains mobile-safe", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/work");
  await expect(page.getByRole("heading", { name: "Chuyến hôm nay" })).toBeVisible();
  const todayRoute = page.getByLabel("Chuyến hôm nay");
  await expect(todayRoute.getByText("Đông Ngàn, Từ Sơn, Bắc Ninh", { exact: true })).toBeVisible();
  await expect(todayRoute.getByText("Khu công nghiệp VSIP Bắc Ninh", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await expect(seriousAxeViolations(page)).resolves.toEqual([]);
});
