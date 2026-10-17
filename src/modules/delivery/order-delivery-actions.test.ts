import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn(), access: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/access/context", () => ({ requireInternalAccess: m.access }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => ({ rpc: m.rpc })) }));

import { createDeliveryForOrderAction } from "./order-delivery-actions";

const ids = { op: "11111111-1111-4111-8111-111111111111", order: "22222222-2222-4222-8222-222222222222", warehouse: "33333333-3333-4333-8333-333333333333",
  line: "44444444-4444-4444-8444-444444444444", employee: "55555555-5555-4555-8555-555555555555", vehicle: "66666666-6666-4666-8666-666666666666" };
const base = { operationId: ids.op, orderId: ids.order, warehouseId: ids.warehouse, scheduledAt: "2026-10-17T08:00", lines: [{ salesOrderLineId: ids.line, quantity: "3.50" }], assignment: null };
beforeEach(() => { vi.clearAllMocks(); m.access.mockResolvedValue({ branchId: "branch-a", permissions: new Set() }); m.rpc.mockResolvedValue({ data: { delivery_id: "d1" }, error: null }); });

it("sends one command with sold-unit quantities and the business time zone", async () => {
  const result = await createDeliveryForOrderAction({ ...base, assignment: { employeeId: ids.employee, vehicleId: ids.vehicle, scheduledEnd: "2026-10-17T12:00" } });
  expect(result).toMatchObject({ success: true, deliveryId: "d1" });
  expect(m.rpc).toHaveBeenCalledWith("create_delivery_for_order", {
    target_sales_order_id: ids.order, target_warehouse_id: ids.warehouse,
    delivery_lines: [{ sales_order_line_id: ids.line, quantity: "3.5" }],
    scheduled_at: "2026-10-17T01:00:00.000Z",
    assignment: { employee_id: ids.employee, vehicle_id: ids.vehicle, scheduled_start: "2026-10-17T01:00:00.000Z", scheduled_end: "2026-10-17T05:00:00.000Z" },
    operation_id: ids.op,
  });
});

it("checks input before calling the database", async () => {
  expect((await createDeliveryForOrderAction({ ...base, lines: [{ salesOrderLineId: ids.line, quantity: "0" }] })).message).toContain("lớn hơn 0");
  expect((await createDeliveryForOrderAction({ ...base, assignment: { employeeId: ids.employee, vehicleId: ids.vehicle, scheduledEnd: "2026-10-17T07:00" } })).message).toContain("sau giờ bắt đầu");
  expect(m.rpc).not.toHaveBeenCalled();
});

it("explains refusals in Vietnamese and keeps an unknown outcome retryable", async () => {
  m.rpc.mockResolvedValueOnce({ data: null, error: { message: "insufficient_available_inventory" } });
  expect((await createDeliveryForOrderAction(base)).message).toBe("Tồn khả dụng hoặc lượng hàng đã giữ không còn đủ.");
  m.rpc.mockResolvedValueOnce({ data: null, error: { message: "supply_allocation_exceeds_need" } });
  expect((await createDeliveryForOrderAction(base)).message).toBe("Số lượng vượt phần còn phải giao của đơn.");
  m.rpc.mockRejectedValueOnce(new Error("fetch failed"));
  expect(await createDeliveryForOrderAction(base)).toMatchObject({ success: false, outcomeUnknown: true });
});
