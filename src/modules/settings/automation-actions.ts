"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInternalPermission } from "@/lib/access/context";
import { isAuthoritativeRejection } from "@/lib/core/command-outcome";
import { createServerSupabase } from "@/lib/supabase/server";
import { AUTOMATION_CHANNELS, AUTOMATION_EVENTS } from "@/modules/settings/automation-presentation";

export type AutomationActionResult = { ok: boolean; message: string };

const ruleInput = z.object({
  ruleId: z.uuid().nullable(),
  expectedVersion: z.number().int().positive().nullable(),
  operationId: z.uuid(),
  name: z.string().trim().min(3).max(120),
  event: z.enum(AUTOMATION_EVENTS.map((event) => event.value) as [string, ...string[]]),
  minAmountVnd: z.string().trim().regex(/^(|[1-9]\d{0,15})$/),
  problemsOnly: z.boolean(),
  channel: z.enum(AUTOMATION_CHANNELS.map((channel) => channel.value) as [string, ...string[]]),
  target: z.string().trim().max(300),
  active: z.boolean(),
});
export type AutomationRuleInput = z.input<typeof ruleInput>;

function failure(error: { code?: string; message?: string }): AutomationActionResult {
  if (error.message?.includes("automation_rule_invalid")) return { ok: false, message: "Kiểm tra lại nơi nhận: mã Telegram (số), email hợp lệ, hoặc địa chỉ https công khai." };
  if (error.code === "PT409" || error.message?.includes("version_conflict")) return { ok: false, message: "Quy tắc vừa được người khác sửa. Tải lại trang rồi sửa lại." };
  if (error.code === "42501") return { ok: false, message: "Bạn không có quyền quản lý quy tắc tự động." };
  return { ok: false, message: isAuthoritativeRejection(error.code) ? "Chưa lưu được quy tắc." : "Chưa rõ đã lưu chưa. Tải lại trang để kiểm tra." };
}

export async function saveAutomationRuleAction(input: AutomationRuleInput): Promise<AutomationActionResult> {
  const parsed = ruleInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Nhập tên quy tắc (từ 3 ký tự), sự kiện, kênh gửi và nơi nhận." };
  const access = await requireInternalPermission("roles.manage");
  const supabase = await createServerSupabase();
  const rule = parsed.data;
  const { error } = await supabase.rpc("save_automation_rule", { target_rule_id: rule.ruleId, target_branch_id: access.branchId, expected_version: rule.expectedVersion,
    operation_id: rule.operationId, rule: { name: rule.name, event: rule.event, min_amount_vnd: rule.minAmountVnd, problems_only: rule.problemsOnly,
      channel: rule.channel, target: rule.channel === "PUSH" ? null : rule.target, active: rule.active } });
  if (error) return failure(error);
  revalidatePath("/admin/settings/automation");
  return { ok: true, message: "Đã lưu quy tắc." };
}

export async function deleteAutomationRuleAction(ruleId: unknown): Promise<AutomationActionResult> {
  const id = z.uuid().safeParse(ruleId);
  if (!id.success) return { ok: false, message: "Không xác định được quy tắc." };
  await requireInternalPermission("roles.manage");
  const { error } = await (await createServerSupabase()).rpc("delete_automation_rule", { target_rule_id: id.data, operation_id: crypto.randomUUID() });
  if (error) return failure(error);
  revalidatePath("/admin/settings/automation");
  return { ok: true, message: "Đã xóa quy tắc." };
}

export async function testAutomationRuleAction(ruleId: unknown): Promise<AutomationActionResult> {
  const id = z.uuid().safeParse(ruleId);
  if (!id.success) return { ok: false, message: "Không xác định được quy tắc." };
  await requireInternalPermission("roles.manage");
  const { data, error } = await (await createServerSupabase()).rpc("test_automation_rule", { target_rule_id: id.data, operation_id: crypto.randomUUID() });
  if (error) return failure(error);
  revalidatePath("/admin/settings/automation");
  return Number(data) > 0
    ? { ok: true, message: "Đã gửi thử. Xem kết quả ở “Lịch sử gửi” sau ít giây." }
    : { ok: false, message: "Máy của bạn chưa bật thông báo. Bật ở trang Thông báo rồi gửi thử lại." };
}
