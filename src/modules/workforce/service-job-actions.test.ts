// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ permission: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: mocks.permission }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({ rpc: mocks.rpc }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error("REDIRECT:" + url); } }));

import { cancelScheduledServiceJobAction, createServiceJobAction } from "./actions";

const ids = {
  customerId: "2bdfbe30-d09c-4f0e-b66a-3e820ddf4c55", siteId: "61c446b6-cb9f-49b2-994c-70c73e3e5802",
  serviceTypeId: "b81b801c-2610-48b9-985e-64b10d859d74", operationId: "5d3f0f43-5d4b-4f53-9d55-0a7f42a4a001",
  vehicleId: "0c3b1c55-9f0c-4f43-8d0a-6a1f9e0b2c11",
};
function form(extra: Record<string, string> = {}) {
  const data = new FormData();
  Object.entries({
    ...ids, salesEmployeeId: "", machineId: "", description: "Chở cát lên công trình",
    scheduledStart: "2026-10-20T08:00", scheduledEnd: "2026-10-20T11:00", plannedQuantity: "2", ...extra,
  }).forEach(([key, value]) => data.set(key, value));
  return data;
}

describe("createServiceJobAction (D23)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.permission.mockResolvedValue({ branchId: "branch-a", permissions: new Set(["service.manage"]) });
    mocks.rpc.mockResolvedValue({ data: "job-1", error: null });
  });

  it("schedules from the chosen service type; name, unit and price come from the type in the database", async () => {
    await expect(createServiceJobAction(form())).rejects.toThrow("REDIRECT:/admin/service-jobs/job-1?notice=service-created");
    expect(mocks.permission).toHaveBeenCalledWith("service.manage");
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("schedule_service_job", {
      target_branch_id: "branch-a", target_customer_id: ids.customerId, target_site_id: ids.siteId,
      target_service_type_id: ids.serviceTypeId, description: "Chở cát lên công trình",
      scheduled_start: "2026-10-20T01:00:00.000Z", scheduled_end: "2026-10-20T04:00:00.000Z", planned_quantity: "2",
      target_sales_employee_id: null, target_vehicle_id: ids.vehicleId, target_machine_id: null, operation_id: ids.operationId,
    });
  });

  it.each([
    ["a truck service (no machine field on the form)", ["machineId"], ids.vehicleId],
    ["a service without truck or machine", ["machineId", "vehicleId"], null],
  ])("FB9: schedules %s", async (_name, missing, vehicle) => {
    const data = form({ salesEmployeeId: "" });
    for (const key of missing) data.delete(key);
    await expect(createServiceJobAction(data)).rejects.toThrow("REDIRECT:/admin/service-jobs/job-1?notice=service-created");
    expect(mocks.rpc).toHaveBeenCalledWith("schedule_service_job", expect.objectContaining({ target_vehicle_id: vehicle, target_machine_id: null }));
  });

  it("needs a service type before calling the database", async () => {
    await expect(createServiceJobAction(form({ serviceTypeId: "" }))).rejects.toThrow("REDIRECT:/admin/service-jobs?error=");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["service_resource_mismatch", "Loại dịch vụ này không dùng xe hoặc máy đã chọn"],
    ["invalid_service_type", "Loại dịch vụ đã ngừng dùng"],
  ])("explains %s in Vietnamese", async (code, text) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: code } });
    const error = await createServiceJobAction(form()).catch((caught: Error) => caught);
    expect(decodeURIComponent(String((error as Error).message))).toContain(text);
  });
});

describe("cancelScheduledServiceJobAction (FB7)", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.permission.mockResolvedValue({ branchId: "branch-a", permissions: new Set(["service.manage"]) }); mocks.rpc.mockResolvedValue({ data: null, error: null }); });

  it("cancels without a note and records a plain description", async () => {
    const job = "7a1d4b8e-3c2f-4e5a-9b6c-1d2e3f4a5b6c", data = new FormData();
    Object.entries({ serviceJobId: job, version: "3", reason: "", operationId: ids.operationId }).forEach(([key, value]) => data.set(key, value));
    await expect(cancelScheduledServiceJobAction(data)).rejects.toThrow(`REDIRECT:/admin/service-jobs/${job}?notice=service-cancelled`);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("cancel_scheduled_service_job", { target_service_job_id: job, expected_version: 3, cancellation_reason: "Hủy lịch dịch vụ", operation_id: ids.operationId });
  });
});
