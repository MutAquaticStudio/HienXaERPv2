import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn(), access: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: m.access }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => ({ rpc: m.rpc })) }));
import { savePurchasePriceBookAction, setSupplierMaterialsAction } from "./purchase-book-actions";

const id = (n: number) => `10000000-0000-4000-8000-00000000000${n}`;
const book = (patch: Record<string, unknown> = {}) => ({ operationId: id(1), effectiveDate: "2099-01-01",
  items: [{ supplierId: id(2), materialId: id(3), uomId: id(4), costVnd: "86000", supersedesId: id(5), expectedVersion: 2 }, { supplierId: id(2), materialId: id(6), uomId: id(4), costVnd: "98000" }], ...patch });
beforeEach(() => { vi.clearAllMocks(); m.access.mockResolvedValue({ branchId: "branch" }); m.rpc.mockResolvedValue({ data: { count: 2 }, error: null }); });

it("saves the book in one call for the chosen day, only with the right to enter purchase prices (D61)", async () => {
  expect(await savePurchasePriceBookAction(book())).toMatchObject({ success: true, count: 2 });
  expect(m.access).toHaveBeenCalledWith("purchasing.price.manage");
  expect(m.rpc).toHaveBeenCalledWith("save_purchase_price_book", { target_branch_id: "branch", effective_from: "2099-01-01T00:00:00+07:00", change_reason: "Cập nhật bảng giá mua", operation_id: id(1),
    items: [{ supplier_id: id(2), material_id: id(3), purchase_uom_id: id(4), unit_cost_vnd: "86000", supersedes_id: id(5), expected_version: 2 },
      { supplier_id: id(2), material_id: id(6), purchase_uom_id: id(4), unit_cost_vnd: "98000" }] });
});

it("refuses a past day and bad prices before calling the database, and names refusals in Vietnamese", async () => {
  expect((await savePurchasePriceBookAction(book({ effectiveDate: "2020-01-01" }))).message).toBe("Ngày áp dụng không được trước hôm nay.");
  expect((await savePurchasePriceBookAction(book({ items: [{ supplierId: id(2), materialId: id(3), uomId: id(4), costVnd: "0" }] }))).success).toBe(false);
  expect(m.rpc).not.toHaveBeenCalled();
  m.rpc.mockResolvedValue({ data: null, error: { code: "PT409", message: "stale_price_rule" } });
  expect((await savePurchasePriceBookAction(book())).message).toContain("vừa được người khác thay đổi");
  m.rpc.mockResolvedValue({ data: null, error: { code: "08006", message: "connection lost" } });
  expect(await savePurchasePriceBookAction(book())).toMatchObject({ success: false, outcomeUnknown: true });
});

it("assigns and unassigns suppliers of a material", async () => {
  m.rpc.mockResolvedValue({ data: { count: 2 }, error: null });
  const result = await setSupplierMaterialsAction({ operationId: id(1), items: [{ supplierId: id(2), materialId: id(3), uomId: id(4), active: true }, { supplierId: id(5), materialId: id(3), active: false }] });
  expect(result).toMatchObject({ success: true, message: "Đã gán 1, bỏ gán 1." });
  expect(m.rpc).toHaveBeenCalledWith("set_supplier_material_assignments", { target_branch_id: "branch", operation_id: id(1),
    items: [{ supplier_id: id(2), material_id: id(3), active: true, purchase_uom_id: id(4) }, { supplier_id: id(5), material_id: id(3), active: false }] });
  // Assigning needs a unit.
  expect((await setSupplierMaterialsAction({ operationId: id(1), items: [{ supplierId: id(2), materialId: id(3), active: true }] })).success).toBe(false);
});
