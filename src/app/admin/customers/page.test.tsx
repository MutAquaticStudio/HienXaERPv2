import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ access: vi.fn(), calls: [] as { table: string; method: string; args: unknown[] }[], tables: {} as Record<string, unknown[]>, rpc: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), usePathname: () => "/admin/customers" }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: m.access }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({
  from(table: string) {
    const result = { data: m.tables[table] ?? [], error: null, count: (m.tables[table] ?? []).length };
    const query: Record<string, unknown> = {};
    for (const method of ["select", "eq", "or", "is", "not", "in", "gt", "order", "range", "limit"]) query[method] = (...args: unknown[]) => { m.calls.push({ table, method, args }); return query; };
    query.then = (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve);
    return query;
  },
  rpc: (...args: unknown[]) => { m.rpc(...args); return { select: async () => ({ data: [{ customer_id: "c1", credit_limit_vnd: "50000000" }], error: null }) }; },
}) }));
import Page from "./page";

const customers = [
  { id: "c1", code: "KH001", display_name: "Công ty Minh Phát", phone: "0909", tier_code: "VIP", customer_type: "BUSINESS", active: true },
  { id: "c2", code: "KH002", display_name: "Anh Tư", phone: null, tier_code: null, customer_type: "INDIVIDUAL", active: false },
];
beforeEach(() => {
  vi.clearAllMocks();
  m.calls = [];
  m.tables = { customers, receivable_read: [
    { customer_id: "c1", outstanding_amount_vnd: "9007199254740993" }, { customer_id: "c1", outstanding_amount_vnd: "7" },
  ] };
});
afterEach(cleanup);

it("links both code and name to the profile and labels each cell for the mobile card", async () => {
  m.access.mockResolvedValue({ branchId: "b", branchName: "CN", permissions: new Set(["customers.read"]) });
  render(await Page({ searchParams: Promise.resolve({}) }));
  const row = screen.getByRole("link", { name: "Công ty Minh Phát" }).closest("tr")!;
  expect(within(row).getByRole("link", { name: "Công ty Minh Phát" })).toHaveAttribute("href", "/admin/customers/c1");
  expect(within(row).getByRole("link", { name: "KH001" })).toHaveAttribute("href", "/admin/customers/c1");
  expect(within(row).getByText("Doanh nghiệp")).toBeInTheDocument();
  expect(row.querySelector('td[data-label="Nhóm giá"]')).toHaveTextContent("VIP");
});

it("never reads receivables or credit limits without finance.ar.read", async () => {
  m.access.mockResolvedValue({ branchId: "b", branchName: "CN", permissions: new Set(["customers.read"]) });
  render(await Page({ searchParams: Promise.resolve({}) }));
  expect(m.calls.some((call) => call.table === "receivable_read")).toBe(false);
  expect(m.rpc).not.toHaveBeenCalled();
  expect(screen.queryByText("Nợ hiện tại")).not.toBeInTheDocument();
});

it("adds outstanding receivables exactly, only for customers on the page", async () => {
  m.access.mockResolvedValue({ branchId: "b", branchName: "CN", permissions: new Set(["customers.read", "finance.ar.read"]) });
  render(await Page({ searchParams: Promise.resolve({}) }));
  expect(screen.getByText("9.007.199.254.741.000 ₫")).toBeInTheDocument();
  expect(screen.getByText("50.000.000 ₫")).toBeInTheDocument();
  expect(screen.getByText("0 ₫")).toBeInTheDocument();
  expect(m.calls).toContainEqual({ table: "receivable_read", method: "in", args: ["customer_id", ["c1", "c2"]] });
  expect(m.rpc).toHaveBeenCalledWith("customer_private_fields", { target_customer_ids: ["c1", "c2"] });
});

it("applies tier and type filters on the server", async () => {
  m.access.mockResolvedValue({ branchId: "b", branchName: "CN", permissions: new Set(["customers.read"]) });
  render(await Page({ searchParams: Promise.resolve({ tier: "DEFAULT", type: "INDIVIDUAL", state: "INACTIVE" }) }));
  const customerCalls = m.calls.filter((call) => call.table === "customers");
  expect(customerCalls).toContainEqual({ table: "customers", method: "is", args: ["tier_code", null] });
  expect(customerCalls).toContainEqual({ table: "customers", method: "eq", args: ["customer_type", "INDIVIDUAL"] });
  expect(customerCalls).toContainEqual({ table: "customers", method: "eq", args: ["active", false] });
  expect(screen.getByRole("link", { name: "Xóa lọc" })).toHaveAttribute("href", "/admin/customers");
});
