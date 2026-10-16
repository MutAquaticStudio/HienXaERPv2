import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ access: vi.fn(), calls: [] as { table: string; method: string; args: unknown[] }[], tables: {} as Record<string, unknown[]> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }), usePathname: () => "/admin/suppliers" }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: m.access }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({
  from(table: string) {
    const result = { data: m.tables[table] ?? [], error: null, count: (m.tables[table] ?? []).length };
    const query: Record<string, unknown> = {};
    for (const method of ["select", "eq", "or", "in", "gt", "order", "range", "limit"]) query[method] = (...args: unknown[]) => { m.calls.push({ table, method, args }); return query; };
    query.then = (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve);
    return query;
  },
}) }));
import Page from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  m.calls = [];
  m.tables = {
    suppliers: [{ id: "s1", code: "NCC01", name: "Xi măng Bút Sơn", phone: "0912", tax_code: "0101", payment_terms_days: 30, active: true }],
    payable_read: [{ supplier_id: "s1", outstanding_amount_vnd: "12000000" }, { supplier_id: "s1", outstanding_amount_vnd: "500000" }],
  };
});
afterEach(cleanup);

it("links the supplier name to its profile and hides amounts owed without payables rights", async () => {
  m.access.mockResolvedValue({ branchId: "b", branchName: "CN", permissions: new Set(["suppliers.read"]) });
  render(await Page({ searchParams: Promise.resolve({}) }));
  const row = screen.getByRole("link", { name: "Xi măng Bút Sơn" }).closest("tr")!;
  expect(within(row).getByRole("link", { name: "Xi măng Bút Sơn" })).toHaveAttribute("href", "/admin/suppliers/s1");
  expect(within(row).getByText("MST 0101")).toBeInTheDocument();
  expect(screen.queryByText("Còn phải trả")).not.toBeInTheDocument();
  expect(m.calls.some((call) => call.table === "payable_read")).toBe(false);
  expect(screen.queryByRole("button", { name: "+ Nhà cung cấp" })).not.toBeInTheDocument();
});

it("sums amounts owed per supplier and offers creating one in place", async () => {
  m.access.mockResolvedValue({ branchId: "b", branchName: "CN", permissions: new Set(["suppliers.read", "suppliers.manage", "finance.ap.read"]) });
  render(await Page({ searchParams: Promise.resolve({}) }));
  const row = screen.getByRole("link", { name: "Xi măng Bút Sơn" }).closest("tr")!;
  expect(row.querySelector('td[data-label="Còn phải trả"]')).toHaveTextContent("12.500.000");
  expect(m.calls).toContainEqual({ table: "payable_read", method: "in", args: ["supplier_id", ["s1"]] });
  expect(screen.getByRole("button", { name: "+ Nhà cung cấp" })).toBeInTheDocument();
});
