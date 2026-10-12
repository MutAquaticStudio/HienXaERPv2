import assert from "node:assert/strict";

export function observeIntentionalResponseLoss(page, report, pathPrefix) {
  let intentionalLoss = false;
  report.expectedTransportErrors ??= [];
  report.unexpectedErrors ??= [];
  page.on("console", message => {
    if (message.type() !== "error") return;
    const event = { text: message.text(), url: message.location().url };
    if (intentionalLoss && event.text === "Failed to load resource: net::ERR_FAILED"
      && event.url.startsWith("http://127.0.0.1:3110" + pathPrefix)) report.expectedTransportErrors.push(event);
    else report.unexpectedErrors.push(event);
  });
  page.on("pageerror", error => report.unexpectedErrors.push({ pageError: error.message }));
  return {
    markIntentionalLoss() { intentionalLoss = true; },
    async assertHealthy() {
      const body = await page.locator("body").innerText();
      assert.ok(body.trim().length > 80, "Meaningful application content must render");
      assert.doesNotMatch(body, /Application error:|Runtime Error|Build Error|Unhandled Runtime Error/);
      assert.equal(report.unexpectedErrors.length, 0, JSON.stringify(report.unexpectedErrors));
    },
  };
}
