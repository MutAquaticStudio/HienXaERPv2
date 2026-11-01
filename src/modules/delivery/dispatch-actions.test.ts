import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn(), access: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: m.access }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => ({ rpc: m.rpc })) }));

import { quickAssignDeliveryAction } from "./dispatch-actions";

const ids = { delivery: "11111111-1111-4111-8111-111111111111", employee: "22222222-2222-4222-8222-222222222222", vehicle: "33333333-3333-4333-8333-333333333333", op: "44444444-4444-4444-8444-444444444444" };
const form = (values: Record<string, string>) => { const data = new FormData(); for (const [key, value] of Object.entries(values)) data.set(key, value); return data; };
const valid = { deliveryId: ids.delivery, version: "3", employeeId: ids.employee, vehicleId: ids.vehicle, scheduledStart: "2026-11-02T08:00", scheduledEnd: "2026-11-02T09:00", day: "2026-11-02", operationId: ids.op };
beforeEach(() => { vi.clearAllMocks(); m.access.mockResolvedValue({ branchId: "b" }); m.rpc.mockResolvedValue({ data: null, error: null }); });

describe("quick assign from the dispatch board", () => {
  it("runs the usual assignment command with Vietnam times and returns to the same day", async () => {
    await expect(quickAssignDeliveryAction(form(valid))).rejects.toThrow("REDIRECT:/admin/dispatch?day=2026-11-02&dispatched=");
    expect(m.access).toHaveBeenCalledWith("delivery.assign");
    expect(m.rpc).toHaveBeenCalledWith("assign_delivery_scheduled", { target_delivery_id: ids.delivery, target_employee_id: ids.employee, target_vehicle_id: ids.vehicle,
      external_carrier_name: "", external_carrier_phone: "", scheduled_start: "2026-11-02T01:00:00.000Z", scheduled_end: "2026-11-02T02:00:00.000Z", expected_version: 3, operation_id: ids.op });
  });

  it("refuses a missing driver or an end before the start without calling the database", async () => {
    await expect(quickAssignDeliveryAction(form({ ...valid, employeeId: "" }))).rejects.toThrow(/error=/);
    await expect(quickAssignDeliveryAction(form({ ...valid, scheduledEnd: "2026-11-02T07:00" }))).rejects.toThrow(/error=/);
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("shows the assignment refusal in Vietnamese on the board", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: "delivery_version_conflict", hint: null } });
    const failure = await quickAssignDeliveryAction(form(valid)).catch((error: Error) => decodeURIComponent(error.message));
    expect(failure).toMatch(/^REDIRECT:\/admin\/dispatch\?day=2026-11-02&error=/);
    expect(failure).not.toContain("delivery_version_conflict");
  });
});
