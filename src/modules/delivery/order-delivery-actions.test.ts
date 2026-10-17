import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn(), access: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/access/context", () => ({ requireInternalAccess: m.access }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => ({ rpc: m.rpc })) }));

import { createDeliveryForOrderAction } from "./order-delivery-actions";

const ids = { op: "11111111-1111-4111-8111-111111111111", order: "22222222-2222-4222-8222-222222222222", warehouse: "33333333-3333-4333-8333-333333333333",
  line: "44444444-4444-4444-8444-444444444444", employee: "55555555-5555-4555-8555-555555555555", vehicle: "66666666-6666-4666-8666-666666666666" };
const base = { operationId: ids.op, orderId: ids.order, warehouseId: ids.warehouse, scheduleMode: "AT", scheduledAt: "2026-10-17T08:00",
  lines: [{ salesOrderLineId: ids.line, quantity: "3.50" }], assignment: null };
beforeEach(() => { vi.clearAllMocks(); m.access.mockResolvedValue({ branchId: "branch-a", permissions: new Set() }); m.rpc.mockResolvedValue({ data: { delivery_id: "d1" }, error: null }); });

it("sends one command with sold-unit quantities, the business time zone and no end time (the branch stop time applies)", async () => {
  const result = await createDeliveryForOrderAction({ ...base, assignment: { employeeId: ids.employee, vehicleId: ids.vehicle } });
  expect(result).toMatchObject({ success: true, deliveryId: "d1" });
  expect(m.rpc).toHaveBeenCalledWith("create_delivery_for_order", {
    target_sales_order_id: ids.order, target_warehouse_id: ids.warehouse,
    delivery_lines: [{ sales_order_line_id: ids.line, quantity: "3.5" }],
    scheduled_at: "2026-10-17T01:00:00.000Z",
    assignment: { employee_id: ids.employee, vehicle_id: ids.vehicle, scheduled_start: "2026-10-17T01:00:00.000Z", schedule_mode: "AT" },
    operation_id: ids.op,
  });
});

it("passes \"Giao ngay\" to the database so a busy driver is queued instead of refused", async () => {
  await createDeliveryForOrderAction({ ...base, scheduleMode: "NOW", assignment: { employeeId: ids.employee, vehicleId: ids.vehicle } });
  expect(m.rpc.mock.calls[0][1].assignment).toMatchObject({ schedule_mode: "NOW" });
});

it("checks input before calling the database", async () => {
  expect((await createDeliveryForOrderAction({ ...base, lines: [{ salesOrderLineId: ids.line, quantity: "0" }] })).message).toContain("lớn hơn 0");
  expect((await createDeliveryForOrderAction({ ...base, assignment: { employeeId: ids.employee } })).message).toContain("người giao và xe");
  expect((await createDeliveryForOrderAction({ ...base, scheduleMode: "LATER" })).message).toContain("thời gian giao");
  expect(m.rpc).not.toHaveBeenCalled();
});

it("offers the nearest free time when the chosen time clashes", async () => {
  m.rpc.mockResolvedValueOnce({ data: null, error: { message: "work_resource_schedule_collision", hint: "next_free_at=2026-10-17T03:30:00Z" } });
  const result = await createDeliveryForOrderAction({ ...base, assignment: { employeeId: ids.employee, vehicleId: ids.vehicle } });
  expect(result).toMatchObject({ success: false, nextFreeAt: "2026-10-17T10:30" });
  expect(result.message).toContain("Giờ trống gần nhất: 17/10/2026 10:30");
});

it("explains refusals in Vietnamese and keeps an unknown outcome retryable", async () => {
  m.rpc.mockResolvedValueOnce({ data: null, error: { message: "insufficient_available_inventory" } });
  expect((await createDeliveryForOrderAction(base)).message).toBe("Tồn khả dụng hoặc lượng hàng đã giữ không còn đủ.");
  m.rpc.mockResolvedValueOnce({ data: null, error: { message: "supply_allocation_exceeds_need" } });
  expect((await createDeliveryForOrderAction(base)).message).toBe("Số lượng vượt phần còn phải giao của đơn.");
  m.rpc.mockRejectedValueOnce(new Error("fetch failed"));
  expect(await createDeliveryForOrderAction(base)).toMatchObject({ success: false, outcomeUnknown: true });
});
