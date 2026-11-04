// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const built = vi.hoisted(() => ({ build: vi.fn() }));
vi.mock("@/modules/purchasing/warehouse-lines", () => ({ buildWarehouseLines: built.build }));
import { checkPurchaseRows, purchaseFromDocument, type PurchaseDocInputs } from "./batch-purchase";

const units = [{ id: "bao", code: "bao", name: "Bao", symbol: "bao" }, { id: "kg", code: "kg", name: "Kilogram", symbol: "kg" }];
const data = (canManagePrice: boolean): PurchaseDocInputs => ({
  canManagePrice, units, materials: [{ id: "xm", code: "XM40", name: "Xi măng PCB40", base_uom_id: "kg" }, { id: "thep", code: "THEP", name: "Thép D10", base_uom_id: "kg" }],
  assignments: [{ material_id: "xm", purchase_uom_id: "bao" }], conversions: [{ material_id: "xm", from_uom_id: "bao", to_uom_id: "kg" }],
  rules: [{ material_id: "xm", purchase_uom_id: "bao", unit_cost_vnd: "80000" }],
});

describe("D64 Đơn mua từ chứng từ", () => {
  it("prices lines from the supplier's book and flags a document price that differs", () => {
    const rows = checkPurchaseRows([{ hang: "xi mang pcb40", so_luong: "20", gia: "80.000" }, { hang: "XM40", so_luong: "10", gia: "86000" }, { hang: "Thép D10", so_luong: "5" }, { hang: "XM40", so_luong: "0" }, { hang: "Gạch", so_luong: "1" }], data(false));
    expect(rows[0]).toMatchObject({ status: "CREATE", uomId: "bao", quantity: "20", price: "80000", manualPrice: null });
    expect(rows[1].status).toBe("SKIP");
    expect(rows[1].reason).toContain("khác bảng giá 80.000 ₫; cập nhật Giá mua trước");
    expect(rows[2].reason).toBe("Không có giá mua hiệu lực của nhà cung cấp này; cập nhật Giá mua trước");
    expect(rows[3].reason).toBe("Số lượng chưa đúng");
    expect(rows[4].reason).toBe("Không có vật tư này (hoặc không cho phép mua)");
  });

  it("uses a different document price only for someone who may manage purchase prices", () => {
    const rows = checkPurchaseRows([{ hang: "XM40", so_luong: "10", gia: "86000" }, { hang: "Thép D10", so_luong: "5", gia: "17000", don_vi: "kg" }], data(true));
    expect(rows[0]).toMatchObject({ status: "CREATE", price: "86000", manualPrice: "86000" });
    expect(rows[1]).toMatchObject({ status: "CREATE", manualPrice: "17000", uomId: "kg" });
  });

  describe("prepare and execute", () => {
    beforeEach(() => built.build.mockReset());
    const tables: Record<string, unknown> = {
      suppliers: [{ id: "ncc", code: "NCC1", name: "Phú Thành" }], warehouses: [{ id: "kho", code: "K1", name: "Kho chính" }],
      materials: data(false).materials, units_of_measure: units, purchase_price_rules: [{ material_id: "xm", purchase_uom_id: "bao", unit_cost_vnd: "80000" }],
      supplier_materials: [{ material_id: "xm", purchase_uom_id: "bao" }], material_uom_conversions: [{ material_id: "xm", from_uom_id: "bao", to_uom_id: "kg" }],
    };
    const supabase = (rpc = vi.fn()) => ({ rpc, from: (table: string) => {
      const q: Record<string, unknown> = {};
      for (const name of ["select", "eq", "ilike", "in", "or", "lte", "order", "limit", "gt"]) q[name] = () => q;
      q.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: tables[table] ?? [], error: null }).then(resolve);
      return q;
    } });

    it("builds the card from the book price, refuses receiving without the right, and shows the total only to those who may see prices", async () => {
      built.build.mockResolvedValue({ lines: [{ material_id: "xm", ordered_uom_id: "bao", quantity: "20", unit_cost_vnd: "80000" }], previews: [{ lineTotalVnd: "1600000", unitCostVnd: "80000" }], totalVnd: "1600000" });
      const context = { supabase: supabase() as never, branchId: "b1", permissions: new Set(["purchasing.create", "purchasing.price.read"]) };
      await expect(purchaseFromDocument.prepare(context, { nha_cung_cap: "Phú Thành", nhan_hang: true, dong: [{ hang: "XM40", so_luong: "20" }] })).rejects.toThrow("cần quyền nhận hàng");
      const prepared = await purchaseFromDocument.prepare(context, { nha_cung_cap: "Phú Thành", so_chung_tu: "HD-77", dong: [{ hang: "XM40", so_luong: "20" }, { hang: "Gạch", so_luong: "3" }] });
      expect(prepared.title).toBe("Tạo đơn mua 1 dòng từ Phú Thành");
      expect(prepared.summary).toEqual(expect.arrayContaining([{ label: "Chứng từ", value: "HD-77" }, { label: "Bỏ qua", value: "1 dòng (chưa có giá hoặc không khớp)" }]));
      expect(purchaseFromDocument.view!(prepared.payload)!.rows[0].cells).toEqual(["Xi măng PCB40 (XM40)", "20 bao", "80.000 ₫ · 1.600.000 ₫"]);
    });

    it("creates the order once and receives its lines with a derived operation id; a failed receipt keeps the card waiting", async () => {
      type Reply = { data: unknown; error: { message: string } | null };
      const rpc = vi.fn(async (name: string): Promise<Reply> => name === "create_purchase_order_draft" ? { data: "po-1", error: null } : { data: null, error: null });
      const table = tables.purchase_order_line_read; tables.purchase_order_line_read = [{ id: "l1", quantity: 20 }];
      const context = { supabase: supabase(rpc) as never, branchId: "b1", permissions: new Set(["purchasing.create", "inventory.receive"]) };
      const rows = [{ n: 1, label: "Xi măng", unit: "bao", quantity: "20", price: "80000", manualPrice: null, materialId: "xm", uomId: "bao", status: "CREATE", line: { material_id: "xm", quantity: "20" } },
        { n: 2, label: "Bỏ", unit: "", quantity: "1", price: "1", manualPrice: null, materialId: "x", uomId: "x", status: "SKIP", reason: "x" }];
      const payload = { supplierId: "ncc", warehouseId: "kho", expectedDate: null, document: "HD-77", receive: true, rows };
      const done = await purchaseFromDocument.execute(context, payload, "11111111-1111-4111-8111-111111111111");
      expect(done).toEqual({ link: "/admin/purchase-orders/po-1", message: "Đã tạo đơn mua và nhận 1 dòng hàng vào kho." });
      const calls = rpc.mock.calls as unknown as [string, Record<string, unknown>][];
      expect(calls[0][1]).toMatchObject({ commercial_terms: "Chứng từ HD-77", purchase_lines: [{ material_id: "xm", quantity: "20" }], operation_id: "11111111-1111-4111-8111-111111111111" });
      expect(calls[1][0]).toBe("receive_purchase_order");
      expect(calls[1][1]).toMatchObject({ target_purchase_order_id: "po-1", receipt_lines: [{ purchase_order_line_id: "l1", received_quantity: "20" }] });
      expect(calls[1][1].operation_id).not.toBe(calls[0][1].operation_id);
      rpc.mockImplementation(async (name: string): Promise<Reply> => name === "receive_purchase_order" ? { data: null, error: { message: "receipt_exceeds_purchase_line" } } : { data: "po-1", error: null });
      await expect(purchaseFromDocument.execute(context, payload, "11111111-1111-4111-8111-111111111111")).rejects.toThrow("Đã tạo đơn mua nhưng chưa nhận được hàng");
      await expect(purchaseFromDocument.execute(context, payload, "11111111-1111-4111-8111-111111111111", { exclude: [1] })).rejects.toThrow("Chưa chọn dòng hàng nào");
      tables.purchase_order_line_read = table;
    });
  });
});
