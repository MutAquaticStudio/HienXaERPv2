import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

const axePath = fileURLToPath(new URL("../../node_modules/axe-core/axe.min.js", import.meta.url));
interface AxeViolation { impact: string | null }
async function seriousAxeViolations(page: Page) {
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async () => {
    const axe = (window as typeof window & { axe: { run: () => Promise<{ violations: AxeViolation[] }> } }).axe;
    return (await axe.run()).violations.filter((item) => item.impact === "serious" || item.impact === "critical");
  });
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

async function expectWorkerControls(page: Page, minimum = 56) {
  const controls = page.locator(".worker-workspace button, .worker-workspace input, .worker-workspace textarea, .worker-workspace summary, .worker-nav a");
  let visible = 0;
  for (let index = 0; index < await controls.count(); index += 1) {
    const control = controls.nth(index);
    if (!await control.isVisible()) continue;
    visible += 1;
    expect((await control.boundingBox())?.height).toBeGreaterThanOrEqual(minimum);
  }
  expect(visible).toBeGreaterThan(0);
}

test("P10 worker home exposes active work, heartbeat and a recoverable blocked form", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/work");
  await expect(page.getByRole("heading", { name: "Việc của tôi" })).toBeVisible();
  await expect(page.getByText("Giao cát vàng đến công trường Đông Ngàn")).toBeVisible();
  await expect(page.getByText("Đang kết nối")).toBeVisible();
  await expect(page.getByRole("button", { name: "BÁO TIẾN ĐỘ" })).toBeVisible();

  const blocked = page.locator(".worker-block-details").first();
  await blocked.locator("summary").click();
  await blocked.getByLabel("Lý do bị vướng").fill("quá ngắn");
  await blocked.getByRole("button", { name: "GỬI CHO GIÁM SÁT" }).click();
  await expect(blocked.getByText("Lý do bị vướng cần ít nhất 10 ký tự.")).toBeVisible();
  await expect(blocked).toHaveAttribute("open", "");
  await expect(blocked.getByLabel("Lý do bị vướng")).toHaveValue("quá ngắn");

  await expectWorkerControls(page);
  await expectNoHorizontalOverflow(page);
  await expect(seriousAxeViolations(page)).resolves.toEqual([]);
  await page.screenshot({ path: "docs/evidence/p10-worker-os-mobile-implemented.png", fullPage: true });
});

test("P10 work pool is eligibility-scoped, claimable and large-text safe", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/work/pool");
  await expect(page.getByRole("heading", { name: "Bể công việc" })).toBeVisible();
  await expect(page.getByText("Giao đá 1×2 đến KCN VSIP")).toBeVisible();
  const claim = page.getByRole("button", { name: "NHẬN VIỆC NÀY" });
  expect((await claim.boundingBox())?.height).toBeGreaterThanOrEqual(56);
  await claim.click();
  await expect(page.getByText("Đã nhận việc. Hãy bắt đầu trong 5 phút.")).toBeVisible();
  await expect(page.locator('.worker-nav a[aria-current="page"]')).toHaveText(/Bể công việc/);

  const base = await page.locator("html").evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  await page.getByRole("button", { name: "Bật chế độ chữ lớn" }).click();
  const large = await page.locator("html").evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(large).toBeGreaterThan(base);
  await expectWorkerControls(page, 56);
  await expectNoHorizontalOverflow(page);
  await expect(seriousAxeViolations(page)).resolves.toEqual([]);
});

test("P10 supervisor queue aggregates work and protects consequential decisions", async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 1050 });
  await page.goto("/app/workforce");
  await expect(page).toHaveTitle(/Điều hành công việc/);
  await expect(page.getByRole("heading", { name: "Điều hành công việc" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hàng đợi giám sát" })).toBeVisible();
  await expect(page.getByText("Bốc xếp xi măng khu A")).toBeVisible();
  await expect(page.getByText("Giao xi măng PCB40 đến Yên Phong")).toBeVisible();
  await expect(page.getByText("Không tự động trả việc về bể.")).toBeVisible();

  const form = page.locator('.workforce-form:has(select[name="supervisorAction"])').first();
  await form.getByLabel("Lý do quyết định").fill("ngắn");
  await form.getByRole("button", { name: "LƯU QUYẾT ĐỊNH" }).click();
  await expect(form.getByText("Lý do cần ít nhất 10 ký tự.")).toBeVisible();
  await expect(form.getByLabel("Lý do quyết định")).toHaveValue("ngắn");
  await expect(seriousAxeViolations(page)).resolves.toEqual([]);
  await page.screenshot({ path: "docs/evidence/p10-supervisor-queue-implemented.png", fullPage: true });
});
