import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ModuleCatalogPage from "./module-page";
import LegacyCatalogPage from "@/app/admin/catalog/page";
import { catalogModules } from "./ownership";

const boundary = vi.hoisted(() => ({ access: vi.fn(), client: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/access/context", () => ({ requireInternalAccess: boundary.access }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: boundary.client }));
vi.mock("next/navigation", () => ({ redirect: boundary.redirect }));
vi.mock("server-only", () => ({}));
vi.mock("./catalog-dialog", () => ({ CatalogTable: ({ kind, openNew, initial }: { kind: string; openNew?: boolean; initial?: Record<string, string> }) => <p>Editor {kind}{openNew ? ` mở thêm mới ${initial?.customer_id}` : ""}</p> }));

function query() {
  const response = { data: [], error: null };
  const request = {
    select: vi.fn(), eq: vi.fn(), limit: vi.fn(), order: vi.fn(), ilike: vi.fn(), in: vi.fn(),
    then: (resolve: (value: typeof response) => unknown) => Promise.resolve(response).then(resolve),
  };
  for (const key of ["select", "eq", "limit", "order", "ilike", "in"] as const) request[key].mockReturnValue(request);
  return request;
}

beforeEach(() => { vi.clearAllMocks(); boundary.redirect.mockImplementation((url: string) => { throw new Error(`REDIRECT:${url}`); }); });
afterEach(cleanup);

describe("module catalog authorization and query scope", () => {
  it("denies a read-only actor before constructing a management query", async () => {
    boundary.access.mockResolvedValue({ branchId: "branch-a", branchName: "QA", permissions: new Set(["catalog.read"]) });
    render(await ModuleCatalogPage({ searchParams: Promise.resolve({}), kinds: catalogModules.products }));
    expect(screen.getByText("Không có quyền quản lý danh mục.")).toBeInTheDocument();
    expect(boundary.client).not.toHaveBeenCalled();
  });

  it("keeps warehouse management scoped to its original branch and roles.manage", async () => {
    boundary.access.mockResolvedValue({ branchId: "branch-a", branchName: "QA", permissions: new Set(["roles.manage"]) });
    const request = query(); const from = vi.fn().mockReturnValue(request);
    boundary.client.mockResolvedValue({ from });
    render(await ModuleCatalogPage({ searchParams: Promise.resolve({ kind: "warehouses" }), kinds: catalogModules.warehouses }));
    expect(from).toHaveBeenCalledWith("warehouses");
    expect(request.eq).toHaveBeenCalledWith("branch_id", "branch-a");
    expect(screen.getByText("Editor warehouses")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Xe" })).not.toBeInTheDocument();
  });

  it("keeps all four material editors inside Products without foreign-module kinds", async () => {
    boundary.access.mockResolvedValue({ branchId: "branch-a", branchName: "QA", permissions: new Set(["catalog.manage", "suppliers.manage"]) });
    const request = query(); const from = vi.fn().mockReturnValue(request);
    boundary.client.mockResolvedValue({ from });
    render(await ModuleCatalogPage({ searchParams: Promise.resolve({ kind: "suppliers" }), kinds: catalogModules.products }));
    expect(from).not.toHaveBeenCalledWith("suppliers");
    expect(screen.getByText("Editor materials")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Quy đổi đơn vị" })).toHaveAttribute("href", "/admin/products/manage?kind=conversions");
  });

  it("preserves customer-site quick-create context and authenticated branch filtering", async () => {
    boundary.access.mockResolvedValue({ branchId: "branch-a", branchName: "QA", permissions: new Set(["customers.manage"]) });
    const request = query(); const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    boundary.client.mockResolvedValue({ from: vi.fn().mockReturnValue(request), rpc });
    render(await ModuleCatalogPage({ searchParams: Promise.resolve({ kind: "sites", customerId: "customer-a" }), kinds: catalogModules.customers }));
    expect(request.eq).toHaveBeenCalledWith("customers.branch_id", "branch-a");
    expect(rpc).toHaveBeenCalledWith("customer_site_sales_owner_options", { target_branch_id: "branch-a" });
    expect(screen.getByText("Editor sites mở thêm mới customer-a")).toBeInTheDocument();
  });

  it("redirects the legacy catalog with record/search context and no database query", async () => {
    boundary.access.mockResolvedValue({ permissions: new Set(["suppliers.manage"]) });
    await expect(LegacyCatalogPage({ searchParams: Promise.resolve({ kind: "suppliers", id: "record-a", q: "A & B" }) })).rejects.toThrow("REDIRECT:/admin/suppliers/manage?");
    expect(boundary.redirect).toHaveBeenCalledWith("/admin/suppliers/manage?kind=suppliers&q=A+%26+B&id=record-a");
    expect(boundary.client).not.toHaveBeenCalled();
  });
});
