"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInternalPermission } from "@/lib/access/context";
import { isAuthoritativeRejection } from "@/lib/core/command-outcome";
import { createServerSupabase } from "@/lib/supabase/server";
import { AUTOMATION_CHANNELS, AUTOMATION_EVENTS, BUILTIN_KEYS, QUIET_EXEMPTIONS } from "@/modules/settings/automation-presentation";

export type AutomationActionResult = { ok: boolean; message: string };

const ruleInput = z.object({
  ruleId: z.guid().nullable(),
  expectedVersion: z.number().int().positive().nullable(),
  operationId: z.guid(),
  name: z.string().trim().min(3).max(120),
  event: z.enum(AUTOMATION_EVENTS.map((event) => event.value) as [string, ...string[]]),
  minAmountVnd: z.string().trim().regex(/^(|[1-9]\d{0,15})$/),
  problemsOnly: z.boolean(),
  channels: z.array(z.enum(AUTOMATION_CHANNELS.map((channel) => channel.value) as [string, ...string[]])).min(1).max(2),
  target: z.string().trim().max(300),
  recipientMode: z.enum(["PERMISSION", "ROLES", "PEOPLE"]),
  roleIds: z.array(z.guid()).max(50),
  employeeIds: z.array(z.guid()).max(200),
  active: z.boolean(),
}).refine((rule) => rule.recipientMode !== "ROLES" || rule.roleIds.length > 0, { path: ["roleIds"] })
  .refine((rule) => rule.recipientMode !== "PEOPLE" || rule.employeeIds.length > 0, { path: ["employeeIds"] })
  .refine((rule) => !rule.channels.includes("WEBHOOK") || rule.target.length >= 3, { path: ["target"] });
export type AutomationRuleInput = z.input<typeof ruleInput>;

function failure(error: { code?: string; message?: string }): AutomationActionResult {
  if (error.message?.includes("automation_rule_invalid")) return { ok: false, message: "Kiểm tra lại người nhận và địa chỉ webhook (https công khai)." };
  if (error.message?.includes("quiet_hours_invalid")) return { ok: false, message: "Giờ bắt đầu và giờ kết thúc phải khác nhau." };
  if (error.code === "PT409" || error.message?.includes("version_conflict")) return { ok: false, message: "Vừa có người khác sửa trên máy khác. Tải bản mới rồi sửa lại — thay đổi của anh/chị chưa được lưu." };
  if (error.code === "42501") return { ok: false, message: "Bạn không có quyền quản lý quy tắc tự động." };
  return { ok: false, message: isAuthoritativeRejection(error.code) ? "Chưa lưu được." : "Chưa rõ đã lưu chưa (mất kết nối). Tải lại trang để kiểm tra." };
}

export async function saveAutomationRuleAction(input: AutomationRuleInput): Promise<AutomationActionResult> {
  const parsed = ruleInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Nhập tên quy tắc (từ 3 ký tự), chọn người nhận, kênh gửi và địa chỉ webhook nếu có." };
  const access = await requireInternalPermission("roles.manage");
  const supabase = await createServerSupabase();
  const rule = parsed.data;
  const webhook = rule.channels.includes("WEBHOOK");
  const { error } = await supabase.rpc("save_automation_rule", { target_rule_id: rule.ruleId, target_branch_id: access.branchId, expected_version: rule.expectedVersion,
    operation_id: rule.operationId, rule: { name: rule.name, event: rule.event, min_amount_vnd: rule.minAmountVnd, problems_only: rule.problemsOnly,
      channels: rule.channels, target: webhook ? rule.target : null, active: rule.active, recipient_mode: rule.recipientMode,
      role_ids: rule.recipientMode === "ROLES" ? rule.roleIds : [], employee_ids: rule.recipientMode === "PEOPLE" ? rule.employeeIds : [] } });
  if (error) return failure(error);
  revalidatePath("/admin/settings/automation");
  return { ok: true, message: "Đã lưu quy tắc." };
}

export async function deleteAutomationRuleAction(ruleId: unknown): Promise<AutomationActionResult> {
  const id = z.guid().safeParse(ruleId);
  if (!id.success) return { ok: false, message: "Không xác định được quy tắc." };
  await requireInternalPermission("roles.manage");
  const { error } = await (await createServerSupabase()).rpc("delete_automation_rule", { target_rule_id: id.data, operation_id: crypto.randomUUID() });
  if (error) return failure(error);
  revalidatePath("/admin/settings/automation");
  return { ok: true, message: "Đã xóa quy tắc." };
}

