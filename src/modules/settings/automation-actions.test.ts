import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn(), access: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: m.access }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({ rpc: m.rpc }) }));
import { saveAutomationRuleAction, saveQuietHoursAction, sendTestPushAction, setBuiltinPushAction, testAutomationRuleAction } from "./automation-actions";

const role = "33333333-3333-4333-8333-333333333333";
const rule = { ruleId: null, expectedVersion: null, operationId: "11111111-1111-4111-8111-111111111111", name: "Đơn lớn", event: "order.portal_submitted",
  minAmountVnd: "5000000", problemsOnly: false, channels: ["PUSH", "WEBHOOK"], target: "https://hooks.example.test/hx", recipientMode: "ROLES" as const,
  roleIds: [role], employeeIds: ["44444444-4444-4444-8444-444444444444"], active: true };
beforeEach(() => { vi.clearAllMocks(); m.access.mockResolvedValue({ branchId: "b1" }); m.rpc.mockResolvedValue({ data: "r1", error: null }); });

it("saves a rule with several channels and chosen roles for the active branch under roles.manage", async () => {
  expect(await saveAutomationRuleAction(rule)).toEqual({ ok: true, message: "Đã lưu quy tắc." });
  expect(m.access).toHaveBeenCalledWith("roles.manage");
  expect(m.rpc).toHaveBeenCalledWith("save_automation_rule", expect.objectContaining({ target_branch_id: "b1", target_rule_id: null,
    rule: { name: "Đơn lớn", event: "order.portal_submitted", min_amount_vnd: "5000000", problems_only: false, channels: ["PUSH", "WEBHOOK"],
      target: "https://hooks.example.test/hx", active: true, recipient_mode: "ROLES", role_ids: [role], employee_ids: [] } }));
  await saveAutomationRuleAction({ ...rule, channels: ["PUSH"], target: "bỏ qua", recipientMode: "PERMISSION" });
  expect(m.rpc.mock.calls[1][1].rule).toEqual(expect.objectContaining({ target: null, role_ids: [], employee_ids: [], recipient_mode: "PERMISSION" }));
});

it("refuses Telegram, email, unknown events, empty recipients and explains database refusals (D93)", async () => {
  for (const bad of [{ ...rule, event: "drop.table" }, { ...rule, channels: ["TELEGRAM"] }, { ...rule, channels: ["EMAIL"] }, { ...rule, channels: [] },
    { ...rule, roleIds: [] }, { ...rule, recipientMode: "PEOPLE" as const, employeeIds: [] }, { ...rule, target: "" }]) {
    expect((await saveAutomationRuleAction(bad)).ok).toBe(false);
  }
  expect(m.rpc).not.toHaveBeenCalled();
  m.rpc.mockResolvedValue({ data: null, error: { code: "22023", message: "automation_rule_invalid" } });
  expect((await saveAutomationRuleAction(rule)).message).toContain("webhook");
  m.rpc.mockResolvedValue({ data: null, error: { code: "PT409", message: "automation_rule_version_conflict" } });
  expect((await saveAutomationRuleAction(rule)).message).toContain("người khác sửa");
  m.rpc.mockRejectedValueOnce(new Error("offline"));
  await expect(saveAutomationRuleAction(rule)).rejects.toThrow();
  m.rpc.mockResolvedValue({ data: null, error: { message: "fetch failed" } });
  expect((await saveAutomationRuleAction(rule)).message).toContain("Chưa rõ");
});

it("accepts the D88 event for portal orders approved when stock arrives", async () => {
  expect(await saveAutomationRuleAction({ ...rule, event: "order.portal_auto_approved", channels: ["PUSH"] })).toEqual({ ok: true, message: "Đã lưu quy tắc." });
  expect(m.rpc.mock.calls[0][1].rule.event).toBe("order.portal_auto_approved");
});

it("tests only on the caller's own devices and says when this device is not switched on", async () => {
  m.rpc.mockResolvedValue({ data: 0, error: null });
  expect((await testAutomationRuleAction("22222222-2222-4222-8222-222222222222")).message).toContain("chưa bật thông báo");
  m.rpc.mockResolvedValue({ data: 2, error: null });
  expect((await sendTestPushAction({ title: "Đơn mới từ khách", body: "Anh Tuấn", operationId: rule.operationId })).message).toContain("2 máy của anh/chị");
  expect(m.rpc).toHaveBeenLastCalledWith("send_test_push", { target_branch_id: "b1", push_title: "Đơn mới từ khách", push_body: "Anh Tuấn", operation_id: rule.operationId });
});

it("switches a built-in push and saves quiet hours", async () => {
  expect(await setBuiltinPushAction({ key: "customer.payment_received", enabled: false })).toEqual({ ok: true, message: "Đã tắt báo về điện thoại. Thông báo trong app vẫn hiện." });
  expect(m.rpc).toHaveBeenCalledWith("set_builtin_push", expect.objectContaining({ target_branch_id: "b1", target_key: "customer.payment_received", enabled: false }));
  expect((await setBuiltinPushAction({ key: "không.có" as never, enabled: false })).ok).toBe(false);
  expect((await saveQuietHoursAction({ enabled: true, startMinute: 1260, endMinute: 390, exemptKeys: ["worker_jobs"], expectedVersion: null, operationId: rule.operationId })).ok).toBe(true);
  expect(m.rpc).toHaveBeenLastCalledWith("save_quiet_hours", { target_branch_id: "b1", expected_version: null, operation_id: rule.operationId,
    settings: { enabled: true, start_minute: 1260, end_minute: 390, exempt_keys: ["worker_jobs"] } });
  expect((await saveQuietHoursAction({ enabled: true, startMinute: 60, endMinute: 60, exemptKeys: [], expectedVersion: 1, operationId: rule.operationId })).message)
    .toContain("phải khác nhau");
});
