// @vitest-environment node
import { expect, it } from "vitest";
import { passwordChangeRedirect } from "./proxy";

it("sends a login with a temporary password to the password change page of its portal", () => {
  expect(passwordChangeRedirect("/customer", true)).toBe("/customer/change-password");
  expect(passwordChangeRedirect("/customer/orders/1", true)).toBe("/customer/change-password");
  expect(passwordChangeRedirect("/work", true)).toBe("/work/change-password");
  expect(passwordChangeRedirect("/work/jobs/1", true)).toBe("/work/change-password");
});

it("lets the change page, sign-in, sign-out, API and other logins through", () => {
  for (const path of ["/customer/change-password", "/work/change-password", "/customer/login", "/work/login", "/login", "/auth/logout", "/api/health", "/recovery/confirm"]) {
    expect(passwordChangeRedirect(path, true), path).toBeNull();
  }
  expect(passwordChangeRedirect("/customer/orders", false)).toBeNull();
  expect(passwordChangeRedirect("/admin", true)).toBeNull();
  expect(passwordChangeRedirect("/customers-x", true)).toBeNull();
});
