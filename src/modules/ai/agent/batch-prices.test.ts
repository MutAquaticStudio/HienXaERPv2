// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { checkPriceRows, updatePurchasePrices, type PriceInputs } from "./batch-prices";

const units = [{ id: "bao", code: "bao", name: "Bao", symbol: "bao" }, { id: "kg", code: "kg", name: "Kilogram", symbol: "kg" }, { id: "tan", code: "tan", name: "Tấn", symbol: "tấn" }];
const now = Date.parse("2026-11-05T05:00:00Z");
const data: PriceInputs = {
  materials: [{ id: "xm", code: "XM40", name: "Xi măng PCB40", base_uom_id: "kg" }, { id: "cat", code: "CATV", name: "Cát vàng", base_uom_id: "kg" }, { id: "cat2", code: "CATDEN", name: "Cát đen", base_uom_id: "kg" }],
  units, now, startsAt: Date.parse("2026-11-05T00:00:00+07:00"),
  assignments: [{ material_id: "xm", purchase_uom_id: "bao" }],
  conversions: [{ material_id: "xm", from_uom_id: "bao", to_uom_id: "kg" }, { material_id: "xm", from_uom_id: "tan", to_uom_id: "kg" }],
  rules: [{ id: "r1", material_id: "xm", purchase_uom_id: "bao", unit_cost_vnd: "80000", version: 2, active: true, effective_from: "2026-10-30T17:00:00Z", effective_to: null }],
};

describe("D64 Cập nhật giá mua", () => {
  it("matches material and unit (accent-insensitive), shows current → new, and supersedes the newest version", () => {
    const rows = checkPriceRows([{ hang: "xi mang pcb40", gia: "86.000" }, { hang: "XM40", don_vi: "Tấn", gia: "1700000" }, { hang: "Cát vàng", don_vi: "kg", gia: "300" }], data);
    expect(rows[0]).toMatchObject({ status: "CREATE", materialId: "xm", uomId: "bao", price: "86000", current: "80000", supersedesId: "r1", expectedVersion: 2 });
    expect(rows[1]).toMatchObject({ status: "CREATE", uomId: "tan", price: "1700000", current: null });
    expect(rows[1].supersedesId).toBeUndefined();
    expect(rows[2]).toMatchObject({ status: "CREATE", uomId: "kg", price: "300" });
  });

  it("skips unchanged, unknown, ambiguous, bad price, wrong unit and repeated rows, each with its reason", () => {
    const rows = checkPriceRows([
      { hang: "Xi măng PCB40", gia: "80000" }, { hang: "Gạch lạ", gia: "5000" }, { hang: "cát", gia: "1000" }, { hang: "XM40", gia: "abc" },
      { hang: "XM40", don_vi: "lít", gia: "5000" }, { hang: "Cát vàng", don_vi: "bao", gia: "5000" }, { hang: "Xi măng PCB40", gia: "90000" }, { hang: "XM40", gia: "91000" }, { hang: "", gia: "1" },
    ], data);
    expect(rows.map((row) => row.reason)).toEqual(["Giá không đổi (80.000 ₫)", "Không có vật tư này (hoặc không cho phép mua)", expect.stringContaining("Có nhiều vật tư khớp"), "Giá chưa đúng (số nguyên dương)",
      'Không có đơn vị "lít"', "bao không phải đơn vị mua của vật tư", "Trùng dòng 1", "Trùng dòng 1", "Thiếu tên hàng"]);
  });

  it("will not put a price in front of one already set for a later day", () => {
    const rows = checkPriceRows([{ hang: "XM40", gia: "99000" }], { ...data, rules: [{ ...data.rules[0], effective_from: "2026-11-10T00:00:00+07:00" }] });
    expect(rows[0]).toMatchObject({ status: "SKIP" });
    expect(rows[0].reason).toContain("sau ngày áp dụng");
  });

  it("saves one price per row with ids derived from the action, and keeps the card waiting when a row fails", async () => {
    const rpc = vi.fn(async (_name: string, args: { items: { material_id: string }[] }) => args.items[0].material_id === "cat" ? { error: { message: "stale_price_rule PT409" } } : { error: null });
    const context = { supabase: { rpc } as never, branchId: "b1", permissions: new Set(["purchasing.price.manage", "purchasing.price.read"]) };
    const rows = [
      { n: 1, label: "Xi măng", unit: "bao", uomId: "bao", materialId: "xm", price: "86000", current: "80000", supersedesId: "r1", expectedVersion: 2, status: "CREATE" },
      { n: 2, label: "Cát", unit: "kg", uomId: "kg", materialId: "cat", price: "300", current: null, status: "CREATE" },
      { n: 3, label: "Đá", unit: "kg", uomId: "da", materialId: "da", price: "100", current: null, status: "SKIP", reason: "Giá không đổi" },
    ];
    const actionId = "11111111-1111-4111-8111-111111111111";
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
    await expect(updatePurchasePrices.execute(context, { supplierId: "ncc", date, rows }, actionId)).rejects.toThrow("Đã xong 1/2 giá mua. Chưa làm được: dòng 2 Cát (giá vừa được người khác đổi)");
    const first = rpc.mock.calls[0][1] as unknown as Record<string, unknown>;
    expect(first).toMatchObject({ target_branch_id: "b1", effective_from: `${date}T00:00:00+07:00`,
      items: [{ supplier_id: "ncc", material_id: "xm", purchase_uom_id: "bao", unit_cost_vnd: "86000", supersedes_id: "r1", expected_version: 2 }] });
    const ops = rpc.mock.calls.map((call) => (call[1] as unknown as { operation_id: string }).operation_id);
    expect(ops[0]).not.toBe(ops[1]);
    await expect(updatePurchasePrices.execute(context, { supplierId: "ncc", date: "2020-01-01", rows }, actionId)).rejects.toThrow("Ngày áp dụng đã qua");
    await expect(updatePurchasePrices.execute(context, { supplierId: "ncc", date, rows }, actionId, { exclude: [1, 2] })).rejects.toThrow("Chưa chọn giá nào");
  });

  it("shows the price now and the new one on the card", () => {
    const view = updatePurchasePrices.view!({ rows: [{ n: 1, label: "Xi măng (XM40)", unit: "bao", price: "86000", current: "80000", status: "CREATE" }, { n: 2, label: "Cát", unit: "kg", price: "300", current: null, status: "CREATE" }] });
    expect(view!.rows.map((row) => row.cells[1])).toEqual(["80.000 → 86.000 ₫", "Mới: 300 ₫"]);
    expect(view).toMatchObject({ verb: "lưu", noun: "giá", okLabel: "Lưu giá" });
  });
});
