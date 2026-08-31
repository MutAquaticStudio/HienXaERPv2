import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

const axePath = fileURLToPath(
  new URL("../../node_modules/axe-core/axe.min.js", import.meta.url),
);

interface AxeViolation {
  id: string;
  impact: string | null;
  help: string;
  nodes: unknown[];
}

async function seriousAxeViolations(page: Page) {
  await page.addScriptTag({ path: axePath });
  const violations = await page.evaluate(async () => {
    const axe = (
      window as typeof window & {
        axe: { run: () => Promise<{ violations: AxeViolation[] }> };
      }
    ).axe;
    return (await axe.run()).violations;
  });
  return violations.filter(
    (violation) =>
      violation.impact === "serious" || violation.impact === "critical",
  );
}

test("office shell matches the P1 accessible foundation", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/app");

  await expect(page.getByRole("heading", { name: "Chào buổi sáng" })).toBeVisible();
  await expect(page.getByText("Hệ thống an toàn", { exact: true })).toBeVisible();
  await expect(page.getByText("Dữ liệu được bảo vệ", { exact: true })).toBeVisible();
  await expect(page.getByText("Sẵn sàng vận hành", { exact: true })).toBeVisible();
  await expect(seriousAxeViolations(page)).resolves.toEqual([]);

  await page.screenshot({
    path: "docs/evidence/p1-office-implemented.png",
    fullPage: true,
  });
});

test("worker shell is usable at 375px with large text and touch targets", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/work");

  await expect(page.getByRole("heading", { name: "Việc của tôi" })).toBeVisible();
  const reload = page.getByRole("button", { name: "TẢI LẠI" });
  const reloadBox = await reload.boundingBox();
  expect(reloadBox?.height).toBeGreaterThanOrEqual(56);

  const navLinks = page.locator(".worker-nav a");
  for (let index = 0; index < (await navLinks.count()); index += 1) {
    const box = await navLinks.nth(index).boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(48);
  }

  await page.screenshot({
    path: "docs/evidence/p1-worker-implemented.png",
    fullPage: true,
  });

  const before = await page.locator("html").evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).fontSize),
  );
  await page.getByRole("button", { name: "Bật chế độ chữ lớn" }).click();
  const after = await page.locator("html").evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).fontSize),
  );
  expect(after).toBeGreaterThan(before);

  await expect(seriousAxeViolations(page)).resolves.toEqual([]);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    )
    .toBe(true);

});

test("login is keyboard-usable and a worker is denied direct Finance access", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/login");

  await page.screenshot({
    path: "docs/evidence/p1-login-implemented.png",
    fullPage: true,
  });

  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Số điện thoại hoặc email")).toBeFocused();
  const focusedFieldShadow = await page
    .locator(".input-wrap")
    .first()
    .evaluate((element) => getComputedStyle(element).boxShadow);
  expect(focusedFieldShadow).not.toBe("none");

  await page.getByLabel("Số điện thoại hoặc email").fill("worker@example.test");
  await page.getByLabel("Mật khẩu").fill("mat-khau-thu-nghiem");
  const loginButton = page.getByRole("button", { name: "ĐĂNG NHẬP" });
  expect((await loginButton.boundingBox())?.height).toBeGreaterThanOrEqual(56);
  await loginButton.click();
  await expect(page).toHaveURL(/\/work$/);

  const financeResponse = await page.request.get("/api/finance/summary");
  expect(financeResponse.status()).toBe(403);
  await page.goto("/app");
  await expect(
    page.getByRole("heading", { name: "Không được phép truy cập" }),
  ).toBeVisible();
});
