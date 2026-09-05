import { test, expect } from "./fixtures";

test("shows immediate feedback for a delayed module request and finishes navigation", async ({ page }) => {
  await page.goto("/app");
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(url => url.pathname === "/app/sales", async route => {
    await gate;
    await route.continue();
  });
  try {
    await page.getByRole("link", { name: "Bán hàng", exact: true }).click();
    await expect(page.getByRole("link", { name: /Bán hàng.*Đang mở/ })).toBeVisible();
  } finally {
    release();
  }
  await expect(page).toHaveURL(/\/app\/sales$/);
  await expect(page.getByRole("heading", { name: "Khách hàng & giá bán", exact: true })).toBeVisible();
});

test("switches server-selected tabs and retains working navigation on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/sales");
  await page.getByRole("tab", { name: "Giá bán", exact: true }).click();
  await expect(page).toHaveURL(/tab=pricing/);
  await expect(page.getByRole("tab", { name: "Giá bán", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Tín dụng", exact: true }).click();
  await expect(page).toHaveURL(/tab=credit/);
  await expect(page.getByRole("tabpanel")).toBeVisible();
  await page.getByRole("link", { name: "Dữ liệu", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Vật liệu, đơn vị và năng lực" })).toBeVisible();
  await page.getByRole("tab", { name: "Nhân sự & kỹ năng" }).click();
  await expect(page).toHaveURL(/tab=people/);
  await expect(page.getByRole("tabpanel")).toBeVisible();
  await page.getByRole("link", { name: "Mua & nguồn hàng", exact: true }).click();
  await page.getByRole("tab", { name: /Đơn mua/ }).click();
  await expect(page).toHaveURL(/tab=orders/);
  await expect(page.getByRole("tabpanel")).toBeVisible();
});
