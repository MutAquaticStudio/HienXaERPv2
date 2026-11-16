import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ permissions: new Set<string>(), tables: {} as Record<string, unknown[]>, ranges: [] as unknown[][] }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), usePathname: () => "/admin/purchase-orders" }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: async () => ({ branchId: "branch", permissions: m.permissions }) }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({
  from(table: string) {
    const filters: Record<string, unknown> = {};
    const query: Record<string, unknown> = {};
    for (const method of ["select", "or", "in", "order", "range", "limit", "neq"]) query[method] = () => query;
    query.eq = (column: string, value: unknown) => { filters[column] = value; return query; };
    for (const method of ["gte", "lt"]) query[method] = (column: string, value: string) => { m.ranges.push([table, method, column, value]); return query; };
    query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
      const rows = (m.tables[table] ?? []).filter((row) => (!filters.state || (row as { state?: string }).state === filters.state)
        && (!filters.supplier_id || (row as { supplier_id?: string }).supplier_id === filters.supplier_id));
      return Promise.resolve({ data: rows, error: null, count: rows.length }).then(resolve, reject);
    };
    return query;
  },
}) }));

import Page from "./page";

const po = { id: "p1", purchase_order_number: "PO-2026-000044", supplier_id: "s1", supplier_name_snapshot: "NCC Xi măng Hà Tiên", destination_type: "WAREHOUSE", destination_name_snapshot: "Kho chính",
  source_sales_order_id: null, state: "CONFIRMED", expected_at: null, created_at: "2026-10-23T01:00:00Z", total_cost_vnd: "8200000" };
beforeEach(() => {
  m.ranges = [];
  m.permissions = new Set(["purchasing.read", "purchasing.price.read", "purchasing.create"]);
  m.tables = {
    purchase_order_read: [po],
    purchase_order_line_read: [{ purchase_order_id: "p1", id: "l1", material_name_snapshot: "Xi măng PCB40", quantity: "100", ordered_uom_id: "u1", line_total_cost_vnd: "8200000" }],
    units_of_measure: [{ id: "u1", symbol: "bao" }],
    purchase_order_dispatches: [],
    suppliers: [{ id: "s1", name: "NCC Xi măng Hà Tiên", active: true }, { id: "s2", name: "NCC Thép Hòa Phát", active: true }, { id: "s3", name: "NCC Gạch Đồng Tâm", active: false }],
  };
});
afterEach(cleanup);

it("filters on the left and shows the lines of an order under its row", async () => {
  render(await Page({ searchParams: Promise.resolve({}) }));
  expect(screen.getByRole("radio", { name: /Đang nhận hàng/ }).closest("label")).toHaveTextContent("1");
  expect(screen.getByText("Chưa gửi")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Xem nhanh PO-2026-000044" }));
  expect(screen.getByText(/Xi măng PCB40 · 100 bao/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Mở đơn mua" })).toHaveAttribute("href", "/admin/purchase-orders/p1");
});

it("hides costs from staff without the price permission", async () => {
  m.permissions = new Set(["purchasing.read"]);
  render(await Page({ searchParams: Promise.resolve({}) }));
  expect(screen.queryByText("8.200.000 ₫")).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "+ Tạo đơn mua" })).not.toBeInTheDocument();
});

it("filters by supplier: \"Tất cả\" and the branch's suppliers by name, a stopped one marked, an unknown id ignored", async () => {
  m.tables.purchase_order_read = [po, { ...po, id: "p2", purchase_order_number: "PO-2026-000043", supplier_id: "s2", supplier_name_snapshot: "NCC Thép Hòa Phát" }];
  render(await Page({ searchParams: Promise.resolve({ supplier: "s2", state: "ALL" }) }));
  const filters = screen.getByRole("form", { name: "Bộ lọc đơn mua" });
  const select = within(filters).getByRole("combobox", { name: "Nhà cung cấp" });
  expect(select).toHaveValue("s2");
  expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual(["Tất cả", "NCC Xi măng Hà Tiên", "NCC Thép Hòa Phát", "NCC Gạch Đồng Tâm (ngừng)"]);
  expect(screen.getByText("PO-2026-000043")).toBeInTheDocument();
  expect(screen.queryByText("PO-2026-000044")).not.toBeInTheDocument();
  expect(within(filters).getByRole("radio", { name: /Đang nhận hàng/ }).closest("label")).toHaveTextContent("1");
  expect(within(filters).getByRole("link", { name: "Xóa lọc" })).toHaveAttribute("href", "/admin/purchase-orders");
  cleanup();
  render(await Page({ searchParams: Promise.resolve({ supplier: "not-a-supplier" }) }));
  expect(screen.getByRole("combobox", { name: "Nhà cung cấp" })).toHaveValue("");
  expect(screen.getByText("PO-2026-000044")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Xóa lọc" })).not.toBeInTheDocument();
});

it("filters by the creation day and by the expected receiving day, each from a day to a day, and keeps them in the pager and the form", async () => {
  m.tables.purchase_order_read = Array.from({ length: 30 }, (_, index) => ({ ...po, id: `p${index}`, purchase_order_number: `PO-2026-${String(index).padStart(6, "0")}` }));
  render(await Page({ searchParams: Promise.resolve({ supplier: "s1", createdFrom: "2026-11-01", createdTo: "2026-11-13", deliveryFrom: "2026-11-14", deliveryTo: "not-a-date" }) }));
  const filters = screen.getByRole("form", { name: "Bộ lọc đơn mua" });
  expect(within(filters).getByLabelText("Ngày tạo từ")).toHaveValue("2026-11-01");
  expect(within(filters).getByLabelText("Ngày tạo đến")).toHaveValue("2026-11-13");
  expect(within(filters).getByLabelText("Ngày nhận từ")).toHaveValue("2026-11-14");
  expect(within(filters).getByLabelText("Ngày nhận đến")).toHaveValue("");
  const orders = m.ranges.filter((range) => range[0] === "purchase_order_read");
  expect(orders).toContainEqual(["purchase_order_read", "gte", "created_at", "2026-10-31T17:00:00.000Z"]);
  expect(orders).toContainEqual(["purchase_order_read", "lt", "created_at", "2026-11-13T17:00:00.000Z"]);
  expect(orders).toContainEqual(["purchase_order_read", "gte", "expected_at", "2026-11-13T17:00:00.000Z"]);
  expect(orders.some((range) => range[1] === "lt" && range[2] === "expected_at")).toBe(false);
  // The list and every status count carry the same day conditions.
  expect(orders.filter((range) => range[2] === "created_at" && range[1] === "gte")).toHaveLength(7);
  const next = screen.getAllByRole("link").find((link) => link.getAttribute("href")?.includes("page=2"))!;
  const params = new URL(next.getAttribute("href")!, "http://x").searchParams;
  expect(Object.fromEntries(params)).toMatchObject({ supplier: "s1", createdFrom: "2026-11-01", createdTo: "2026-11-13", deliveryFrom: "2026-11-14" });
  expect(params.has("deliveryTo")).toBe(false);
  expect(within(filters).getByRole("link", { name: "Xóa lọc" })).toBeInTheDocument();
});

it("applies no supplier or date condition when none is chosen", async () => {
  render(await Page({ searchParams: Promise.resolve({}) }));
  expect(m.ranges).toEqual([]);
  expect(screen.getByRole("combobox", { name: "Nhà cung cấp" })).toHaveValue("");
});
