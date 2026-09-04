import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: false,
  // Run the same compiled server shape used by a Production deployment.
  // Serial files keep accessibility suites deterministic on GitHub Actions.
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    channel: "chrome",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command:
      "APP_ENV=test ALLOW_LOCAL_SYNTHETIC_AUTH=true ./node_modules/.bin/next start --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100/api/health",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
