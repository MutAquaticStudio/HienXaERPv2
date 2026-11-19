// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ resolve: vi.fn(), lines: vi.fn(), seller: vi.fn(), source: vi.fn() }));
vi.mock("@/modules/sales/order-import-data", () => ({ resolveImport: m.resolve, NO_OVERRIDES: {} }));
vi.mock("@/modules/sales/commercial-lines", () => ({ createCommercialLines: m.lines }));
vi.mock("@/modules/sales/seller", () => ({ assignSellerAfterCreate: m.seller }));
vi.mock("@/modules/sales/auto-sourcing", async (original) => ({ ...(await original<typeof import("@/modules/sales/auto-sourcing")>()), autoSourceConfirmedOrder: m.source }));
import { salesOrdersFromList, toImportGroups } from "./batch-orders";

describe("D64 Đơn bán từ danh sách", () => {
  it("turns each order into import rows and names the problems that stop it before asking the database", () => {
    const groups = toImportGroups([
      { khach: "An Phát", cong_trinh: "CT1", ngay_giao: "2026-11-10", dong: [{ hang: "XM40", so_luong: "20", don_vi: "bao" }, { hang: "Cát", so_luong: "1,5", gia: "300.000" }] },
      { khach: "", dong: [] }, { khach: "Lan", ngay_giao: "10/11", dong: [{ hang: "", so_luong: "0", gia: "x" }] },
    ], false);
    expect(groups[0].problems).toEqual(["Dòng 2: giá nhập tay cần quyền đặt giá (bỏ giá để theo bảng giá)"]);
    expect(groups[0].rows[0]).toMatchObject({ customerCode: "An Phát", siteCode: "CT1", deliveryDate: "2026-11-10", materialCode: "XM40", unit: "bao", quantity: "20" });
    expect(groups[0].rows[1]).toMatchObject({ quantity: "1.5", unitPrice: "300000" });
    expect(groups[1].problems).toEqual(["Thiếu tên khách", "Đơn chưa có dòng hàng"]);
    expect(groups[2].problems).toEqual(expect.arrayContaining(["Ngày giao dạng yyyy-mm-dd", "Dòng 1: thiếu tên hàng", "Dòng 1: số lượng chưa đúng", "Dòng 1: giá chưa đúng"]));
    expect(toImportGroups([{ khach: "An Phát", dong: [{ hang: "Cát", so_luong: "1", gia: "300000" }] }], true)[0].problems).toEqual([]);
  });

  const input = { key: "ai-1", customerId: "c1", siteId: "s1", deliveryDate: "2026-11-10", terms: "", lines: [{ materialId: "xm", orderedUomId: "bao", quantity: "20" }] };
  it("prepares one card with a row per order, skipping the ones the import rules cannot read", async () => {
    m.resolve.mockResolvedValue([
      { key: "ai-1", customerName: "Công ty An Phát", siteName: "CT1", deliveryDate: "2026-11-10", totalVnd: "1600000", problems: [], input },
      { key: "ai-2", customerName: "Chị Lan", siteName: "", deliveryDate: null, totalVnd: "0", problems: ["Dòng 1: không có hàng này"], input: null },
    ]);
    const context = { supabase: {} as never, branchId: "b1", permissions: new Set(["orders.create"]) };
    await expect(salesOrdersFromList.prepare(context, { xac_nhan: true, don: [{ khach: "An Phát", dong: [{ hang: "XM40", so_luong: "20" }] }] })).rejects.toThrow("không có quyền xác nhận");
    const prepared = await salesOrdersFromList.prepare(context, { don: [{ khach: "An Phát", dong: [{ hang: "XM40", so_luong: "20" }] }, { khach: "Lan", dong: [{ hang: "Gạch", so_luong: "3" }] }] });
    expect(prepared.title).toBe("Tạo 1 đơn bán");
    expect(prepared.summary).toEqual(expect.arrayContaining([{ label: "Sẽ tạo", value: "1 đơn · 1.600.000 ₫" }, { label: "Bỏ qua", value: "1 đơn (chưa đọc được)" }]));
    const view = salesOrdersFromList.view!(prepared.payload)!;
    expect(view.rows[0]).toMatchObject({ status: "CREATE", cells: ["Công ty An Phát", "CT1", "10/11/2026", "1 dòng · 1.600.000 ₫"] });
    expect(view.rows[1]).toMatchObject({ status: "SKIP", reason: expect.stringContaining("không có hàng này") });
  });

  it("creates each ready order with its own operation id, confirms when asked and allowed, and keeps the card waiting on a failure", async () => {
    m.lines.mockResolvedValue([{ material_id: "xm", quantity: "20" }]);
    m.source.mockResolvedValue({ status: "OK", outcome: {} });
    const rpc = vi.fn(async (name: string, args: { target_customer_id?: string }) => name === "create_sales_order_draft" ? (args.target_customer_id === "bad" ? { data: null, error: { message: "x" } } : { data: `order-${args.target_customer_id}`, error: null }) : { data: null, error: null });
    const context = { supabase: { rpc } as never, branchId: "b1", permissions: new Set(["orders.create", "orders.confirm"]) };
    const rows = [{ n: 1, label: "An Phát", site: "CT1", delivery: "2026-11-10", lines: 1, total: "1600000", status: "CREATE", input }, { n: 2, label: "Lỗi", site: "", delivery: "", lines: 1, total: "1", status: "CREATE", input: { ...input, customerId: "bad" } },
      { n: 3, label: "Bỏ", site: "", delivery: "", lines: 1, total: "0", status: "SKIP", reason: "x" }];
    const actionId = "11111111-1111-4111-8111-111111111111";
    await expect(salesOrdersFromList.execute(context, { confirm: true, rows }, actionId)).rejects.toThrow("Đã tạo 1/2 đơn. Chưa tạo được: đơn 2 Lỗi (chưa tạo được)");
    const calls = rpc.mock.calls as unknown as [string, Record<string, unknown>][];
    expect(calls.map((call) => call[0])).toEqual(["create_sales_order_draft", "confirm_sales_order", "create_sales_order_draft"]);
    expect(calls[0][1]).toMatchObject({ target_customer_id: "c1", target_site_id: "s1", order_lines: [{ material_id: "xm", quantity: "20" }] });
    expect(m.seller).toHaveBeenCalledTimes(1);
    expect(m.source).toHaveBeenCalledTimes(1);
    await expect(salesOrdersFromList.execute(context, { confirm: false, rows }, actionId, { exclude: [1, 2] })).rejects.toThrow("Chưa chọn đơn nào");
  });
});
