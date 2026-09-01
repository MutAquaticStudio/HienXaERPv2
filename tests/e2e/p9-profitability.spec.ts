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

test("P9 command center exposes margin, direct-cost waterfall and controlled lifecycle", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.goto("/app");
  await expect(page).toHaveTitle(/Trung tâm điều hành lợi nhuận/);
  await expect(
    page.getByRole("heading", { name: "Trung tâm điều hành lợi nhuận" }),
  ).toBeVisible();
  await expect(page.getByText("193.775.000 ₫")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Chi phí thực tế theo cấu phần" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Biên lợi nhuận theo đơn hàng" }),
  ).toBeVisible();
  await expect(page.getByLabel("Tiền tệ")).toHaveValue("VND");
  await page.getByRole("tab", { name: "Nhà cung cấp" }).click();
  await expect(page.getByText("Bãi vật liệu Đông Anh").last()).toBeVisible();
  await expect(
    page.getByText(/doanh thu · .*chi phí trực tiếp/).first(),
  ).toBeVisible();
  await expect(seriousAxeViolations(page)).resolves.toEqual([]);
  await page.screenshot({
    path: "docs/evidence/p9-command-center-implemented.png",
    fullPage: true,
  });
});

test("P9 command center stays within a small viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app");
  await expect(
    page.getByRole("heading", { name: "Trung tâm điều hành lợi nhuận" }),
  ).toBeVisible();
  await expect(
    page.getByText("Vốn lưu động", { exact: true }).first(),
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
