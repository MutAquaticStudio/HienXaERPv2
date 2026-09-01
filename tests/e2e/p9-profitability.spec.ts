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

async function expectVisibleControlsAtLeast(page: Page, minimumHeight: number) {
  const controls = page.locator(
    ".profitability-workspace button, .profitability-workspace input, .profitability-workspace select, .profitability-workspace textarea, .profitability-workspace summary, .profitability-workspace a.button-link",
  );
  let visibleControls = 0;
  for (let index = 0; index < (await controls.count()); index += 1) {
    const control = controls.nth(index);
    if (!(await control.isVisible())) continue;
    visibleControls += 1;
    const box = await control.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(minimumHeight);
  }
  expect(visibleControls).toBeGreaterThan(0);
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
  await expect(page.getByText("Không gồm chi phí chung")).toBeVisible();
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
  await expect(page.locator(".profitability-table tbody tr").first()).toHaveCSS(
    "display",
    "block",
  );
  await expect(
    page.locator('td[data-label="Kết quả tài chính"]').first(),
  ).toBeVisible();
  await expectVisibleControlsAtLeast(page, 48);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    )
    .toBe(true);
  await expect(seriousAxeViolations(page)).resolves.toEqual([]);
});

test("P9 remains operable with large text, keyboard tabs and recoverable form errors", async ({
  page,
}) => {
  await page.setViewportSize({ width: 640, height: 900 });
  await page.goto("/app");

  const baseFontSize = await page
    .locator("html")
    .evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).fontSize),
    );
  await page.getByRole("button", { name: "Bật chế độ chữ lớn" }).click();
  const largeFontSize = await page
    .locator("html")
    .evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).fontSize),
    );
  expect(largeFontSize).toBeGreaterThan(baseFontSize);

  const customerTab = page.getByRole("tab", { name: "Khách hàng" });
  await customerTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Vật liệu" })).toBeFocused();
  await expect(page.getByRole("tab", { name: "Vật liệu" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  const firstActions = page.locator(".profitability-order-actions").first();
  const contributionBefore = await page
    .getByText("193.775.000 ₫")
    .first()
    .textContent();
  await firstActions.locator("summary").click();
  const costForm = firstActions.locator("form").first();
  await costForm.getByLabel("Số tiền").fill("1000");
  await costForm.getByLabel("Lý do").fill("quá ngắn");
  await costForm.getByRole("button", { name: "Ghi chi phí" }).click();
  await expect(
    costForm.getByText("Lý do cần ít nhất 10 ký tự để lưu dấu vết kiểm toán."),
  ).toBeVisible();
  await expect(firstActions).toHaveAttribute("open", "");
  await expect(costForm.getByLabel("Lý do")).toHaveValue("quá ngắn");
  await expect(page.getByText("193.775.000 ₫").first()).toHaveText(
    contributionBefore ?? "",
  );

  await expectVisibleControlsAtLeast(page, 48);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    )
    .toBe(true);
  await expect(seriousAxeViolations(page)).resolves.toEqual([]);
});
