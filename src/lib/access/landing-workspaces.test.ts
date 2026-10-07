import { describe, expect, it } from "vitest";
import { internalLandingPath } from "./landing";

describe("independently authorized workspace landing", () => {
  it.each([
    ["finance.expense.read", "/admin/expenses"],
    ["finance.payment_notice.review", "/admin/payment-notices"],
    ["pricing.read", "/admin/settings/pricing"],
    ["customers.manage", "/admin/settings"],
    ["suppliers.manage", "/admin/settings"],
    ["catalog.manage", "/admin/settings"],
    ["roles.manage", "/admin/access"],
  ])("routes %s to its existing authorized workspace", (permission, path) => {
    expect(internalLandingPath(new Set([permission]))).toBe(path);
  });

  it("does not infer pricing read from pricing management", () => {
    expect(() => internalLandingPath(new Set(["pricing.manage"]))).toThrow();
  });

  it("preserves the dashboard destination for broad authorized readers", () => {
    expect(internalLandingPath(new Set([
      "dashboard.read", "finance.expense.read", "pricing.read",
    ]))).toBe("/admin");
  });

  it("preserves worker landing without an internal workspace permission", () => {
    expect(internalLandingPath(new Set(["work.read"]))).toBe("/work");
  });
});
