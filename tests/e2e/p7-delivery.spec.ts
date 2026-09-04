import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

const axePath = fileURLToPath(new URL("../../node_modules/axe-core/axe.min.js", import.meta.url));
interface AxeViolation { impact: string | null }
async function seriousAxeViolations(page: Page) {
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async () => {
    const axe = (window as typeof window & { axe: { run: () => Promise<{ violations: AxeViolation[] }> } }).axe;
    return (await axe.run()).violations.filter((item) => item.impact === "serious" || item.impact === "critical");
  });
}

test("P7 dispatcher board exposes assignment, routes and warehouse handoff", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/app/dispatch");
  await expect(page).toHaveTitle(/Điều phối giao hàng/);
  await expect(page.getByRole("heading", { name: "Điều phối giao hàng" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Luồng chuyến giao" })).toBeVisible();
  await expect(page.getByText("DLV-2026-000014", { exact: true })).toBeVisible();
  await expect(page.getByText(/Kho Hiền Xã.*KĐT Đông Ngàn/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Bàn giao & xuất phát" }).first()).toBeVisible();
  await expect(seriousAxeViolations(page)).resolves.toEqual([]);
  await page.screenshot({ path: "docs/evidence/p7-dispatch-delivery-implemented.png", fullPage: true });
});

test("P7 driver flow is card-based and usable at 375px", async ({ page }) => {
  await page.context().grantPermissions(["geolocation"], {
    origin: "http://127.0.0.1:3100",
  });
  await page.context().setGeolocation({ latitude: 21.1212345, longitude: 105.9587654 });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/work");
  await expect(page.getByRole("heading", { name: "Việc của tôi" })).toBeVisible();
  await expect(page.getByText("DLV-2026-000014", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "ĐÃ LẤY HÀNG" })).toBeVisible();
  await expect(page.getByRole("button", { name: "ĐÃ GIAO HÀNG" })).toBeVisible();
  await page.getByRole("button", { name: "ĐÃ LẤY HÀNG" }).click();
  await expect(page.getByText("Đã cập nhật chuyến giao.")).toBeVisible();
  await page.getByRole("button", { name: "LƯU VỊ TRÍ HIỆN TẠI" }).first().click();
  await expect(page.getByText("Đã lưu bằng chứng.")).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await expect(seriousAxeViolations(page)).resolves.toEqual([]);
  await page.screenshot({ path: "docs/evidence/p7-driver-proof-mobile-implemented.png", fullPage: true });
});

test("driver remains blocked from office finance and margin", async ({ page }) => {
  await page.context().addCookies([{ name: "hx-synthetic-role", value: "worker", domain: "127.0.0.1", path: "/" }]);
  await page.goto("/app/finance");
  await expect(page.getByRole("heading", { name: "Không được phép truy cập" })).toBeVisible();
  const response = await page.request.get("/api/finance/summary");
  expect(response.status()).toBe(403);
  await expect(response.json()).resolves.toEqual({ error: "ACCESS_DENIED" });
});
