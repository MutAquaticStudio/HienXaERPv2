import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: vi.fn(async () => ({ branchId: "10000000-0000-4000-8000-0000000000b1", permissions: new Set(["pricing.manage"]) })) }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => ({})) }));
vi.mock("@/modules/portal/server", () => ({ portalRpc: m.rpc, PortalRpcError: class extends Error { code?: string } }));
import { savePricingRuleAction } from "./actions";

const operationId = "10000000-0000-4000-8000-000000000001", targetId = "10000000-0000-4000-8000-000000000002";
const material = "10000000-0000-4000-8000-000000000003", uom = "10000000-0000-4000-8000-000000000004";
function createForm(withIds = true) {
  const form = new FormData();
  for (const [key, value] of Object.entries({ mode: "create", unitPriceVnd: "95000", sourceType: "LIST", effectiveFrom: "2026-10-20", scopeType: "DEFAULT", materialId: material, priceUomId: uom })) form.set(key, value);
  if (withIds) { form.set("operationId", operationId); form.set("targetId", targetId); }
  return form;
}
beforeEach(() => { m.rpc.mockReset(); m.rpc.mockResolvedValue(targetId); });

it("sends the client's operation and rule IDs, so a retried submit replays instead of duplicating", async () => {
  await savePricingRuleAction(undefined, createForm());
  await savePricingRuleAction(undefined, createForm());
  expect(m.rpc).toHaveBeenCalledTimes(2);
  for (const call of m.rpc.mock.calls) expect(call[2]).toMatchObject({ operation_id: operationId, target_id: targetId });
});

it("no longer asks for a reason: the history gets a plain description, or the note when one is sent (FB7)", async () => {
  await savePricingRuleAction(undefined, createForm());
  expect(m.rpc).toHaveBeenLastCalledWith(expect.anything(), "save_pricing_rule", expect.objectContaining({ change_reason: "Cập nhật giá" }));
  const form = createForm(); form.set("reason", "Giá niêm yết mới");
  await savePricingRuleAction(undefined, form);
  expect(m.rpc).toHaveBeenLastCalledWith(expect.anything(), "save_pricing_rule", expect.objectContaining({ change_reason: "Giá niêm yết mới" }));
});

it("refuses a save without a client operation ID instead of inventing one", async () => {
  expect((await savePricingRuleAction(undefined, createForm(false))).message).toContain("Mã thao tác không hợp lệ");
  expect(m.rpc).not.toHaveBeenCalled();
});

it("uses the client operation ID for deactivation too", async () => {
  const form = new FormData();
  for (const [key, value] of Object.entries({ mode: "deactivate", supersedesId: targetId, expectedVersion: "2", operationId })) form.set(key, value);
  await savePricingRuleAction(undefined, form);
  expect(m.rpc).toHaveBeenCalledWith(expect.anything(), "deactivate_pricing_rule", expect.objectContaining({ operation_id: operationId, expected_version: 2, change_reason: "Ngừng sử dụng giá" }));
});
