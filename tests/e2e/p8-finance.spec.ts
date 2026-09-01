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
      (item) => item.impact === "serious" || item.impact === "critical",
    );
  });
}

test("P8 finance workspace exposes working capital, debt and explicit posting", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/app/finance");
  await expect(page).toHaveTitle(/Tài chính và dòng tiền/);
  await expect(
    page.getByRole("heading", { name: "Tài chính và dòng tiền" }),
  ).toBeVisible();
  await expect(page.getByText("428.500.000 ₫")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Phải thu khách hàng" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Phải trả nhà cung cấp" }),
  ).toBeVisible();
  await expect(page.getByLabel("Tiền tệ báo cáo")).toHaveValue("VND");
  await expect(page.getByText(/Đã phân bổ .*%/).first()).toBeVisible();
  await expect(page.getByText(/Phân bổ chi phí/).first()).toBeVisible();
  await page.getByLabel("Số tiền").first().fill("12000000");
  await page.getByRole("button", { name: "LƯU BẢN NHÁP" }).click();
  await expect(
    page.getByText("Đã lập khoản thu chi ở trạng thái nháp."),
  ).toBeVisible();
  await expect(seriousAxeViolations(page)).resolves.toEqual([]);
  await page.screenshot({
    path: "docs/evidence/p8-finance-working-capital-implemented.png",
    fullPage: true,
  });
});

test("P8 finance remains readable without horizontal overflow on a small screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/finance");
  await expect(
    page.getByRole("heading", { name: "Tài chính và dòng tiền" }),
  ).toBeVisible();
  await expect(
    page.getByText("Tiền ứng trước", { exact: true }).first(),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    )
    .toBe(true);
  await expect(seriousAxeViolations(page)).resolves.toEqual([]);
});
