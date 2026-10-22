import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: vi.fn(async () => ({ branchId: "branch-a" })) }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => ({ rpc: m.rpc })) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
import { cancelPlannedDeliveryAction } from "./cancel-planned-action";

const ids = { delivery: "11111111-1111-4111-8111-111111111111", op: "22222222-2222-4222-8222-222222222222" };
const form = (reason: string) => { const data = new FormData(); for (const [key, value] of Object.entries({ deliveryId: ids.delivery, version: "4", operationId: ids.op, reason })) data.set(key, value); return data; };
beforeEach(() => { vi.clearAllMocks(); m.rpc.mockResolvedValue({ data: ids.delivery, error: null }); });

it("cancels a planned delivery without a note and records a plain description (FB7)", async () => {
  await expect(cancelPlannedDeliveryAction(form(""))).rejects.toThrow("notice=cancelled");
  expect(m.rpc).toHaveBeenCalledWith("cancel_planned_delivery", { target_delivery_id: ids.delivery, expected_version: 4, cancellation_reason: "Hủy kế hoạch giao hàng", operation_id: ids.op });
  await expect(cancelPlannedDeliveryAction(form("Khách dời ngày"))).rejects.toThrow("notice=cancelled");
  expect(m.rpc).toHaveBeenLastCalledWith("cancel_planned_delivery", expect.objectContaining({ cancellation_reason: "Khách dời ngày" }));
});
