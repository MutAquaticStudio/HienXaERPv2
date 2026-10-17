import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: vi.fn(async () => ({ branchId: "b" })) }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => ({ rpc: m.rpc })) }));

import { applyRoutePlanAction } from "./actions";

const form = () => {
  const data = new FormData();
  data.set("plan_id", "11111111-1111-4111-8111-111111111111");
  data.set("expected_version", "1");
  data.set("operation_id", "22222222-2222-4222-8222-222222222222");
  return data;
};
beforeEach(() => m.rpc.mockReset());

it("explains why a route could not be applied in Vietnamese", async () => {
  const cases: [string, string][] = [
    ["vehicle_capacity_basis_missing", "Chưa đủ dữ liệu kiểm tra tải xe"],
    ["delivery_employee_cannot_report_work", "Người giao phải có tài khoản đang hoạt động"],
    ["work_resource_schedule_collision", "Khung giờ phân giao đang chồng lấn"],
    ["route_stop_schedule_required", "Tạo lại đề xuất lộ trình"],
    ["route_delivery_stale", "Dữ liệu giao hàng đã thay đổi"],
  ];
  for (const [code, text] of cases) {
    m.rpc.mockResolvedValueOnce({ data: null, error: { message: code } });
    const state = await applyRoutePlanAction({ status: "idle", message: "" }, form());
    expect(state.status).toBe("error");
    expect(state.message).toContain(text);
  }
  m.rpc.mockResolvedValueOnce({ data: "p", error: null });
  expect((await applyRoutePlanAction({ status: "idle", message: "" }, form())).status).toBe("success");
});
