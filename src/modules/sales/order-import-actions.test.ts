// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), source: vi.fn(), permissions: new Set(["orders.create", "orders.confirm"]) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: async () => ({ branchId: "b1", employeeId: "e-owner", permissions: mocks.permissions }) }));
vi.mock("./commercial-lines", () => ({ createCommercialLines: async () => [{ material_id: "m1", quantity: "10" }] }));
vi.mock("./auto-sourcing", async (original) => ({ ...(await original<typeof import("./auto-sourcing")>()), autoSourceConfirmedOrder: mocks.source }));
const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { order_number: "DB-2026-000101" }, error: null }) };
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({ rpc: mocks.rpc, from: () => query }) }));

import { sourcingSummary } from "./auto-sourcing";
import { createImportedOrdersAction, reviewOrderImportAction } from "./order-import-actions";

const ORDER = { key: "1", customerId: "11111111-1111-4111-8111-111111111111", siteId: "22222222-2222-4222-8222-222222222222", deliveryDate: null, terms: "",
  lines: [{ materialId: "33333333-3333-4333-8333-333333333333", orderedUomId: "44444444-4444-4444-8444-444444444444", quantity: "10" }] };
const FILE = "55555555-5555-4555-8555-555555555555";

describe("Xác nhận luôn khi nhập Excel (D37)", () => {
  beforeEach(() => {
    mocks.rpc.mockReset(); mocks.source.mockReset();
    mocks.permissions = new Set(["orders.create", "orders.confirm"]);
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "create_sales_order_draft" ? "order-1" : null, error: null }));
  });

  it("confirms each order and sources it like the order screen: stock first, the rest on a purchase order", async () => {
    mocks.source.mockResolvedValue({ status: "SOURCED", outcome: { warehouse_lines: 1, purchase_orders: [{ purchase_order_id: "p", number: "MH-2026-000012" }], waiting_purchase: true, short_lines: [] } });
    const [result] = await createImportedOrdersAction({ fileId: FILE, confirm: true, orders: [ORDER] });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "confirm_sales_order", expect.objectContaining({ target_order_id: "order-1" }));
    expect(mocks.source).toHaveBeenCalledWith(expect.anything(), "b1", "order-1", expect.any(String), { onlyIfEnabled: true });
    expect(result).toMatchObject({ orderNumber: "DB-2026-000101", confirmed: true, confirmation: "Đã xác nhận · lấy từ kho 1 dòng · thiếu hàng → đơn mua MH-2026-000012." });
  });

  it("keeps the draft when credit stops it, and never confirms without the permission", async () => {
    mocks.rpc.mockImplementation(async (name: string) => name === "create_sales_order_draft" ? { data: "order-1", error: null } : { data: null, error: { message: "credit_limit_exceeded" } });
    const [blocked] = await createImportedOrdersAction({ fileId: FILE, confirm: true, orders: [ORDER] });
    expect(blocked).toMatchObject({ orderId: "order-1", confirmed: false });
    expect(blocked.confirmation).toMatch(/hạn mức/);
    expect(mocks.source).not.toHaveBeenCalled();
    mocks.permissions = new Set(["orders.create"]);
    mocks.rpc.mockClear();
    const [draft] = await createImportedOrdersAction({ fileId: FILE, confirm: true, orders: [ORDER] });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(draft.confirmation).toBeUndefined();
  });

  it("summarises what sourcing could not cover", () => {
    expect(sourcingSummary("SOURCED", { warehouse_lines: 0, purchase_orders: [], waiting_purchase: false, short_lines: [{ material_name: "Cát vàng", short: 3, symbol: "m³" }] }))
      .toBe("Đã xác nhận · còn thiếu 3 m³ Cát vàng (chưa có nhà cung cấp).");
    expect(sourcingSummary("FAILED")).toMatch(/Tự phân nguồn/);
  });

  it("re-checks only well-formed choices sent back from the preview", async () => {
    expect(await reviewOrderImportAction({ fileId: FILE, groups: [], problems: [], overrides: { customers: {}, sites: {}, materials: {}, units: {} } }))
      .toMatchObject({ ok: false, message: "Dữ liệu xem trước không hợp lệ. Tải file lên lại." });
    const groups = [{ key: "1", problems: [], rows: [{ row: 2, group: "1", customerCode: "x", siteCode: "", deliveryDate: null, materialCode: "y", unit: "", quantity: "1", unitPrice: "", note: "" }] }];
    expect(await reviewOrderImportAction({ fileId: FILE, groups, problems: [], overrides: { customers: { x: "not-an-id" }, sites: {}, materials: {}, units: {} } }))
      .toMatchObject({ ok: false });
  });

  it("gives the owner's imported order to the named seller (D38)", async () => {
    mocks.permissions = new Set(["orders.create", "roles.manage"]);
    await createImportedOrdersAction({ fileId: FILE, orders: [{ ...ORDER, sellerId: "66666666-6666-4666-8666-666666666666" }] });
    expect(mocks.rpc).toHaveBeenCalledWith("set_sales_order_seller", expect.objectContaining({ target_order_id: "order-1", target_employee_id: "66666666-6666-4666-8666-666666666666" }));
  });
});
