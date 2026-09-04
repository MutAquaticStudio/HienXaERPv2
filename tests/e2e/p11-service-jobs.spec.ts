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

test("P11 Office shows service lifecycle, separate approved hours and profitability", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1536, height: 1050 });
  await page.goto("/app/service");
  await expect(page).toHaveTitle(/Công việc dịch vụ/);
  await expect(
    page.getByRole("heading", {
      name: "Điều hành ServiceJob từ lịch đến phải thu",
    }),
  ).toBeVisible();
  await expect(page.getByText("SVC-2026-000024")).toBeVisible();
  await expect(
    page.getByText("6.800.000 ₫", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("4.500.000 ₫", { exact: true }).first(),
  ).toBeVisible();
  const completed = page.locator(".service-job-card", {
    hasText: "SVC-2026-000022",
  });
  await completed.locator("summary", { hasText: "Thao tác công việc" }).click();
  await expect(completed.getByLabel("Giờ thực tế")).toHaveValue("7.33");
  await expect(completed.getByLabel("Giờ được duyệt")).toHaveValue("7.33");
  await expect(seriousAxeViolations(page)).resolves.toEqual([]);
  await captureTestEvidence(page, test.info(), "p11-service-jobs-implemented.png");
});

test("P11 Office remains usable on a narrow large-text layout and keeps invalid approval recoverable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/service");
  await page.getByRole("button", { name: "Bật chế độ chữ lớn" }).click();
  const completed = page.locator(".service-job-card", {
    hasText: "SVC-2026-000022",
  });
  await completed.locator("summary", { hasText: "Thao tác công việc" }).click();
  await completed.getByLabel("Giờ được duyệt").fill("7");
  await completed.getByLabel("Sản lượng tính tiền").fill("8");
  await completed
    .getByLabel("Ghi chú duyệt")
    .fill("Duyệt theo biên bản nghiệm thu đủ giờ");
  await completed.getByRole("button", { name: "Duyệt tính tiền" }).click();
  await expect(
    completed.getByText(/phải có sản lượng tính tiền bằng số giờ/),
  ).toBeVisible();
  await expect(completed.getByLabel("Giờ được duyệt")).toHaveValue("7");
  await expect(completed.locator(".service-actions")).toHaveAttribute(
    "open",
    "",
  );
  await visibleControlsAtLeast(
    page,
    ".service-workspace button, .service-workspace input, .service-workspace select, .service-workspace textarea, .service-workspace summary",
    48,
  );
  await noHorizontalOverflow(page);
  await expect(seriousAxeViolations(page)).resolves.toEqual([]);
});

test("P11 worker can log field events with 56px mobile controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/work/service");
  await expect(
    page.getByRole("heading", { name: "Công việc dịch vụ của tôi" }),
  ).toBeVisible();
  await expect(page.getByText("SVC-2026-000021")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "GHI NHIÊN LIỆU" }),
  ).toBeVisible();
  const incident = page.locator(".service-worker-form", {
    hasText: "BÁO SỰ CỐ",
  });
  await incident.getByLabel("Mô tả sự cố").fill("ngắn");
  await incident.getByRole("button", { name: "BÁO SỰ CỐ" }).click();
  await expect(
    incident.getByText("Mô tả sự cố cần ít nhất 10 ký tự."),
  ).toBeVisible();
  await expect(incident.getByLabel("Mô tả sự cố")).toHaveValue("ngắn");
  await visibleControlsAtLeast(
    page,
    ".service-worker-workspace button, .service-worker-workspace input, .service-worker-workspace select, .service-worker-workspace textarea, .worker-nav a",
    56,
  );
  await noHorizontalOverflow(page);
  await expect(seriousAxeViolations(page)).resolves.toEqual([]);
  await captureTestEvidence(page, test.info(), "p11-service-job-mobile-implemented.png");
});
