import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "./fixtures";

const axePath = fileURLToPath(
  new URL("../../node_modules/axe-core/axe.min.js", import.meta.url),
);

async function seriousAxeViolations(page: Page) {
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async () => {
    const axe = (window as typeof window & {
      axe: { run: () => Promise<{ violations: Array<{ impact: string | null }> }> };
    }).axe;
    return (await axe.run()).violations.filter(
      (item) => item.impact === "serious" || item.impact === "critical",
    );
  });
}

async function expectVisibleControlsAtLeast(page: Page, selector: string, minimum: number) {
  const controls = page.locator(selector);
  let visible = 0;
  for (let index = 0; index < await controls.count(); index += 1) {
    const control = controls.nth(index);
    if (!await control.isVisible()) continue;
    visible += 1;
    expect((await control.boundingBox())?.height).toBeGreaterThanOrEqual(minimum);
  }
  expect(visible).toBeGreaterThan(0);
}

test("WP1 protects work-pool commercial details and keeps a failed incident recoverable", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/work/pool");
  await expect(page.getByRole("heading", { name: "Bể công việc" })).toBeVisible();
  await expect(page.getByText("Giao đá 1×2 đến KCN VSIP")).toBeVisible();
  await expect(page.getByText("Nhà thầu An Phú")).toHaveCount(0);
  await expect(page.getByText("Khu công nghiệp VSIP Bắc Ninh")).toHaveCount(0);

  await page.goto("/work");
  const issue = page.locator(".worker-issue-details").first();
  await issue.locator("summary").click();
  await issue.getByLabel("Loại sự cố").selectOption("WRONG_ADDRESS");
  await issue.getByLabel("Mô tả sự cố").fill("ngắn");
  await issue.getByRole("button", { name: "GỬI SỰ CỐ" }).click();
  await expect(issue.getByText("Mô tả sự cố cần ít nhất 10 ký tự.")).toBeVisible();
  await expect(issue).toHaveAttribute("open", "");
  await expect(issue.getByLabel("Mô tả sự cố")).toHaveValue("ngắn");
  await expect(page.getByText("Số thực tế: chờ điều phối xác nhận").first()).toBeVisible();
  await expect(page.getByText("CHƯA GỬI").first()).toBeVisible();
  await expectVisibleControlsAtLeast(
    page,
    ".worker-issue-form button, .worker-issue-form select, .worker-issue-form textarea, .driver-delivery-workspace button, .driver-delivery-workspace input, .driver-delivery-workspace select",
    56,
  );
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await expect(seriousAxeViolations(page)).resolves.toEqual([]);
});
