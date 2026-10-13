import { expect, it } from "vitest";
import presets from "./default-role-presets.json";
import { internalLandingPath } from "./landing";
it.each(presets)("routes $name to its authorized documented workspace", (role) => { expect(internalLandingPath(new Set(role.permissions),role.name)).toBe(role.landingPath); });
it.each(presets.filter(role=>["builtin_worker","builtin_driver"].includes(role.code)))("keeps $name within the worker portal, with no administrative authority", (role) => {
 expect(new Set(role.permissions)).toEqual(new Set(["work.read","work.claim"]));
});
it("does not introduce role administration or payment posting into ordinary operational roles", () => {
 for (const role of presets) {
  expect(role.permissions).not.toContain("roles.manage");
  if(role.code!=="builtin_accountant") expect(role.permissions).not.toContain("finance.payment.post");
  if(!["builtin_manager","builtin_accountant"].includes(role.code)) expect(role.permissions).not.toContain("inventory.cost.read");
 }
});
it("does not authorize a route from the display role name alone", () => { expect(()=>internalLandingPath(new Set(),"Thợ")).toThrow(); expect(internalLandingPath(new Set(["orders.read"]),"Quản lý")).toBe("/admin/orders"); });
it("preserves the existing fallback for custom roles", () => { expect(internalLandingPath(new Set(["purchasing.read","delivery.read"]),"Vai trò riêng")).toBe("/admin/dispatch"); });
