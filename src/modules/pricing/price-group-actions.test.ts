import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: vi.fn(async () => ({ branchId: "branch-a" })) }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => ({ rpc: m.rpc })) }));
import { savePriceGroupAction } from "./price-group-actions";

const operationId = "11111111-1111-4111-8111-111111111111";
beforeEach(() => { m.rpc.mockReset(); m.rpc.mockResolvedValue({ data: "DAI_LY", error: null }); });

it("saves the group code in upper case", async () => {
  expect((await savePriceGroupAction({ operationId, code: " dai_ly ", name: "Đại lý", active: true, reason: "Thêm nhóm" })).success).toBe(true);
  expect(m.rpc).toHaveBeenCalledWith("save_customer_price_group", { target_branch_id: "branch-a", group_code: "DAI_LY", group_name: "Đại lý", group_active: true, change_reason: "Thêm nhóm", operation_id: operationId });
});

it("refuses unreadable codes before the database and keeps a lost reply retryable", async () => {
  expect((await savePriceGroupAction({ operationId, code: "Đại lý", name: "Đại lý", active: true, reason: "Thêm nhóm" })).message).toContain("Mã nhóm");
  expect(m.rpc).not.toHaveBeenCalled();
  m.rpc.mockRejectedValueOnce(new Error("network"));
  expect(await savePriceGroupAction({ operationId, code: "SI", name: "Sỉ", active: true, reason: "Thêm nhóm" })).toMatchObject({ success: false, outcomeUnknown: true });
});
