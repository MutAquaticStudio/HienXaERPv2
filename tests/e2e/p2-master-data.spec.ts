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

test("P2 master data workspace exposes precise UOM and operational masters", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/app/data");

  await expect(
    page.getByRole("heading", { name: "Vật liệu, đơn vị và năng lực" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Dữ liệu" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByText("2", { exact: true }).first()).toBeVisible();

  await page
    .getByLabel("Vật liệu và quy đổi")
    .selectOption({ label: "Cát vàng: 1.4 tấn → 1 m³" });
  await page.getByLabel(/Số lượng \(tấn\)/).fill("10");
  await expect(page.getByText("7.143 m³", { exact: true })).toBeVisible();
  await expect(
    page
      .getByLabel("Tính thử quy đổi")
      .getByText("Ước tính", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/không phải tỷ lệ chính xác/i, { exact: false }).first(),
  ).toBeVisible();

  await page.getByRole("tab", { name: "Kho & phương tiện" }).click();
  await expect(
    page.getByRole("heading", { name: "Hồ sơ tải xe" }),
  ).toBeVisible();
  await expect(page.getByText("Lập kế hoạch", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "Nhân sự & kỹ năng" }).click();
  await expect(
    page.getByRole("heading", { name: "Năng lực người lao động" }),
  ).toBeVisible();

  await expect(seriousAxeViolations(page)).resolves.toEqual([]);
  await page.screenshot({
    path: "docs/evidence/p2-master-data-implemented.png",
    fullPage: true,
  });
});

test("P2 master form reports audited success and remains usable on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/app/data");
  await page
    .getByText("Thêm hoặc cập nhật nhóm vật liệu", { exact: true })
    .click();
  await page.getByLabel("Mã nhóm").fill("STONE");
  await page.getByLabel("Tên nhóm").fill("Đá xây dựng");
  await page
    .locator("details")
    .filter({ hasText: "Thêm hoặc cập nhật nhóm vật liệu" })
    .getByRole("button", { name: "Lưu dữ liệu" })
    .click();
  await expect(
    page.getByText("Đã lưu và ghi nhận audit thành công."),
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
    path: "docs/evidence/p2-master-data-mobile-implemented.png",
    fullPage: true,
  });
});
