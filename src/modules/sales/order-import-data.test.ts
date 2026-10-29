// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ price: vi.fn() }));
vi.mock("./commercial-lines", () => ({ createCommercialLines: mocks.price }));

import { resolveImport } from "./order-import-data";
import type { ImportGroup } from "./order-import";

const tables: Record<string, unknown[]> = {
  customers: [{ id: "c1", code: "KH01", display_name: "Công ty An Phát", customer_sites: [
    { id: "s2", code: "CT2", name: "Kho Q.9", active: true, created_at: "2026-02-01" }, { id: "s1", code: "CT1", name: "Nhà xưởng Q.7", active: true, created_at: "2026-01-01" }] }],
  materials: [{ id: "m1", code: "XM01", name: "Xi măng", base_uom_id: "u-kg" }],
  units_of_measure: [{ id: "u-kg", code: "kg", symbol: "kg", name: "Kilôgam" }, { id: "u-bao", code: "bao", symbol: "bao", name: "Bao" }],
};
const supabase = { from: (table: string) => { const query: Record<string, unknown> = {}; for (const method of ["select", "eq", "in"]) query[method] = () => query;
  const result = Promise.resolve({ data: tables[table], error: null }); query.then = result.then.bind(result); return query; } };
const row = (extra: Partial<ImportGroup["rows"][number]> = {}) => ({ row: 2, group: "1", customerCode: "KH01", siteCode: "", deliveryDate: "2026-11-05", materialCode: "XM01", unit: "bao", quantity: "10", unitPrice: "", note: "", ...extra });

describe("resolveImport (D37)", () => {
  it("turns codes into the customer's first site, the goods and the unit, and prices the lines like the order screen", async () => {
    mocks.price.mockResolvedValue([{ quantity: "10", unit_price_vnd: "95000" }]);
    const [order] = await resolveImport(supabase as never, "b1", [{ key: "1", rows: [row()], problems: [] }], false);
    expect(mocks.price).toHaveBeenCalledWith({ customerId: "c1", siteId: "s1", lines: [{ materialId: "m1", orderedUomId: "u-bao", quantity: "10" }] }, "b1", false);
    expect(order).toMatchObject({ customerName: "Công ty An Phát", siteName: "Nhà xưởng Q.7", deliveryDate: "05/11/2026", totalVnd: "950000", problems: [] });
    expect(order.input).toMatchObject({ customerId: "c1", siteId: "s1", deliveryDate: "2026-11-05" });
  });

  it("explains unknown codes, a missing unit and a price the person may not set", async () => {
    mocks.price.mockReset();
    const [order] = await resolveImport(supabase as never, "b1", [{ key: "1", problems: [],
      rows: [row({ siteCode: "CT9" }), row({ row: 3, materialCode: "XX99" }), row({ row: 4, unit: "thùng" }), row({ row: 5, unitPrice: "90000" })] }], false);
    expect(order.problems).toEqual(["Khách KH01 không có công trình mã CT9.", "Dòng 3: không có hàng mã XX99 (hoặc hàng ngừng bán).",
      "Dòng 4: không có đơn vị \"thùng\".", "Dòng 5: bạn không có quyền nhập giá riêng; để trống ô đơn giá để lấy theo bảng giá."]);
    expect(order.input).toBeNull();
    expect(mocks.price).not.toHaveBeenCalled();
  });
});
