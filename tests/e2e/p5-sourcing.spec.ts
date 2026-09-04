import { fileURLToPath } from "node:url";

import { captureTestEvidence } from "./evidence";
import { expect, test, type Page } from "./fixtures";

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

test("P5 shows split sourcing, locked purchase cost and no fake inventory", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/app/sourcing");

  await expect(page).toHaveTitle(/Mua & nguồn hàng/);
  await expect(
    page.getByRole("heading", { name: "Mua & nguồn hàng" }),
  ).toBeVisible();
  await expect(
    page.getByText("Giao thẳng không nhập kho", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: /Lấy từ kho/ }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: /Nhà cung cấp giao thẳng/ }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Nhà cung cấp giao" }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Khách nhận" }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Tính tiền" }),
  ).toBeVisible();

  await page.getByRole("tab", { name: "Đơn mua" }).click();
  await expect(
    page.getByText("Xác nhận đơn mua chưa tạo công nợ nhà cung cấp"),
  ).toBeVisible();
  await expect(page.getByText("PO-2026-0001", { exact: true })).toBeVisible();
  await expect(page.getByText(/74\.500/).first()).toBeVisible();
  await page.getByRole("button", { name: "Ghi nhận đã nhận đơn" }).click();
  await expect(
    page.getByText("Đã ghi nhận nhà cung cấp xác nhận đơn."),
  ).toBeVisible();

  await page.getByRole("tab", { name: "Nhà cung cấp" }).click();
  await expect(
    page.getByText("Công ty Vật liệu Việt Xây", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("Giá nhà cung cấp", { exact: true }),
  ).toBeVisible();

  await expect(seriousAxeViolations(page)).resolves.toEqual([]);
  await captureTestEvidence(page, test.info(), "p5-sourcing-dropship-implemented.png");
});

test("P5 direct-sourcing form remains usable at 375px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/app/sourcing");

  await expect(page).toHaveTitle(/Mua & nguồn hàng/);
  await page.getByText("Chia thêm một nguồn", { exact: true }).click();
  await page.getByLabel("Cách lấy hàng").selectOption("SUPPLIER_DIRECT");
  await page.getByLabel("Số lượng").fill("10");
  await expect(
    page.getByText(/Giao thẳng tới Công trình Đông Anh/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Lưu phần chia nguồn" }).click();
  await expect(page.getByText("Đã chia nguồn cho dòng đơn bán.")).toBeVisible();
  await expect(page.getByLabel("Cách lấy hàng")).toHaveValue("WAREHOUSE");
  await expect(page.getByLabel("Kho nhận hàng")).toBeVisible();
  await expect(
    page.getByText(/Giao thẳng tới Công trình Đông Anh/),
  ).toBeHidden();

  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    )
    .toBe(true);
  await expect(seriousAxeViolations(page)).resolves.toEqual([]);
  await captureTestEvidence(page, test.info(), "p5-sourcing-dropship-mobile-implemented.png");
});
