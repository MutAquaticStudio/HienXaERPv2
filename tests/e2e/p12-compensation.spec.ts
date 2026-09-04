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

async function noHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    )
    .toBe(true);
}

async function visibleControlsAtLeast(
  page: Page,
  selector: string,
  minimum: number,
) {
  const controls = page.locator(selector);
  let visible = 0;
  for (let index = 0; index < (await controls.count()); index += 1) {
    const control = controls.nth(index);
    if (!(await control.isVisible())) continue;
    visible += 1;
    expect((await control.boundingBox())?.height).toBeGreaterThanOrEqual(
      minimum,
    );
  }
  expect(visible).toBeGreaterThan(0);
}

test("P12 Office separates entitlement, plans, payroll and P8 payment linkage", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1536, height: 1050 });
  await page.goto("/app/compensation");
  await expect(page).toHaveTitle(/Thu nhập & sản lượng/);
  await expect(
    page.getByRole("heading", {
      name: "Thu nhập và sản lượng từ việc đã xác minh",
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Quyền lợi không đồng nghĩa đã trả tiền"),
  ).toBeVisible();
  await expect(page.getByText("ERN-2026-000088")).toBeVisible();
  await expect(page.getByText(/350\.000/).first()).toBeVisible();
  await page.getByRole("tab", { name: "Kế hoạch tính" }).click();
  await expect(
    page.getByText(
      "Ưu tiên áp dụng: riêng nhân viên, sau đó theo vai trò, cuối cùng là mặc định công ty.",
    ),
  ).toBeVisible();
  await expect(
    page.locator(".compensation-plan-list span", { hasText: "TX-CHUYEN · v2" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Kỳ thu nhập" }).click();
  await expect(page.getByText(/Đã liên kết 5\.000\.000/)).toBeVisible();
  await page.locator("summary", { hasText: "Liên kết khoản chi" }).click();
  await expect(
    page.getByText(/không tạo hoặc đăng sổ tiền lần nữa/i),
  ).toBeVisible();
  await expect(seriousAxeViolations(page)).resolves.toEqual([]);
  await page.screenshot({
    path: "docs/evidence/p12-compensation-office-implemented.png",
    fullPage: true,
  });
});

test("P12 Office keeps an invalid approval recoverable on mobile large text", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/compensation");
  await page.getByRole("button", { name: "Bật chế độ chữ lớn" }).click();
  const card = page.locator(".earning-card", { hasText: "ERN-2026-000088" });
  await card.locator("summary", { hasText: "Duyệt quyền lợi" }).click();
  await card.getByLabel("Ghi chú duyệt").fill("quá ngắn");
  await card.getByRole("button", { name: "DUYỆT QUYỀN LỢI" }).click();
  await expect(
    card.getByText("Ghi chú duyệt cần ít nhất 10 ký tự."),
  ).toBeVisible();
  await expect(card.getByLabel("Ghi chú duyệt")).toHaveValue("quá ngắn");
  await expect(
    card.locator("details", { hasText: "Duyệt quyền lợi" }),
  ).toHaveAttribute("open", "");
  await visibleControlsAtLeast(
    page,
    ".compensation-workspace button, .compensation-workspace input, .compensation-workspace select, .compensation-workspace textarea, .compensation-workspace summary",
    48,
  );
  await noHorizontalOverflow(page);
  await expect(seriousAxeViolations(page)).resolves.toEqual([]);
});

test("P12 Worker sees only own earnings with four 56px primary destinations", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/work/earnings");
  await expect(
    page.getByRole("heading", { name: "Thu nhập của tôi" }),
  ).toBeVisible();
  await expect(
    page.getByText("Đã duyệt", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText(/5\.000\.000/).first()).toBeVisible();
  await expect(page.getByText("Lê Văn Bình")).toHaveCount(0);
  await expect(page.locator(".worker-nav a")).toHaveCount(4);
  await visibleControlsAtLeast(page, ".worker-nav a", 56);
  await noHorizontalOverflow(page);
  await expect(seriousAxeViolations(page)).resolves.toEqual([]);
  await page.screenshot({
    path: "docs/evidence/p12-my-earnings-mobile-implemented.png",
    fullPage: true,
  });
});

test("P12 remains complete at a 200 percent text-layout equivalent", async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto("/app/compensation");
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  await expect(page.getByRole("tab", { name: "Kỳ thu nhập" })).toBeVisible();
  await page.getByRole("tab", { name: "Kỳ thu nhập" }).click();
  await expect(
    page.getByRole("heading", { name: "Kỳ thu nhập và đối soát khoản chi" }),
  ).toBeVisible();
  await noHorizontalOverflow(page);
});
