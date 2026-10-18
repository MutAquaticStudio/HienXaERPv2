import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn(), access: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: m.access }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({ rpc: m.rpc }) }));
import { saveAutomationRuleAction, testAutomationRuleAction } from "./automation-actions";

const rule = { ruleId: null, expectedVersion: null, operationId: "11111111-1111-4111-8111-111111111111", name: "Đơn lớn", event: "order.portal_submitted",
  minAmountVnd: "5000000", problemsOnly: false, channel: "TELEGRAM", target: "-1001234567", active: true };
beforeEach(() => { vi.clearAllMocks(); m.access.mockResolvedValue({ branchId: "b1" }); m.rpc.mockResolvedValue({ data: "r1", error: null }); });

it("saves a rule for the active branch under roles.manage", async () => {
  expect(await saveAutomationRuleAction(rule)).toEqual({ ok: true, message: "Đã lưu quy tắc." });
  expect(m.access).toHaveBeenCalledWith("roles.manage");
  expect(m.rpc).toHaveBeenCalledWith("save_automation_rule", expect.objectContaining({ target_branch_id: "b1", target_rule_id: null,
    rule: { name: "Đơn lớn", event: "order.portal_submitted", min_amount_vnd: "5000000", problems_only: false, channel: "TELEGRAM", target: "-1001234567", active: true } }));
  await saveAutomationRuleAction({ ...rule, channel: "PUSH", target: "bỏ qua" });
  expect(m.rpc.mock.calls[1][1].rule.target).toBeNull();
});

it("rejects unknown events or channels and explains database refusals", async () => {
  expect((await saveAutomationRuleAction({ ...rule, event: "drop.table" })).ok).toBe(false);
  expect((await saveAutomationRuleAction({ ...rule, channel: "SMS" })).ok).toBe(false);
  expect(m.rpc).not.toHaveBeenCalled();
  m.rpc.mockResolvedValue({ data: null, error: { code: "22023", message: "automation_rule_invalid" } });
  expect((await saveAutomationRuleAction(rule)).message).toContain("nơi nhận");
  m.rpc.mockResolvedValue({ data: null, error: { code: "PT409", message: "automation_rule_version_conflict" } });
  expect((await saveAutomationRuleAction(rule)).message).toContain("người khác sửa");
});

it("tells the manager to turn on push on this device when a push test reaches nobody", async () => {
  m.rpc.mockResolvedValue({ data: 0, error: null });
  expect((await testAutomationRuleAction("22222222-2222-4222-8222-222222222222")).message).toContain("chưa bật thông báo");
});
