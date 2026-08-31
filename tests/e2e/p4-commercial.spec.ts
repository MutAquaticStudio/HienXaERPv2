import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

const axePath = fileURLToPath(
  new URL("../../node_modules/axe-core/axe.min.js", import.meta.url),
);

interface AxeViolation {
  impact: string | null;
}

async function seriousAxeViolations(page: Page) {
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async () => {
    const axe = (
      window as typeof window & {
        axe: { run: () => Promise<{ violations: AxeViolation[] }> };
      }
    ).axe;
    return (await axe.run()).violations.filter(
      (violation) =>
        violation.impact === "serious" || violation.impact === "critical",
    );
  });
}

test("P4 keeps quote revisions explicit and confirms without AR", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/app/sales/orders");

  await expect(page).toHaveTitle(/Báo giá & đơn bán/);
  await expect(
    page.getByRole("heading", { name: "Báo giá & đơn bán" }),
  ).toBeVisible();
  await expect(page.getByText("BG-2026-0001", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Phiên bản 1", { exact: false }).first(),
  ).toBeVisible();
  await expect(page.getByText(/82\.000.*\/bao/).first()).toBeVisible();
  await expect(page.getByText("Khớp quy tắc", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "Đơn bán" }).click();
  await expect(
    page.getByText("Xác nhận đơn bán không tạo công nợ khách hàng"),
  ).toBeVisible();
  await expect(page.getByText("SO-2026-0001", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Xác nhận đơn & tạo yêu cầu thực hiện" })
    .click();
  await expect(
    page.getByText(
      "Đã xác nhận đơn và tạo yêu cầu thực hiện; chưa phát sinh công nợ.",
    ),
  ).toBeVisible();

  await expect(seriousAxeViolations(page)).resolves.toEqual([]);
  await page.screenshot({
    path: "docs/evidence/p4-quotation-sales-order-implemented.png",
    fullPage: true,
  });
});

test("P4 quotation actions remain usable at 375px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/app/sales/orders");

  await expect(page).toHaveTitle(/Báo giá & đơn bán/);
  await page.getByText("Thêm dòng vật liệu", { exact: true }).click();
  await page.getByLabel("Số lượng").fill("25");
  await page.getByRole("button", { name: "Thêm vào báo giá" }).click();
  await expect(
    page.getByText("Đã thêm dòng với giá và đơn vị tính đã chụp."),
  ).toBeVisible();

  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    )
    .toBe(true);
  await expect(seriousAxeViolations(page)).resolves.toEqual([]);
  await page.screenshot({
    path: "docs/evidence/p4-quotation-sales-order-mobile-implemented.png",
    fullPage: true,
  });
});
