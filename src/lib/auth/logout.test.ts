import { expect, it } from "vitest";
import { logoutDestination } from "./logout";

it("returns to the sign-in page, on the tab of the portal just left (FB9)", () => {
  expect(logoutDestination("admin")).toBe("/");
  expect(logoutDestination(null)).toBe("/");
  expect(logoutDestination("work")).toBe("/?portal=work");
  expect(logoutDestination("customer")).toBe("/?portal=customer");
  expect(logoutDestination("/evil")).toBe("/");
});

it("leaves nothing on a shared device, and keeps what a remembered device remembers for the next sign-in (D77)", async () => {
  const { logoutClearSiteData } = await import("./logout");
  expect(logoutClearSiteData(true)).toBe('"cache", "cookies", "storage"');
  expect(logoutClearSiteData(false)).toBe('"cache"');
});

it("tells the sign-in page that a shared device signed out, and expires every login cookie chunk (D77)", async () => {
  const { expiredAuthCookies, logoutDestination } = await import("./logout");
  expect(logoutDestination("work", true)).toBe("/?portal=work&remember=off");
  expect(logoutDestination("admin", true)).toBe("/?remember=off");
  expect(logoutDestination("customer", false)).toBe("/?portal=customer");
  expect(expiredAuthCookies(["sb-abc123-auth-token", "sb-abc123-auth-token.0", "sb-abc123-auth-token.1", "hx_branch_id", "sb-abc123-auth-token-code-verifier"]))
    .toEqual(["sb-abc123-auth-token", "sb-abc123-auth-token.0", "sb-abc123-auth-token.1"]);
});
