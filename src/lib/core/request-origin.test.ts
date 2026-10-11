// @vitest-environment node
import { expect, it } from "vitest";
import { hasSameRequestOrigin } from "./request-origin";

it("accepts the browser destination when Next uses an internal localhost URL", () => {
  expect(hasSameRequestOrigin(new Request("http://localhost:3110/api/upload", { headers: {
    host: "127.0.0.1:3110", origin: "http://127.0.0.1:3110",
  } }))).toBe(true);
});
it("rejects other origins, schemes and ports, even with a forged forwarded host", () => {
  for (const origin of ["https://evil.example", "http://example.test", "https://example.test:8443"]) {
    expect(hasSameRequestOrigin(new Request("https://internal.example/api/upload", { headers: {
      host: "example.test", origin, "x-forwarded-host": new URL(origin).host,
    } }))).toBe(false);
  }
});
it("rejects opaque or malformed origins and host credentials or paths", () => {
  for (const [origin, host] of [["null", "example.test"], ["https://example.test/path", "example.test"],
    ["https://example.test", "user@example.test"], ["https://example.test", "example.test/path"]]) {
    expect(hasSameRequestOrigin(new Request("https://internal.example/upload", { headers: { host, origin } }))).toBe(false);
  }
});
it("retains authenticated non-browser calls and the URL fallback when Host is absent", () => {
  expect(hasSameRequestOrigin(new Request("https://example.test/api/upload"))).toBe(true);
  expect(hasSameRequestOrigin(new Request("https://example.test/api/upload", { headers: { origin: "https://example.test" } }))).toBe(true);
});
