import {
  expect,
  test as base,
  type Page,
  type TestInfo,
} from "@playwright/test";

const HYDRATION_MISMATCH =
  /hydration|server rendered html|didn't match|did not match/i;

export const test = base.extend({
  page: async ({ page }, runPage, testInfo) => {
    const runtimeFailures: string[] = [];

    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        HYDRATION_MISMATCH.test(message.text())
      ) {
        runtimeFailures.push(`console.error: ${message.text()}`);
      }
    });
    page.on("pageerror", (error) => {
      runtimeFailures.push(`pageerror: ${error.message}`);
    });

    await runPage(page);

    expect(
      runtimeFailures,
      `Client runtime failure in ${testInfo.title}`,
    ).toEqual([]);
  },
});

export { expect };
export type { Page, TestInfo };
