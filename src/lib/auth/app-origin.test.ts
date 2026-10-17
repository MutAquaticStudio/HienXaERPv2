import { afterEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ headers: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: m.headers }));

import { appOrigin, passwordSetupUrl } from "./app-origin";

afterEach(() => vi.unstubAllEnvs());

it("prefers the configured app URL", async () => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.test/some/path");
  expect(await appOrigin()).toBe("https://app.example.test");
  expect(m.headers).not.toHaveBeenCalled();
});

it("falls back to the host the request came in on instead of localhost", async () => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
  m.headers.mockResolvedValue(new Headers({ host: "internal:3000", "x-forwarded-host": "erp.example.test", "x-forwarded-proto": "https" }));
  expect(await passwordSetupUrl("work")).toBe("https://erp.example.test/recovery/confirm?surface=work");
  m.headers.mockResolvedValue(new Headers({ host: "localhost:3000" }));
  expect(await appOrigin()).toBe("http://localhost:3000");
  m.headers.mockResolvedValue(new Headers());
  expect(await appOrigin()).toBe("http://localhost:3000");
});