const notOnThisDevice = "Máy của anh/chị chưa bật thông báo. Bấm “Bật thông báo trên máy này” ở trang Thông báo rồi gửi thử lại.";

/** D93: "Gửi thử" reaches only the current user's own devices. */
export async function testAutomationRuleAction(ruleId: unknown): Promise<AutomationActionResult> {
  const id = z.guid().safeParse(ruleId);
  if (!id.success) return { ok: false, message: "Không xác định được quy tắc." };
  await requireInternalPermission("roles.manage");
  const { data, error } = await (await createServerSupabase()).rpc("test_automation_rule", { target_rule_id: id.data, operation_id: crypto.randomUUID() });
  if (error) return failure(error);
  revalidatePath("/admin/settings/automation");
  return Number(data) > 0 ? { ok: true, message: `Đã gửi thử tới ${Number(data)} máy của anh/chị. Xem kết quả ở “Lịch sử gửi” sau ít giây.` } : { ok: false, message: notOnThisDevice };
}

const previewInput = z.object({ title: z.string().trim().min(3).max(200), body: z.string().trim().max(300), operationId: z.guid() });

/** "Gửi thử cho tôi" in the rule editor, before saving: the preview text to the current user's own devices. */
export async function sendTestPushAction(input: z.input<typeof previewInput>): Promise<AutomationActionResult> {
  const parsed = previewInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Chưa có nội dung để gửi thử." };
  const access = await requireInternalPermission("roles.manage");
  const { data, error } = await (await createServerSupabase()).rpc("send_test_push", { target_branch_id: access.branchId, push_title: parsed.data.title,
    push_body: parsed.data.body, operation_id: parsed.data.operationId });
  if (error) return failure(error);
  return Number(data) > 0 ? { ok: true, message: `Đã gửi thử tới ${Number(data)} máy của anh/chị.` } : { ok: false, message: notOnThisDevice };
}

const builtinInput = z.object({ key: z.enum(BUILTIN_KEYS), enabled: z.boolean() });

/** D93 (2): turn a built-in push on or off for the branch; the in-app notification / popup stays either way. */
export async function setBuiltinPushAction(input: z.input<typeof builtinInput>): Promise<AutomationActionResult> {
  const parsed = builtinInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Không xác định được thông báo." };
  const access = await requireInternalPermission("roles.manage");
  const { error } = await (await createServerSupabase()).rpc("set_builtin_push", { target_branch_id: access.branchId, target_key: parsed.data.key,
    enabled: parsed.data.enabled, operation_id: crypto.randomUUID() });
  if (error) return failure(error);
  revalidatePath("/admin/settings/automation");
  return { ok: true, message: parsed.data.enabled ? "Đã bật báo về điện thoại." : "Đã tắt báo về điện thoại. Thông báo trong app vẫn hiện." };
}

const quietInput = z.object({
  enabled: z.boolean(),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(0).max(1439),
  exemptKeys: z.array(z.enum(QUIET_EXEMPTIONS.map((item) => item.value) as [string, ...string[]])).max(3),
  expectedVersion: z.number().int().positive().nullable(),
  operationId: z.guid(),
}).refine((value) => value.startMinute !== value.endMinute, { path: ["endMinute"] });

/** D93 (4): the branch's quiet hours. */
export async function saveQuietHoursAction(input: z.input<typeof quietInput>): Promise<AutomationActionResult> {
  const parsed = quietInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Giờ bắt đầu và giờ kết thúc phải khác nhau." };
  const access = await requireInternalPermission("roles.manage");
  const value = parsed.data;
  const { error } = await (await createServerSupabase()).rpc("save_quiet_hours", { target_branch_id: access.branchId, expected_version: value.expectedVersion,
    operation_id: value.operationId, settings: { enabled: value.enabled, start_minute: value.startMinute, end_minute: value.endMinute, exempt_keys: value.exemptKeys } });
  if (error) return failure(error);
  revalidatePath("/admin/settings/automation");
  return { ok: true, message: value.enabled ? "Đã lưu giờ yên lặng." : "Đã tắt giờ yên lặng." };
}
