"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { LINK_OPTIONS } from "./presentation";

export type AnnouncementCommandResult = { success: boolean; message: string; outcomeUnknown?: boolean; id?: string };

const seenInput = z.object({ ids: z.array(z.guid()).min(1).max(20), operationId: z.guid() });

/** D83: "Đã hiểu", "Đóng" or Esc on the popup — seen once for this account, on every device. False when it did not go through. */
export async function markAnnouncementsSeenAction(input: unknown): Promise<boolean> {
  const parsed = seenInput.safeParse(input);
  if (!parsed.success) return false;
  try {
    const supabase = await createServerSupabase();
    const { error } = await supabase.rpc("mark_announcements_seen", { target_ids: parsed.data.ids, operation_id: parsed.data.operationId });
    return !error;
  } catch {
    return false;
  }
}

const composeInput = z.object({
  operationId: z.guid(),
  audience: z.enum(["CUSTOMER", "WORKER", "OFFICE"]),
  label: z.enum(["NEWS", "FEATURE", "RULE"]),
  title: z.string().trim().min(3).max(80),
  body: z.string().trim().max(600).optional().default(""),
  link: z.string().max(80).optional().default(""),
  roleIds: z.array(z.guid()).max(50).optional().default([]),
}).refine((value) => !value.link || LINK_OPTIONS[value.audience].some((option) => option.value === value.link))
  .refine((value) => value.audience === "OFFICE" || value.roleIds.length === 0);

function composeError(message: string, code?: string): string {
  if (code === "42501" || message.includes("forbidden")) return "Chỉ chủ cửa hàng được gửi thông báo cập nhật.";
  if (message.includes("announcement_no_recipient")) return "Chưa có ai nhận thông báo này. Chọn nhóm người nhận khác.";
  if (message.includes("operation_payload_conflict")) return "Lần gửi trước chưa rõ kết quả và nội dung đã đổi. Tải lại trang, xem mục Đã gửi gần đây rồi gửi lại.";
  if (message.includes("invalid_announcement")) return "Thông báo chưa hợp lệ: tiêu đề 3–80 ký tự, nội dung tối đa 600 ký tự, nút chỉ mở trang trong app.";
  return "Không gửi được thông báo. Thử lại.";
}

/** "Gửi thông báo" (owner only): the popup at the next open, and a push to every device of every recipient. */
export async function createAnnouncementAction(input: unknown): Promise<AnnouncementCommandResult> {
  const parsed = composeInput.safeParse(input);
  if (!parsed.success) return { success: false, message: "Thông báo chưa hợp lệ: tiêu đề 3–80 ký tự, nội dung tối đa 600 ký tự." };
  const access = await requireInternalPermission("roles.manage");
  const value = parsed.data;
  try {
    const supabase = await createServerSupabase();
    const { data, error } = await supabase.rpc("create_announcement", {
      target_branch_id: access.branchId, target_audience: value.audience, target_label: value.label, announcement_title: value.title,
      announcement_body: value.body || null, announcement_link: value.link || null, role_ids: value.roleIds.length ? value.roleIds : null,
      operation_id: value.operationId,
    });
    if (error) return { success: false, message: composeError(error.message, error.code) };
    revalidatePath("/admin/notifications/updates");
    return { success: true, message: "Đã gửi thông báo.", id: typeof data === "string" ? data : undefined };
  } catch {
    return { success: false, outcomeUnknown: true, message: "Chưa rõ đã gửi chưa (mất kết nối). Xem mục Đã gửi gần đây trước khi gửi lại." };
  }
}

const stopInput = z.object({ groupId: z.guid(), operationId: z.guid() });

/** "Ngừng hiện": the announcement stops showing and leaves the recipients' history. */
export async function stopAnnouncementAction(input: unknown): Promise<AnnouncementCommandResult> {
  const parsed = stopInput.safeParse(input);
  if (!parsed.success) return { success: false, message: "Thông báo không hợp lệ. Tải lại trang." };
  await requireInternalPermission("roles.manage");
  try {
    const supabase = await createServerSupabase();
    const { error } = await supabase.rpc("stop_announcement", { target_group_id: parsed.data.groupId, operation_id: parsed.data.operationId });
    if (error) return { success: false, message: error.code === "42501" ? "Chỉ chủ cửa hàng được ngừng thông báo." : "Không ngừng được thông báo. Thử lại." };
    revalidatePath("/admin/notifications/updates");
    return { success: true, message: "Đã ngừng hiện thông báo." };
  } catch {
    return { success: false, outcomeUnknown: true, message: "Chưa rõ đã ngừng chưa (mất kết nối). Tải lại trang để kiểm tra." };
  }
}
