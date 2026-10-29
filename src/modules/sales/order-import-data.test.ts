// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ price: vi.fn() }));
vi.mock("./commercial-lines", () => ({ createCommercialLines: mocks.price }));

import { resolveImport } from "./order-import-data";
import type { ImportGroup } from "./order-import";

const tables: Record<string, unknown[]> = {
  customers: [{ id: "c9", code: "KH09", display_name: "Anh Minh Thủ Đức", phone: "0909 111 222", customer_sites: [{ id: "s9", code: "CT1", name: "Nhà phố", active: true, created_at: "2026-01-01" }] },
    { id: "c8", code: "KH08", display_name: "Anh Minh Quận 7", phone: null, customer_sites: [] },
    { id: "c1", code: "KH01", display_name: "Công ty An Phát", phone: "0901234567", customer_sites: [
    { id: "s2", code: "CT2", name: "Kho Q.9", active: true, created_at: "2026-02-01" }, { id: "s1", code: "CT1", name: "Nhà xưởng Q.7", active: true, created_at: "2026-01-01" }] }],
  materials: [{ id: "m1", code: "XM01", name: "Xi măng Hà Tiên", base_uom_id: "u-kg" }, { id: "m2", code: "CAT01", name: "Cát vàng", base_uom_id: "u-kg" },
    { id: "m3", code: "CAT02", name: "Cát đen", base_uom_id: "u-kg" }],
  units_of_measure: [{ id: "u-kg", code: "kg", symbol: "kg", name: "Kilôgam" }, { id: "u-bao", code: "bao", symbol: "bao", name: "Bao" }],
};
const supabase = { from: (table: string) => { const query: Record<string, unknown> = {}; for (const method of ["select", "eq", "in", "limit"]) query[method] = () => query;
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
    expect(order.problems).toEqual(["Khách KH01 không có công trình \"CT9\".", "Dòng 3: không nhận ra hàng \"XX99\" (hoặc hàng ngừng bán).",
      "Dòng 4: không có đơn vị \"thùng\".", "Dòng 5: bạn không có quyền nhập giá riêng; để trống ô đơn giá để lấy theo bảng giá."]);
    expect(order.input).toBeNull();
    expect(mocks.price).not.toHaveBeenCalled();
  });

  it("recognises names without accents, phone numbers and lower-case codes, and says how it read them", async () => {
    mocks.price.mockReset();
    mocks.price.mockResolvedValue([{ quantity: "10", unit_price_vnd: "95000" }, { quantity: "10", unit_price_vnd: "300000" }]);
    const [byPhone] = await resolveImport(supabase as never, "b1", [{ key: "1", problems: [],
      rows: [row({ customerCode: "901234567", materialCode: "xi mang ha tien" }), row({ row: 3, customerCode: "901234567", materialCode: "cat01", unit: "" })] }], false);
    expect(byPhone.problems).toEqual([]);
    expect(byPhone.input).toMatchObject({ customerId: "c1", lines: [{ materialId: "m1" }, { materialId: "m2", orderedUomId: "u-kg" }] });
    expect(byPhone.notes).toEqual(["\"901234567\" → khách KH01 Công ty An Phát", "Dòng 2: \"xi mang ha tien\" → XM01 Xi măng Hà Tiên"]);
    const [byName] = await resolveImport(supabase as never, "b1", [{ key: "2", problems: [], rows: [row({ customerCode: "cong ty an phat", siteCode: "nha xuong", materialCode: "XM01" })] }], false);
    expect(byName.input).toMatchObject({ customerId: "c1", siteId: "s1" });
  });

  it("asks to choose when a name fits several records, and points errors to the Excel row", async () => {
    mocks.price.mockReset();
    const [order] = await resolveImport(supabase as never, "b1", [{ key: "1", problems: [], rows: [row({ customerCode: "anh minh" }), row({ row: 3, materialCode: "cat" })] }], false);
    expect(order.problems).toEqual(["Không nhận ra khách hàng \"anh minh\". Có thể là: KH09 Anh Minh Thủ Đức; KH08 Anh Minh Quận 7. Ghi rõ mã.",
      "Dòng 3: không nhận ra hàng \"cat\" (hoặc hàng ngừng bán). Có thể là: CAT01 Cát vàng; CAT02 Cát đen. Ghi rõ mã."]);
    const { AppError } = await import("@/lib/core/errors");
    mocks.price.mockRejectedValue(new AppError({ code: "VALIDATION_FAILED", message: "Dòng 2: không có quy đổi quyết toán hợp lệ.", status: 422 }));
    const [priced] = await resolveImport(supabase as never, "b1", [{ key: "1", problems: [], rows: [row({ row: 7 }), row({ row: 9, unit: "kg" })] }], false);
    expect(priced.problems).toEqual(["Dòng 9: không có quy đổi quyết toán hợp lệ."]);
  });
});
