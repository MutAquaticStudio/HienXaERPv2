// @vitest-environment node
import { expect, it } from "vitest";
import { authCookieWriteOptions, isSessionOnly, SESSION_ONLY_COOKIE } from "./cookie-options";

const library = { path: "/", sameSite: "lax" as const, secure: true, maxAge: 400 * 24 * 60 * 60 };

it("keeps a remembered login for the library's 400 days (D77)", () => {
  expect(authCookieWriteOptions(library, false)).toEqual(library);
});

it("writes a login that is not remembered without a lifetime, so closing the browser ends it (D77)", () => {
  const written = authCookieWriteOptions({ ...library, expires: new Date("2027-01-01") }, true);
  expect(written).toEqual({ path: "/", sameSite: "lax", secure: true });
  expect(written).not.toHaveProperty("maxAge");
  expect(written).not.toHaveProperty("expires");
});

it("still removes a login cookie that is being cleared (max-age 0), remembered or not", () => {
  expect(authCookieWriteOptions({ ...library, maxAge: 0 }, true)).toEqual({ ...library, maxAge: 0 });
});

it("reads the browser-session marker set at sign-in", () => {
  expect(isSessionOnly((name) => (name === SESSION_ONLY_COOKIE ? "1" : undefined))).toBe(true);
  expect(isSessionOnly(() => undefined)).toBe(false);
  expect(isSessionOnly(() => "0")).toBe(false);
});
