import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/core/errors";
import { internalLandingPath } from "./landing";

describe("internal workspace landing", () => {
  it("preserves the Owner and Finance dashboard landing", () => {
    expect(internalLandingPath(new Set(["dashboard.read", "work.read", "purchasing.read"]))).toBe("/admin");
  });
  it("does not send Purchasing without work.read to the worker portal", () => {
    expect(internalLandingPath(new Set(["orders.read", "purchasing.read", "purchasing.create", "catalog.read"]))).toBe("/admin/purchase-orders");
  });
  it("lands Warehouse/Dispatch in its authorized daily workspace", () => {
    expect(internalLandingPath(new Set(["delivery.read", "purchasing.read", "inventory.read", "work.read"]))).toBe("/admin/dispatch");
  });
  it("lands Sales without dashboard access on the order reader", () => {
    expect(internalLandingPath(new Set(["orders.read", "quotation.read", "customers.read"]))).toBe("/admin/orders");
  });
  it("preserves Worker landing only when work.read exists", () => {
    expect(internalLandingPath(new Set(["work.read", "work.claim"]))).toBe("/work");
  });
  it("supports the standalone Finance read scopes", () => {
    expect(internalLandingPath(new Set(["finance.ar.read"]))).toBe("/admin/receivables");
    expect(internalLandingPath(new Set(["finance.ap.read"]))).toBe("/admin/payables");
  });
  it("does not infer reader access from an action permission", () => {
    expect(() => internalLandingPath(new Set(["orders.create"]))).toThrowError(AppError);
    expect(() => internalLandingPath(new Set())).toThrowError(AppError);
  });
});
