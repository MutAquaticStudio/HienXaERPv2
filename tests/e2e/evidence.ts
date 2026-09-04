import type { Page, TestInfo } from "@playwright/test";

export function captureTestEvidence(
  page: Page,
  testInfo: TestInfo,
  filename: string,
) {
  return page.screenshot({
    path: testInfo.outputPath(filename),
    fullPage: true,
  });
}
