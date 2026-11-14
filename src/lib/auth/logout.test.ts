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
