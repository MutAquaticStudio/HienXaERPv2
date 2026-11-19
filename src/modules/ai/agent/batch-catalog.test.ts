// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { checkMaterialRows, checkSupplierRows, createMaterials, createSuppliers } from "./batch-catalog";

const groups = [{ id: "g-xm", code: "XM", name: "Xi măng" }, { id: "g-cat", code: "CAT", name: "Cát, đá" }];
const units = [{ id: "bao", code: "bao", name: "Bao", symbol: "bao" }, { id: "m3", code: "m3", name: "Mét khối", symbol: "m³" }];
const key = "abcdef12-0000-4000-8000-000000000001";

describe("D64 Tạo nhiều vật tư", () => {
  it("creates rows with a group and a unit, and marks existing, unknown group/unit, repeated and nameless rows", () => {
    const rows = checkMaterialRows([
      { ten: "Xi măng Hà Tiên PCB40", nhom: "xi mang", don_vi: "Bao", quy_cach: "50 kg" },
      { ten: "Cát vàng", ma: "cat-vang", nhom: "CAT", don_vi: "m3", mua: false },
      { ten: "Xi măng Hà Tiên PCB40", nhom: "XM", don_vi: "bao" },
      { ten: "Thép D10", nhom: "XM", don_vi: "bao", ma: "XM-OLD" },
      { ten: "Gạch", nhom: "Gạch men", don_vi: "viên" },
      { ten: "Đá 1x2", nhom: "CAT", don_vi: "lít" },
      { ten: "Sơn", don_vi: "bao" }, { ten: "", nhom: "XM", don_vi: "bao" },
    ], [{ code: "XM-OLD", name: "Xi măng cũ" }], groups, units, key);
    expect(rows.map((row) => [row.n, row.status, row.reason ?? ""])).toEqual([
      [1, "CREATE", ""], [2, "CREATE", ""], [3, "SKIP", "Trùng dòng 1"], [4, "SKIP", "Đã có: XM-OLD · Xi măng cũ"],
      [5, "SKIP", expect.stringContaining('Không có nhóm vật tư "Gạch men"')], [6, "SKIP", 'Không có đơn vị "lít"'], [7, "SKIP", expect.stringContaining("Thiếu nhóm vật tư")], [8, "SKIP", "Thiếu tên vật tư"],
    ]);
    expect(rows[0]).toMatchObject({ groupId: "g-xm", uomId: "bao", sale: true, purchase: true });
    expect(rows[1]).toMatchObject({ code: "CAT-VANG", uomId: "m3", purchase: false });
  });

  it("creates each material through the catalog command and assigns the supplier only to purchasable ones", async () => {
    const rpc = vi.fn(async () => ({ error: null }));
    const context = { supabase: { rpc } as never, branchId: "b1", permissions: new Set(["catalog.manage", "purchasing.price.manage"]) };
    const rows = checkMaterialRows([{ ten: "Xi măng PCB40", nhom: "XM", don_vi: "bao" }, { ten: "Cát vàng", nhom: "CAT", don_vi: "m3", mua: false }], [], groups, units, key);
    const done = await createMaterials.execute(context, { supplierId: "ncc", rows }, "11111111-1111-4111-8111-111111111111");
    expect(done.message).toBe("Đã xong 2 vật tư.");
    const calls = rpc.mock.calls as unknown as [string, Record<string, unknown>][];
    expect(calls.map((call) => call[0])).toEqual(["save_catalog_record", "set_supplier_material_assignments", "save_catalog_record"]);
    expect(calls[0][1]).toMatchObject({ kind: "materials", expected_json: null, values_json: { name: "Xi măng PCB40", group_id: "g-xm", base_uom_id: "bao", sale_enabled: true, purchase_enabled: true } });
    expect(calls[1][1]).toMatchObject({ items: [{ supplier_id: "ncc", material_id: calls[0][1].target_id, purchase_uom_id: "bao", active: true }] });
  });

  it("will not assign a supplier without the purchase-price right", async () => {
    const context = { supabase: {} as never, branchId: "b1", permissions: new Set(["catalog.manage"]) };
    await expect(createMaterials.prepare(context, { nha_cung_cap: "Phú Thành", vat_tu: [{ ten: "Xi măng" }] })).rejects.toThrow("cần quyền nhập giá mua");
  });
});

describe("D64 Tạo nhiều nhà cung cấp", () => {
  it("marks suppliers already there (name, phone, code) or repeated, and checks email and payment days", () => {
    const rows = checkSupplierRows([
      { ten: "Công ty Phú Thành", dien_thoai: "0912 345 678", han_thanh_toan: "30" }, { ten: "Phú Thành (lặp)", dien_thoai: "+84912345678" },
      { ten: "VLXD An Phát", dien_thoai: "0905111222" }, { ten: "Đại lý Hòa", ma: "ncc01" }, { ten: "Cửa hàng Lan", email: "lan@" }, { ten: "Kho Bốn", han_thanh_toan: "400" }, { ten: "vlxd an phat" },
    ], [{ code: "NCC01", name: "Nhà cung cấp cũ", phone: null }, { code: "NCC09", name: "VLXD An Phát", phone: "0905 111 222" }], key);
    expect(rows.map((row) => [row.n, row.status, row.reason ?? ""])).toEqual([
      [1, "CREATE", ""], [2, "SKIP", "Trùng dòng 1"], [3, "SKIP", "Đã có: NCC09 · VLXD An Phát"], [4, "SKIP", "Đã có: NCC01 · Nhà cung cấp cũ"], [5, "SKIP", "Email chưa đúng"], [6, "SKIP", "Hạn thanh toán tối đa 365 ngày"], [7, "SKIP", "Đã có: NCC09 · VLXD An Phát"],
    ]);
    expect(rows[0]).toMatchObject({ phone: "0912345678", days: "30" });
  });

  it("saves each supplier with its own operation id and reports the rows that failed", async () => {
    const rpc = vi.fn(async (_name: string, args: { values_json: { code: string } }) => args.values_json.code === "BAD" ? { error: { message: "duplicate key 23505" } } : { error: null });
    const context = { supabase: { rpc } as never, branchId: "b1", permissions: new Set(["suppliers.manage"]) };
    const rows = [{ n: 1, status: "CREATE", code: "A1", label: "A", name: "Nhà A", phone: "0912345678", address: "", email: "", taxCode: "", days: "30" }, { n: 2, status: "CREATE", code: "BAD", label: "B", name: "Nhà B", phone: "", address: "", email: "", taxCode: "", days: "0" }];
    await expect(createSuppliers.execute(context, { rows }, "11111111-1111-4111-8111-111111111111")).rejects.toThrow("Đã xong 1/2 nhà cung cấp. Chưa làm được: dòng 2 Nhà B (đã tồn tại)");
    expect((rpc.mock.calls[0] as unknown as [string, Record<string, unknown>])[1]).toMatchObject({ kind: "suppliers", values_json: { code: "A1", name: "Nhà A", phone: "0912345678", payment_terms_days: "30" } });
  });
});
