import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn(), access: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: m.access }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => ({ rpc: m.rpc })) }));
import { savePriceBookAction } from "./price-book-actions";

const ids = { op: "10000000-0000-4000-8000-000000000001", m1: "10000000-0000-4000-8000-000000000002", uom: "10000000-0000-4000-8000-000000000003", rule: "10000000-0000-4000-8000-000000000004" };
const input = (change: Record<string, unknown> = {}) => ({ operationId: ids.op, reason: "NCC tăng giá", effectiveDate: "2099-01-01",
  items: [{ materialId: ids.m1, uomId: ids.uom, priceVnd: "105000", supersedesId: ids.rule, expectedVersion: 3 }], ...change });
beforeEach(() => {
  vi.clearAllMocks();
  m.access.mockResolvedValue({ branchId: "branch" });
  m.rpc.mockResolvedValue({ data: { count: 1 }, error: null });
});

it("sends one atomic batch with exact text prices and the client operation ID", async () => {
  expect(await savePriceBookAction(input())).toMatchObject({ success: true, count: 1 });
  expect(m.access).toHaveBeenCalledWith("pricing.manage");
  expect(m.rpc).toHaveBeenCalledWith("save_pricing_rules_batch", { target_branch_id: "branch", operation_id: ids.op, change_reason: "NCC tăng giá",
    effective_from: "2099-01-01T00:00:00+07:00", items: [{ material_id: ids.m1, price_uom_id: ids.uom, unit_price_vnd: "105000", supersedes_id: ids.rule, expected_version: 3 }] });
});

it("saves without a reason and records a plain description instead (FB7)", async () => {
  expect(await savePriceBookAction(input({ reason: undefined }))).toMatchObject({ success: true });
  expect(m.rpc).toHaveBeenCalledWith("save_pricing_rules_batch", expect.objectContaining({ change_reason: "Cập nhật giá" }));
  await savePriceBookAction(input({ reason: "x" }));
  expect(m.rpc).toHaveBeenLastCalledWith("save_pricing_rules_batch", expect.objectContaining({ change_reason: "Cập nhật giá: x" }));
});

it("rejects bad input before any permission or database call", async () => {
  for (const bad of [input({ items: [] }), input({ items: [{ materialId: ids.m1, uomId: ids.uom, priceVnd: "0" }] }),
    input({ items: [{ materialId: ids.m1, uomId: ids.uom, priceVnd: "1000", supersedesId: ids.rule }] }), input({ effectiveDate: "2020-01-01" })]) {
    expect((await savePriceBookAction(bad)).success).toBe(false);
  }
  expect(m.rpc).not.toHaveBeenCalled();
});

it("explains a concurrent change in Vietnamese and states nothing was saved", async () => {
  m.rpc.mockResolvedValue({ data: null, error: { message: "stale_price_rule", code: "PT409" } });
  const result = await savePriceBookAction(input());
  expect(result.success).toBe(false);
  expect(result.message).toContain("chưa có giá nào được lưu");
});
