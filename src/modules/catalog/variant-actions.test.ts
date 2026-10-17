import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn(), access: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/access/context", () => ({ requireInternalAccess: m.access }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => ({ rpc: m.rpc })) }));

import { saveVariantGroupAction } from "./variant-actions";

const ids = { op: "11111111-1111-4111-8111-111111111111", group: "22222222-2222-4222-8222-222222222222", materialGroup: "33333333-3333-4333-8333-333333333333",
  kg: "44444444-4444-4444-8444-444444444444", bao: "55555555-5555-4555-8555-555555555555", old: "66666666-6666-4666-8666-666666666666" };
const future = "2099-01-01";
const base = {
  operationId: ids.op, groupId: ids.group, reason: "Tạo xi măng Bút Sơn", effectiveDate: future,
  group: { name: "Xi măng Bút Sơn", attributeNames: ["Mác"], active: true }, expected: null,
  template: { groupId: ids.materialGroup, baseUomId: ids.kg, specification: "", saleEnabled: true, purchaseEnabled: true,
    units: [{ uomId: ids.bao, numerator: "50", denominator: "1", type: "PACKAGING" as const, sourceNote: "" }] },
};
beforeEach(() => { vi.clearAllMocks(); m.access.mockResolvedValue({ branchId: "branch-a", permissions: new Set(["catalog.manage", "pricing.manage"]) }); m.rpc.mockResolvedValue({ data: {}, error: null }); });

it("creates the group, its variants, the shared unit and prices in one command", async () => {
  const result = await saveVariantGroupAction({ ...base, variants: [
    { attributes: { Mác: "PCB30" }, code: "bs30", name: "Xi măng Bút Sơn PCB30", prices: [{ uomId: ids.bao, priceVnd: "90000" }, { uomId: ids.kg, priceVnd: "1800" }] },
    { attributes: { Mác: "PCB40" }, code: "BS40", name: "Xi măng Bút Sơn PCB40", prices: [] },
    { materialId: ids.old, attributes: { Mác: "PCB50" } },
  ] });
  expect(result).toMatchObject({ success: true, groupId: ids.group });
  expect(result.message).toContain("tạo 2 loại");
  expect(m.rpc).toHaveBeenCalledWith("save_material_variant_group", {
    target_branch_id: "branch-a", target_group_id: ids.group,
    group_values: { name: "Xi măng Bút Sơn", attribute_names: ["Mác"], active: true }, expected_group: null,
    template: { group_id: ids.materialGroup, base_uom_id: ids.kg, specification: null, sale_enabled: true, purchase_enabled: true,
      units: [{ uom_id: ids.bao, numerator: "50", denominator: "1", conversion_type: "PACKAGING", source_note: null }] },
    variants: [
      { attributes: { Mác: "PCB30" }, code: "BS30", name: "Xi măng Bút Sơn PCB30", prices: [{ price_uom_id: ids.bao, unit_price_vnd: "90000" }, { price_uom_id: ids.kg, unit_price_vnd: "1800" }] },
      { attributes: { Mác: "PCB40" }, code: "BS40", name: "Xi măng Bút Sơn PCB40", prices: [] },
      { material_id: ids.old, attributes: { Mác: "PCB50" } },
    ],
    effective_from: `${future}T00:00:00+07:00`, change_reason: "Tạo xi măng Bút Sơn", operation_id: ids.op,
  });
});

it("detaches members and sends no price date without prices", async () => {
  await saveVariantGroupAction({ ...base, template: null, expected: { name: "Xi măng Bút Sơn", attribute_names: ["Mác"], active: true },
    variants: [{ materialId: ids.old, detach: true }] });
  expect(m.rpc.mock.calls[0][1]).toMatchObject({ template: null, variants: [{ material_id: ids.old, detach: true }], effective_from: null });
});

it("checks codes, templates and dates before calling the database", async () => {
  expect((await saveVariantGroupAction({ ...base, variants: [{ attributes: { Mác: "X" }, code: "B S", name: "Tên", prices: [] }] })).message).toContain("mã 2–32");
  expect((await saveVariantGroupAction({ ...base, template: null, variants: [{ attributes: { Mác: "X" }, code: "BSX", name: "Tên", prices: [] }] })).message).toContain("đơn vị cơ sở");
  expect((await saveVariantGroupAction({ ...base, effectiveDate: "2000-01-01", variants: [{ attributes: { Mác: "X" }, code: "BSX", name: "Tên", prices: [{ uomId: ids.kg, priceVnd: "1" }] }] })).message).toContain("không được trước hôm nay");
  expect(m.rpc).not.toHaveBeenCalled();
});

it("explains database refusals in Vietnamese and keeps an unknown outcome retryable", async () => {
  const input = { ...base, variants: [{ attributes: { Mác: "PCB30" }, code: "BS30", name: "Xi măng Bút Sơn PCB30", prices: [] }] };
  m.rpc.mockResolvedValueOnce({ data: null, error: { message: 'duplicate key value violates unique constraint "materials_code_key"', code: "23505" } });
  expect((await saveVariantGroupAction(input)).message).toContain("mã vật tư đã tồn tại");
  m.rpc.mockResolvedValueOnce({ data: null, error: { message: 'duplicate key value violates unique constraint "materials_variant_unique"', code: "23505" } });
  expect((await saveVariantGroupAction(input)).message).toContain("trùng thuộc tính");
  m.rpc.mockRejectedValueOnce(new Error("socket hang up"));
  expect(await saveVariantGroupAction(input)).toMatchObject({ success: false, outcomeUnknown: true });
});
