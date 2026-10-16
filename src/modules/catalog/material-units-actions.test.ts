import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn(), access: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/access/context", () => ({ requireInternalAccess: m.access }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => ({ rpc: m.rpc })) }));
vi.mock("@/modules/pricing/request-clock", () => ({ readPricingClock: async () => Date.now() }));

import { saveMaterialUnitsAction } from "./material-units-actions";

const ids = { op: "11111111-1111-4111-8111-111111111111", material: "22222222-2222-4222-8222-222222222222", tan: "33333333-3333-4333-8333-333333333333",
  bao: "44444444-4444-4444-8444-444444444444", conv: "55555555-5555-4555-8555-555555555555", rule: "66666666-6666-4666-8666-666666666666" };
const future = "2099-01-01";
beforeEach(() => { vi.clearAllMocks(); m.access.mockResolvedValue({ branchId: "branch-a", permissions: new Set(["catalog.manage", "pricing.manage"]) }); m.rpc.mockResolvedValue({ data: {}, error: null }); });

it("sends one command with new units, stopped units and prices", async () => {
  const result = await saveMaterialUnitsAction({ operationId: ids.op, materialId: ids.material, reason: "Thêm bán theo tấn", effectiveDate: future,
    addUnits: [{ uomId: ids.tan, ratio: "1000", type: "EXACT", sourceNote: "" }], stopConversionIds: [ids.conv],
    prices: [{ uomId: ids.tan, priceVnd: "6000000" }, { uomId: ids.bao, priceVnd: "300000", supersedesId: ids.rule, expectedVersion: 2 }] });
  expect(result.success).toBe(true);
  expect(m.rpc).toHaveBeenCalledWith("save_material_units", {
    target_branch_id: "branch-a", target_material_id: ids.material,
    add_units: [{ uom_id: ids.tan, numerator: "1000", denominator: "1", conversion_type: "EXACT", source_note: null }],
    stop_conversion_ids: [ids.conv],
    prices: [{ price_uom_id: ids.tan, unit_price_vnd: "6000000" }, { price_uom_id: ids.bao, unit_price_vnd: "300000", supersedes_id: ids.rule, expected_version: 2 }],
    effective_from: `${future}T00:00:00+07:00`, change_reason: "Thêm bán theo tấn", operation_id: ids.op,
  });
});

it("needs a source note for estimated units and sends no price date when no price changes", async () => {
  const estimated = { operationId: ids.op, materialId: ids.material, reason: "Thêm xe bé", effectiveDate: future, stopConversionIds: [], prices: [],
    addUnits: [{ uomId: ids.tan, ratio: "3", type: "ESTIMATED", sourceNote: "" }] };
  expect((await saveMaterialUnitsAction(estimated)).message).toContain("ghi nguồn");
  expect(m.rpc).not.toHaveBeenCalled();
  await saveMaterialUnitsAction({ ...estimated, addUnits: [{ uomId: ids.tan, ratio: "3", type: "ESTIMATED", sourceNote: "xe bé ≈ 3 m³ theo thỏa thuận" }] });
  expect(m.rpc.mock.calls[0][1]).toMatchObject({ effective_from: null, add_units: [{ source_note: "xe bé ≈ 3 m³ theo thỏa thuận" }] });
});

it("explains database refusals in Vietnamese and keeps an unknown outcome retryable", async () => {
  const input = { operationId: ids.op, materialId: ids.material, reason: "Thêm bao", effectiveDate: future, stopConversionIds: [], prices: [],
    addUnits: [{ uomId: ids.bao, ratio: "50", type: "PACKAGING", sourceNote: "" }] };
  m.rpc.mockResolvedValueOnce({ data: null, error: { message: "unit_already_exists", code: "23505" } });
  expect((await saveMaterialUnitsAction(input)).message).toContain("Đơn vị này đã có");
  m.rpc.mockRejectedValueOnce(new Error("socket hang up"));
  expect(await saveMaterialUnitsAction(input)).toMatchObject({ success: false, outcomeUnknown: true });
});
