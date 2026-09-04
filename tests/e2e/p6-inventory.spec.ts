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
      (item) => item.impact === "serious" || item.impact === "critical",
    );
  });
}

test("P6 shows derived balances, reservation conversion and immutable ledger", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/app/inventory");
  await expect(page).toHaveTitle(/Kho & bãi/);
  await expect(page.getByRole("heading", { name: "Kho & bãi" })).toBeVisible();
  await expect(page.getByText(/không sửa tay/i)).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Thực tế" }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Đã giữ" }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Khả dụng" }),
  ).toBeVisible();
  await expect(
    page.getByText("25 tấn → 25.000 kg", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Sổ chuyển động kho" }),
  ).toBeVisible();
  await expect(page.getByText("IM-2026-000002", { exact: true })).toBeVisible();
  await expect(seriousAxeViolations(page)).resolves.toEqual([]);
  await captureTestEvidence(page, test.info(), "p6-inventory-yard-implemented.png");
});

test("P6 inventory actions remain usable at 375px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/app/inventory");
  await page.getByRole("button", { name: "Giữ tồn kho" }).click();
  await expect(
    page.getByText("Đã giữ tồn kho theo phần chia nguồn."),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    )
    .toBe(true);
  await expect(seriousAxeViolations(page)).resolves.toEqual([]);
  await captureTestEvidence(page, test.info(), "p6-inventory-yard-mobile-implemented.png");
});
