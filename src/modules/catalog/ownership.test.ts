import { describe, expect, it } from "vitest";
import { catalogs } from "./fields";
import { catalogHref, catalogModules, manageableCatalogs } from "./ownership";

describe("module-owned catalog routing", () => {
  it.each([
    ["materials", "/admin/products/manage"], ["groups", "/admin/products/manage"],
    ["units", "/admin/products/manage"], ["conversions", "/admin/products/manage"],
    ["customers", "/admin/customers/manage"], ["sites", "/admin/customers/manage"],
    ["suppliers", "/admin/suppliers/manage"], ["warehouses", "/admin/inventory/warehouses"],
    ["vehicles", "/admin/dispatch/resources"], ["machines", "/admin/dispatch/resources"],
    ["service_types", "/admin/service-jobs/types"], ["branches", "/admin/settings/branches"],
  ])("routes %s to its owning module", (kind, path) => {
    expect(catalogHref(kind)).toBe(`${path}?kind=${kind}`);
  });
  it("preserves and encodes record, search and quick-create context", () => {
    const url = new URL(catalogHref("sites", { id: "record-id", q: "A & B", customerId: "customer-id" }), "https://example.com");
    expect(url.pathname).toBe("/admin/customers/manage");
    expect(Object.fromEntries(url.searchParams)).toEqual({ kind: "sites", id: "record-id", q: "A & B", customerId: "customer-id" });
  });
  it.each([undefined, "__proto__", "constructor", "../orders", "https://example.com"])('rejects unknown destination %s', (kind) => {
    expect(catalogHref(kind)).toBe("/admin/settings");
  });
  it("does not render editors from read-only permissions", () => {
    expect(manageableCatalogs(catalogModules.products, new Set(["catalog.read", "pricing.read"]))).toEqual([]);
  });
  it("restricts each module to its original management permissions", () => {
    const permissions = new Set(["catalog.manage", "suppliers.manage", "roles.manage"]);
    expect(manageableCatalogs(catalogModules.products, permissions).map(([kind]) => kind)).toEqual(["materials", "groups", "units", "conversions"]);
    expect(manageableCatalogs(catalogModules.customers, permissions)).toEqual([]);
    expect(manageableCatalogs(catalogModules.warehouses, new Set(["inventory.read"]))).toEqual([]);
    expect(manageableCatalogs(catalogModules.services, new Set(["service.read"]))).toEqual([]);
    expect(manageableCatalogs(catalogModules.services, new Set(["service.manage"])).map(([kind]) => kind)).toEqual(["service_types"]);
  });
  it("owns every existing catalog exactly once without new taxonomy", () => {
    const kinds = Object.values(catalogModules).flat();
    expect(new Set(kinds).size).toBe(kinds.length);
    expect([...kinds].sort()).toEqual(Object.keys(catalogs).sort());
  });
});
