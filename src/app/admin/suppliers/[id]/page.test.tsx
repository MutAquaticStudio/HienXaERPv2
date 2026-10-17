import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ access: vi.fn(), calls: [] as { table: string; method: string; args: unknown[] }[], tables: {} as Record<string, unknown[]>, rpc: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); }, useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: m.access }));
vi.mock("@/modules/catalog/editor-data", () => ({
  catalogRecordProps: async () => ({ kind: "suppliers", record: { id: "s1" }, options: {}, permissions: [], scope: "s" }),
  catalogCreateProps: async () => ({ kind: "sites", options: {}, permissions: [], scope: "s" }),
}));
vi.mock("@/modules/catalog/catalog-dialog", () => ({
  CatalogEditButton: ({ label }: { label: string }) => <button type="button">{label}</button>,
  CatalogCreateButton: ({ label, initial }: { label: string; initial?: Record<string, string> }) => <button type="button" data-customer={initial?.customer_id}>{label}</button>,
}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({
  from(table: string) {
    const rows = m.tables[table] ?? [];
    const query: Record<string, unknown> = {};
    for (const method of ["select", "eq", "or", "in", "gt", "order", "range", "limit", "is"]) query[method] = (...args: unknown[]) => { m.calls.push({ table, method, args }); return query; };
    query.maybeSingle = () => Promise.resolve({ data: rows[0] ?? null, error: null });
    query.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows, error: null, count: rows.length }).then(resolve);
    return query;
  },
  rpc(name: string, args: unknown) {
    m.calls.push({ table: `rpc:${name}`, method: "rpc", args: [args] });
    const result = Promise.resolve(m.rpc(name, args));
    return Object.assign(result, { select: () => result });
  },
}) }));
import Page from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  m.calls = [];
  m.tables = {
    suppliers: [{ id: "s1", code: "NCC01", name: "Xi măng Bút Sơn", phone: "0912", email: null, tax_code: "0101", address_text: "Hà Nam", payment_terms_days: 30, active: true }],
    payable_read: [
      { id: "p1", source_label: "Nhập kho đã xác minh", original_amount_vnd: "9000000", outstanding_amount_vnd: "6000000", due_date: "2026-10-01", state: "OVERDUE", recorded_at: "2026-09-01T00:00:00Z" },
      { id: "p2", source_label: "Nhập kho đã xác minh", original_amount_vnd: "2000000", outstanding_amount_vnd: "2000000", due_date: "2026-11-01", state: "OPEN", recorded_at: "2026-10-01T00:00:00Z" },
    ],
    purchase_order_read: [
      { id: "po1", purchase_order_number: "PO-1", state: "CONFIRMED", destination_type: "WAREHOUSE", destination_name_snapshot: "Kho chính", expected_at: null, created_at: "2026-10-10T00:00:00Z", total_cost_vnd: "7000000" },
      { id: "po2", purchase_order_number: "PO-2", state: "DRAFT", destination_type: "WAREHOUSE", destination_name_snapshot: "Kho chính", expected_at: null, created_at: "2026-10-11T00:00:00Z", total_cost_vnd: "1000000" },
    ],
    supplier_contacts: [{ id: "k1", name: "Chị Hoa", phone: "0977", email: null, role_label: "Kinh doanh" }],
    payment_read: [],
  };
});
afterEach(cleanup);
const page = async (tab?: string) => render(await Page({ params: Promise.resolve({ id: "s1" }), searchParams: Promise.resolve(tab ? { tab } : {}) } as never));

it("shows what is owed and open with the supplier, then the contacts tab", async () => {
  m.access.mockResolvedValue({ branchId: "b", permissions: new Set(["suppliers.read", "suppliers.manage", "finance.ap.read", "purchasing.read", "purchasing.price.read"]) });
  await page();
  const metrics = screen.getByRole("region", { name: "Chỉ số nhà cung cấp" });
  expect(within(metrics).getByText("8.000.000 ₫")).toBeInTheDocument();
  expect(within(metrics).getByText("6.000.000 ₫")).toBeInTheDocument();
  expect(within(metrics).getByText("7.000.000 ₫")).toBeInTheDocument();
  expect(screen.getByText("Chị Hoa")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Sửa" })).toBeInTheDocument();
  expect(m.calls.some((call) => call.table === "supplier_contacts")).toBe(true);
});

it("lists purchase orders only on their tab and hides prices without price rights", async () => {
  m.access.mockResolvedValue({ branchId: "b", permissions: new Set(["suppliers.read", "purchasing.read"]) });
  await page("purchases");
  expect(screen.getByRole("link", { name: "PO-1" })).toHaveAttribute("href", "/admin/purchase-orders/po1");
  expect(screen.queryByText("Tổng tiền")).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Công nợ & thanh toán" })).not.toBeInTheDocument();
  expect(m.calls.some((call) => call.table === "supplier_contacts")).toBe(false);
});
