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

test("P3 Customer 360 resolves price and makes credit blocks explicit", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/app/sales");

  await expect(
    page.getByRole("heading", { name: "Khách hàng & giá bán" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Bán hàng" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(
    page.getByRole("heading", { name: "Công ty Xây dựng An Phát" }),
  ).toBeVisible();
  await expect(page.getByText("Tiền khách ứng trước")).toBeVisible();

  await page.getByRole("tab", { name: "Giá bán" }).click();
  await expect(page.getByText("Khách hàng + vật liệu", { exact: true }).first()).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Tìm giá đang áp dụng" })
      .getByText(/82\.000.*\/bao/),
  ).toBeVisible();

  await page.getByRole("tab", { name: "Tín dụng" }).click();
  await expect(page.getByText("Có thể bán", { exact: true })).toBeVisible();
  await page
    .getByLabel("Khách hàng đang xem")
    .selectOption("customer-minh-tam");
  await expect(
    page.getByText("Bị chặn tín dụng", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/vượt hạn mức tín dụng/i)).toBeVisible();
  await expect(page.getByText(/quá hạn vượt số ngày/i)).toBeVisible();

  await expect(seriousAxeViolations(page)).resolves.toEqual([]);
  await captureTestEvidence(page, test.info(), "p3-customer-360-implemented.png");
});

test("P3 customer form is audited and usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/app/sales");
  await page.getByText("Thêm hoặc cập nhật khách hàng", { exact: true }).click();
  await page.getByLabel("Mã khách hàng").fill("HOA-BINH");
  await page.getByLabel("Tên giao dịch").fill("Công ty Hòa Bình");
  await page
    .locator("details")
    .filter({ hasText: "Thêm hoặc cập nhật khách hàng" })
    .getByRole("button", { name: "Lưu dữ liệu" })
    .click();
  await expect(
    page.getByText("Đã lưu và ghi nhận lịch sử kiểm soát."),
  ).toBeVisible();

  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    )
    .toBe(true);
  await expect(seriousAxeViolations(page)).resolves.toEqual([]);
  await captureTestEvidence(page, test.info(), "p3-customer-360-mobile-implemented.png");
});
