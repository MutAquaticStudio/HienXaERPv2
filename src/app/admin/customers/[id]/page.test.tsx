import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ access: vi.fn(), calls: [] as { table: string; method: string; args: unknown[] }[], tables: {} as Record<string, unknown[]>, rpc: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); }, useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: m.access }));
vi.mock("@/modules/catalog/editor-data", () => ({
  catalogRecordProps: async () => ({ kind: "customers", record: { id: "c1" }, options: {}, permissions: [], scope: "s" }),
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

const customer = { id: "c1", code: "KH01", display_name: "Công ty Xây dựng An Phát", customer_type: "BUSINESS", phone: "0912", email: null, address_text: "Hà Nội", tax_code: "0101", tier_code: "SI", payment_terms_days: 30, active: true };
beforeEach(() => {
  vi.clearAllMocks();
  m.calls = [];
  m.tables = {
    customers: [customer],
    customer_price_groups: [{ name: "Khách sỉ" }],
    customer_sites: [{ id: "s1", code: "CT1", name: "Nhà xưởng Bắc Ninh", address_text: "KCN Quế Võ", receiver_name: "Anh Nam", receiver_phone: "0988", receiving_window: "7h–17h", access_note: null, active: true }],
    sales_order_read: [
      { id: "o1", order_number: "SO-1", commercial_state: "CONFIRMED", fulfillment_state: "PARTIAL", payment_state: "UNPAID", total_vnd: "12000000", site_name_snapshot: "Nhà xưởng Bắc Ninh", created_at: "2026-10-10T03:00:00Z" },
      { id: "o2", order_number: "SO-2", commercial_state: "CLOSED", fulfillment_state: "FULFILLED", payment_state: "PAID", total_vnd: "3000000", site_name_snapshot: "Nhà xưởng Bắc Ninh", created_at: "2026-10-01T03:00:00Z" },
      { id: "o3", order_number: "SO-3", commercial_state: "DRAFT", fulfillment_state: "NOT_STARTED", payment_state: "UNPAID", total_vnd: "9000000", site_name_snapshot: "Nhà xưởng Bắc Ninh", created_at: "2026-10-12T03:00:00Z" },
    ],
    receivable_read: [{ id: "r1", source_label: "Giao hàng đã xác minh", site_name: "Nhà xưởng Bắc Ninh", due_date: "2026-10-01", original_amount_vnd: "5000000", outstanding_amount_vnd: "4000000", state: "OVERDUE", recorded_at: "2026-09-01T00:00:00Z" }],
    payment_read: [],
  };
  m.rpc.mockImplementation((name: string) => name === "customer_credit_summary"
    ? { data: { credit_limit_vnd: 50000000, receivable_vnd: 4000000, overdue_vnd: 4000000, committed_vnd: 12000000, available_vnd: 34000000 }, error: null }
    : { data: [{ customer_id: "c1", internal_note: "Gọi trước khi giao" }], error: null });
});
afterEach(cleanup);
const page = async (tab?: string) => render(await Page({ params: Promise.resolve({ id: "c1" }), searchParams: Promise.resolve(tab ? { tab } : {}) } as never));

it("shows debt, sales and credit at a glance and opens on the profile and sites tab", async () => {
  m.access.mockResolvedValue({ branchId: "b", permissions: new Set(["customers.read", "customers.manage", "finance.ar.read", "finance.payment.post", "orders.read", "orders.create"]) });
  await page();
  const metrics = screen.getByRole("region", { name: "Chỉ số khách hàng" });
  expect(within(metrics).getAllByText("4.000.000 ₫")).toHaveLength(2);
  expect(within(metrics).getByText("15.000.000 ₫")).toBeInTheDocument();
  expect(within(metrics).getByText("1")).toBeInTheDocument();
  expect(within(metrics).getByText("34.000.000 ₫")).toBeInTheDocument();
  expect(screen.getByText(/Nhóm giá Khách sỉ/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Thông tin & công trình/ })).toHaveAttribute("aria-current", "page");
  expect(screen.getByText("Nhà xưởng Bắc Ninh")).toBeInTheDocument();
  expect(screen.getByText("Gọi trước khi giao")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "+ Công trình" })).toHaveAttribute("data-customer", "c1");
  expect(screen.getByRole("link", { name: "Ghi thu" })).toHaveAttribute("href", "/admin/receivables?customer=c1");
  expect(m.calls.some((call) => call.table === "receivable_read")).toBe(false);
});

it("reads only the open tab's records", async () => {
  m.access.mockResolvedValue({ branchId: "b", permissions: new Set(["customers.read", "finance.ar.read", "orders.read"]) });
  await page("debts");
  expect(screen.getByRole("link", { name: "Công nợ & thanh toán" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByText("Quá hạn")).toBeInTheDocument();
  expect(m.calls.some((call) => call.table === "receivable_read")).toBe(true);
  expect(m.calls.some((call) => call.table === "customer_sites" && call.method === "order")).toBe(false);
  cleanup();
  m.calls = [];
  await page("orders");
  expect(screen.getByRole("link", { name: "SO-1" })).toHaveAttribute("href", "/admin/orders/o1");
  expect(screen.getByText("Đã giao một phần")).toBeInTheDocument();
});

it("hides amounts and tabs the actor may not see", async () => {
  m.access.mockResolvedValue({ branchId: "b", permissions: new Set(["customers.read"]) });
  await page("debts");
  expect(m.calls.some((call) => call.table === "rpc:customer_credit_summary")).toBe(false);
  expect(screen.queryByRole("link", { name: "Công nợ & thanh toán" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Thông tin & công trình/ })).toHaveAttribute("aria-current", "page");
  expect(within(screen.getByRole("region", { name: "Chỉ số khách hàng" })).getAllByText("—")).toHaveLength(5);
  expect(screen.queryByRole("button", { name: "Sửa" })).not.toBeInTheDocument();
});
