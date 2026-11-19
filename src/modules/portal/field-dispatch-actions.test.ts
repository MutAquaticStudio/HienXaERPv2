// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => {
  class PortalRpcError extends Error {
    code?: string; rawMessage: string; hint?: string;
    constructor(error: { message: string; code?: string; hint?: string }) { super(error.message); this.code = error.code; this.rawMessage = error.message; this.hint = error.hint; }
  }
  return { client: vi.fn(), rpc: vi.fn(), revalidate: vi.fn(), PortalRpcError };
});
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
vi.mock("@/modules/portal/server", () => ({ authenticatedPortalClient: m.client, portalRpc: m.rpc, PortalRpcError: m.PortalRpcError }));
import { fieldDispatchAction, fieldDispatchOptionsAction } from "./field-dispatch-actions";

const ids = { delivery: "11111111-1111-4111-8111-111111111111", worker: "22222222-2222-4222-8222-222222222222",
  vehicle: "33333333-3333-4333-8333-333333333333", operation: "44444444-4444-4444-8444-444444444444" };
const base = { kind: "DELIVERY" as const, mode: "ASSIGN" as const, targetId: ids.delivery, employeeId: ids.worker, vehicleId: ids.vehicle,
  chosenStart: null, version: 3, operationId: ids.operation };
beforeEach(() => { vi.clearAllMocks(); m.client.mockResolvedValue({ supabase: {}, user: { id: "u1" } }); m.rpc.mockResolvedValue({ work_item_id: "w1", start_at: "2026-11-16T02:30:00Z" }); });

it("gives a waiting delivery with the system time, with its version and operation", async () => {
  expect(await fieldDispatchAction(base)).toEqual({ ok: true, workItemId: "w1", startAt: "2026-11-16T02:30:00Z" });
  expect(m.rpc).toHaveBeenCalledWith({}, "field_assign_delivery", { target_delivery_id: ids.delivery, target_employee_id: ids.worker,
    target_vehicle_id: ids.vehicle, chosen_start: null, expected_version: 3, operation_id: ids.operation });
  expect(m.revalidate).toHaveBeenCalledWith("/work", "layout");
});

it("changes the person with a picked time, and gives a service job without a truck", async () => {
  await fieldDispatchAction({ ...base, mode: "REASSIGN", chosenStart: "2026-11-16T07:00:00.000Z" });
  expect(m.rpc.mock.calls[0][1]).toBe("field_reassign_delivery");
  expect(m.rpc.mock.calls[0][2]).toMatchObject({ chosen_start: "2026-11-16T07:00:00.000Z" });
  await fieldDispatchAction({ ...base, kind: "SERVICE_JOB", vehicleId: null });
  expect(m.rpc.mock.calls[1]).toEqual([{}, "field_assign_work_item", { target_work_item_id: ids.delivery, target_employee_id: ids.worker,
    chosen_start: null, expected_version: 3, operation_id: ids.operation }]);
  await fieldDispatchAction({ ...base, kind: "SERVICE_JOB", mode: "REASSIGN", vehicleId: null });
  expect(m.rpc.mock.calls[2][1]).toBe("field_reassign_work_item");
});

it("needs a truck for a delivery, a signed-in lead and a valid command", async () => {
  expect((await fieldDispatchAction({ ...base, vehicleId: null })).ok).toBe(false);
  expect((await fieldDispatchAction({ ...base, version: 0 })).ok).toBe(false);
  m.client.mockResolvedValueOnce(null);
  expect(await fieldDispatchAction(base)).toMatchObject({ ok: false, message: expect.stringContaining("Đăng nhập lại") });
  expect(m.rpc).not.toHaveBeenCalled();
});

it("words the refusals in Vietnamese, offers the next free time and reloads when someone else changed it", async () => {
  m.rpc.mockRejectedValueOnce(new m.PortalRpcError({ code: "23P01", message: "field_dispatch_busy", hint: "next_free_at=2026-11-16T04:00:00Z" }));
  const busy = await fieldDispatchAction(base);
  expect(busy).toMatchObject({ ok: false, nextFreeAt: "2026-11-16T04:00:00Z", reload: false });
  expect(busy.ok === false && busy.message).toContain("Rảnh từ 11:00");
  m.rpc.mockRejectedValueOnce(new m.PortalRpcError({ code: "PT409", message: "field_dispatch_taken" }));
  expect(await fieldDispatchAction(base)).toMatchObject({ ok: false, reload: true, message: expect.stringContaining("vừa có người nhận") });
  m.rpc.mockRejectedValueOnce(new m.PortalRpcError({ code: "42501", message: "forbidden" }));
  expect(await fieldDispatchAction(base)).toMatchObject({ ok: false, message: expect.stringContaining("không còn quyền") });
  m.rpc.mockRejectedValueOnce(new Error("fetch failed"));
  expect(await fieldDispatchAction(base)).toMatchObject({ ok: false, unknown: true, message: expect.stringContaining("không ghi hai lần") });
});

it("loads who could take a job instead", async () => {
  m.rpc.mockResolvedValueOnce({ pairs: [], declined: [] });
  expect(await fieldDispatchOptionsAction("DELIVERY", ids.delivery)).toEqual({ ok: true, pairs: [], declined: [] });
  expect(m.rpc).toHaveBeenCalledWith({}, "field_dispatch_options", { target_kind: "DELIVERY", target_id: ids.delivery });
  m.rpc.mockRejectedValueOnce(new m.PortalRpcError({ code: "42501", message: "forbidden" }));
  expect(await fieldDispatchOptionsAction("SERVICE_JOB", ids.delivery)).toMatchObject({ ok: false, message: expect.stringContaining("không còn quyền") });
});
