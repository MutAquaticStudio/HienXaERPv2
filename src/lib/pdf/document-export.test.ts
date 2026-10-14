// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BusinessDocumentInput } from "./business-document";
import { AppError } from "@/lib/core/errors";
const state = vi.hoisted(() => ({ permissions: new Set<string>(), tables: {} as Record<string, Record<string, unknown>[]>, queries: [] as { table: string; filters: Record<string, unknown>; range?: number[] }[], failure: "", authError: null as Error | null, changed: false }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/access/context", () => ({ resolveInternalAccess: async () => {
  if (state.authError) throw state.authError;
  return { kind: "internal", employeeActive: true, branchId: "branch-a", branchName: "Hiền Xa", permissions: state.permissions };
} }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({ from: (table: string) => {
  const query = { table, filters: {} as Record<string, unknown>, range: undefined as number[] | undefined };
  const result = () => {
    state.queries.push(query);
    if (state.failure === table) return { data: null, error: new Error("dependency failed") };
    let rows = (state.tables[table] || []).filter(r => Object.entries(query.filters).every(([k, v]) => Array.isArray(v) ? v.includes(r[k]) : r[k] === v));
    if (state.changed && table === "sales_order_read" && state.queries.filter(q => q.table === table).length > 1) rows = rows.map(r => ({ ...r, commercial_state: "CONFIRMED" }));
    if (query.range) rows = rows.slice(query.range[0], query.range[1] + 1);
    return { data: rows, error: null };
  };
  const builder = {
    select: () => builder,
    eq: (k: string, v: unknown) => { query.filters[k] = v; return builder; },
    in: (k: string, v: unknown[]) => { query.filters[k] = v; return builder; },
    order: () => builder,
    range: (a: number, b: number) => { query.range = [a, b]; return builder; },
    maybeSingle: async () => { const r = result(); return { ...r, data: r.data?.[0] ?? null }; },
    then: (resolve: (r: ReturnType<typeof result>) => void) => resolve(result()),
  };
  return builder;
} }) }));
const render = vi.hoisted(() => vi.fn(async (input: BusinessDocumentInput) => { void input; return new Uint8Array([37, 80, 68, 70]); }));
vi.mock("./business-document", () => ({ createBusinessDocument: render }));
import { exportBusinessDocument } from "./document-export";
const id = "791fc7ea-bc11-4047-9bda-d3b2df9e74a0";
beforeEach(() => {
  state.permissions = new Set(["orders.read", "purchasing.read", "delivery.read"]);
  state.queries = []; state.failure = ""; state.authError = null; state.changed = false; render.mockClear();
  const header = { id, branch_id: "branch-a", commercial_state: "DRAFT", order_number: "SO-MAU", customer_name_snapshot: "Khách mẫu", site_name_snapshot: "Điểm mẫu", delivery_address_snapshot: "Địa chỉ mẫu", created_at: "2026-10-14T00:00:00Z", requested_delivery_at: null, total_vnd: "1000000" };
  state.tables = {
    sales_order_read: [header], sales_orders: [{ id, branch_id: "branch-a", draft_version: 1, commercial_terms: null }],
    sales_order_lines: [{ sales_order_id: id, line_number: 1, material_name_snapshot: "Vật tư mẫu", ordered_uom_id: "uom", quantity: "1.234567", unit_price_vnd: "1000000", line_total_vnd: "1234567" }],
    units_of_measure: [{ id: "uom", symbol: "TẤN" }],
  };
});
describe("Document export boundaries", () => {
  it("rejects unauthenticated and locked accounts before reading documents", async () => {
    for (const status of [401, 403] as const) {
      state.authError = new AppError({ code: status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN", status, message: "Không có quyền." });
      expect((await exportBusinessDocument("sales", id)).status).toBe(status);
    }
    expect(state.queries).toEqual([]); expect(render).not.toHaveBeenCalled();
  });
  it("requires the document permission independently of login", async () => {
    state.permissions.clear();
    expect((await exportBusinessDocument("sales", id)).status).toBe(403);
    expect(state.queries).toEqual([]);
  });
  it("does not export another branch even when RLS yields its header", async () => {
    state.tables.sales_order_read[0].branch_id = "branch-b";
    expect((await exportBusinessDocument("sales", id)).status).toBe(404);
    expect(render).not.toHaveBeenCalled();
  });
  it("fails closed on line or UOM failures, rather than issuing an incomplete PDF", async () => {
    for (const table of ["sales_order_lines", "units_of_measure"]) {
      state.failure = table;
      expect((await exportBusinessDocument("sales", id)).status).toBe(503);
    }
    expect(render).not.toHaveBeenCalled();
  });
  it("rejects changed source states instead of mixing old header and new lines", async () => {
    state.changed = true;
    expect((await exportBusinessDocument("sales", id)).status).toBe(409);
    expect(render).not.toHaveBeenCalled();
  });
  it("exports all501 lines across API pagination and uses private no-store response", async () => {
    state.tables.sales_order_lines = Array.from({ length: 501 }, (_, i) => ({ ...state.tables.sales_order_lines[0], line_number: i + 1 }));
    const response = await exportBusinessDocument("sales", id);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(render.mock.calls[0][0].rows).toHaveLength(501);
    expect(state.queries.filter(q => q.table === "sales_order_lines").map(q => q.range)).toEqual([[0, 499], [500, 999]]);
  });
  it("rejects malformed document IDs", async () => {
    expect((await exportBusinessDocument("sales", "bad-id")).status).toBe(400);
    expect(state.queries).toEqual([]);
  });
});
