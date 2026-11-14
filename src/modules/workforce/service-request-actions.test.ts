// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ permission: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: mocks.permission }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({ rpc: mocks.rpc }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error("REDIRECT:" + url); } }));

import { rejectServiceRequestAction, scheduleServiceRequestAction } from "./service-request-actions";

const ids = {
  requestId: "2bdfbe30-d09c-4f0e-b66a-3e820ddf4c55", serviceTypeId: "b81b801c-2610-48b9-985e-64b10d859d74",
  operationId: "5d3f0f43-5d4b-4f53-9d55-0a7f42a4a001", vehicleId: "0c3b1c55-9f0c-4f43-8d0a-6a1f9e0b2c11",
};
function form(extra: Record<string, string> = {}) {
  const data = new FormData();
  Object.entries({
    ...ids, version: "1", salesEmployeeId: "", machineId: "", description: "Chạc gạch vỡ ở cổng",
    scheduledStart: "2026-11-15T08:00", scheduledEnd: "2026-11-15T12:00", plannedQuantity: "2", ...extra,
  }).forEach(([key, value]) => data.set(key, value));
  return data;
}

describe("scheduleServiceRequestAction (D75)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.permission.mockResolvedValue({ branchId: "branch-a", permissions: new Set(["service.manage"]) });
    mocks.rpc.mockResolvedValue({ data: "job-1", error: null });
  });

  it("schedules the request in the database with its version and opens the new service job", async () => {
    await expect(scheduleServiceRequestAction(form())).rejects.toThrow("REDIRECT:/admin/service-jobs/job-1?notice=service-created");
    expect(mocks.permission).toHaveBeenCalledWith("service.manage");
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("schedule_service_request", {
      target_request_id: ids.requestId, expected_version: 1, target_service_type_id: ids.serviceTypeId,
      job_start: "2026-11-15T01:00:00.000Z", job_end: "2026-11-15T05:00:00.000Z", job_quantity: "2", job_description: "Chạc gạch vỡ ở cổng",
      target_sales_employee_id: null, target_vehicle_id: ids.vehicleId, target_machine_id: null, operation_id: ids.operationId,
    });
  });

  it("keeps an empty quantity empty (counted on site) and needs a service type before calling the database", async () => {
    await expect(scheduleServiceRequestAction(form({ plannedQuantity: "" }))).rejects.toThrow("notice=service-created");
    expect(mocks.rpc).toHaveBeenCalledWith("schedule_service_request", expect.objectContaining({ job_quantity: null }));
    mocks.rpc.mockClear();
    await expect(scheduleServiceRequestAction(form({ serviceTypeId: "" }))).rejects.toThrow("REDIRECT:/admin/service-jobs/requests?error=");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["service_request_not_open", "đã được xử lý"],
    ["stale_service_request", "vừa thay đổi"],
    ["service_resource_mismatch", "không dùng xe hoặc máy"],
    ["invalid_service_job", "thời gian"],
    ["forbidden", "không có quyền"],
  ])("explains %s in Vietnamese and returns to the request", async (code, text) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: code, code: "23514" } });
    let target = "";
    await scheduleServiceRequestAction(form()).catch((error: Error) => { target = error.message; });
    expect(target).toContain(`REDIRECT:/admin/service-jobs/requests/${ids.requestId}?error=`);
    expect(decodeURIComponent(target)).toContain(text);
    expect(decodeURIComponent(target)).not.toContain(code);
  });
});

describe("rejectServiceRequestAction (D75)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.permission.mockResolvedValue({ branchId: "branch-a", permissions: new Set(["service.manage"]) });
    mocks.rpc.mockResolvedValue({ data: ids.requestId, error: null });
  });
  const reject = (extra: Record<string, string> = {}) => { const data = new FormData(); Object.entries({ requestId: ids.requestId, version: "2", operationId: ids.operationId, reason: "Hết máy trong ngày", ...extra }).forEach(([key, value]) => data.set(key, value)); return data; };

  it("rejects with the reason the customer will read", async () => {
    await expect(rejectServiceRequestAction(reject())).rejects.toThrow(`REDIRECT:/admin/service-jobs/requests/${ids.requestId}?notice=request-rejected`);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("reject_service_request", { target_request_id: ids.requestId, reject_reason: "Hết máy trong ngày", expected_version: 2, operation_id: ids.operationId });
  });

  it("does not invent a reason: the database asks for one", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "reject_reason_required", code: "22023" } });
    let target = "";
    await rejectServiceRequestAction(reject({ reason: "" })).catch((error: Error) => { target = error.message; });
    expect(decodeURIComponent(target)).toContain("Nhập lý do từ chối");
  });
});
