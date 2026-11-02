import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => ({ rpc: m.rpc })) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { splitDeliveryAction } from "./split-actions";

const ids = { delivery: "11111111-1111-4111-8111-111111111111", op: "22222222-2222-4222-8222-222222222222",
  line: "33333333-3333-4333-8333-333333333333", employee: "44444444-4444-4444-8444-444444444444", vehicle: "55555555-5555-4555-8555-555555555555" };
const parts = [
  { lines: [{ delivery_line_id: ids.line, base_quantity: "100" }] },
  { lines: [{ delivery_line_id: ids.line, base_quantity: "60" }], employee_id: ids.employee, vehicle_id: ids.vehicle, scheduled_start: "2026-11-03T08:30" },
];
const deliveries = [{ id: "66666666-6666-4666-8666-666666666666", number: "DL-2026-000032", state: "PLANNED" },
  { id: "77777777-7777-4777-8777-777777777777", number: "DL-2026-000033", state: "ASSIGNED" }];
beforeEach(() => { vi.clearAllMocks(); m.rpc.mockResolvedValue({ data: { source_id: ids.delivery, source_number: "DL-2026-000030", deliveries }, error: null }); });

it("gửi một lệnh tách, giờ giao đổi sang giờ Việt Nam", async () => {
  const result = await splitDeliveryAction({ deliveryId: ids.delivery, version: 3, parts, operationId: ids.op });
  expect(result).toEqual({ status: "SUCCESS", deliveries });
  expect(m.rpc).toHaveBeenCalledWith("split_delivery", { target_delivery_id: ids.delivery, expected_version: 3, operation_id: ids.op, parts: [
    { lines: parts[0].lines },
    { lines: parts[1].lines, employee_id: ids.employee, vehicle_id: ids.vehicle, scheduled_start: "2026-11-03T01:30:00.000Z" },
  ] });
});

it("báo rõ phiếu nào không phân được xe, bằng tiếng Việt", async () => {
  m.rpc.mockResolvedValue({ data: null, error: { code: "23514", message: "delivery_split_assignment_refused", details: "2", hint: "vehicle_capacity_exceeded" } });
  const result = await splitDeliveryAction({ deliveryId: ids.delivery, version: 3, parts, operationId: ids.op });
  expect(result.status).toBe("FAILED");
  expect(result.status !== "SUCCESS" && result.message).toMatch(/^Phiếu 2: .*sức chứa.*Chưa tách phiếu nào\.$/);
  expect(result.status !== "SUCCESS" && result.message).not.toMatch(/delivery_|vehicle_/);
});

it("phiếu đã lấy hàng hoặc đã đổi → báo tải lại; lỗi đường truyền là chưa rõ, không phải thất bại", async () => {
  m.rpc.mockResolvedValue({ data: null, error: { code: "PT409", message: "delivery_split_version_conflict" } });
  expect(await splitDeliveryAction({ deliveryId: ids.delivery, version: 3, parts, operationId: ids.op })).toMatchObject({ status: "FAILED", message: expect.stringContaining("Tải lại") });
  m.rpc.mockResolvedValue({ data: null, error: { code: "", message: "fetch failed" } });
  expect(await splitDeliveryAction({ deliveryId: ids.delivery, version: 3, parts, operationId: ids.op })).toMatchObject({ status: "UNKNOWN" });
  m.rpc.mockRejectedValue(new Error("network"));
  expect(await splitDeliveryAction({ deliveryId: ids.delivery, version: 3, parts, operationId: ids.op })).toMatchObject({ status: "UNKNOWN" });
});

it("chặn dữ liệu sai trước khi gọi database", async () => {
  expect(await splitDeliveryAction({ deliveryId: ids.delivery, version: 3, parts: [parts[0]], operationId: ids.op })).toMatchObject({ status: "FAILED" });
  expect(await splitDeliveryAction({ deliveryId: ids.delivery, version: 3, parts: [parts[0], { ...parts[1], scheduled_start: "mai" }], operationId: ids.op }))
    .toMatchObject({ status: "FAILED", message: "Phiếu 2: giờ giao không hợp lệ." });
  expect(m.rpc).not.toHaveBeenCalled();
});
