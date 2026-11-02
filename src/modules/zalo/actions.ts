"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInternalPermission } from "@/lib/access/context";
import { isAuthoritativeRejection } from "@/lib/core/command-outcome";
import { createServerSupabase } from "@/lib/supabase/server";
import { ZALO_EVENT_CODES, zaloMessage } from "./presentation";

export type ZaloActionResult = { ok: true; message: string; url?: string } | { ok: false; message: string };

const unknownZaloResult: ZaloActionResult = { ok: false, message: "Chưa xác định được kết quả. Tải lại trang để kiểm tra." };
function refusedZalo(error: { code?: string; message?: string }): ZaloActionResult {
  return isAuthoritativeRejection(error.code) ? { ok: false, message: zaloMessage(error.message) } : unknownZaloResult;
}

const templateInput = z.object({
  event: z.enum(ZALO_EVENT_CODES),
  templateId: z.string().trim().regex(/^(\d{1,20})?$/),
  active: z.boolean(),
  version: z.number().int().positive(),
});

/** Map an event to its approved template and switch it on or off. */
export async function saveZaloTemplateAction(input: unknown): Promise<ZaloActionResult> {
  const parsed = templateInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: zaloMessage("zalo_template_invalid") };
  if (parsed.data.active && !parsed.data.templateId) return { ok: false, message: zaloMessage("zalo_template_required") };
  await requireInternalPermission("roles.manage");
  try {
    const { error } = await (await createServerSupabase()).rpc("set_zalo_template", {
      target_event: parsed.data.event, target_template_id: parsed.data.templateId, enabled: parsed.data.active, expected_version: parsed.data.version,
    });
    if (error) return refusedZalo(error);
    revalidatePath("/admin/settings/zalo");
    return { ok: true, message: parsed.data.active ? "Đã lưu và bật gửi tin này." : "Đã lưu. Tin này đang tắt." };
  } catch {
    return unknownZaloResult;
  }
}

/** development = Zalo only delivers to the OA/App admins (testing); production = real customers. */
export async function setZaloModeAction(mode: unknown): Promise<ZaloActionResult> {
  const parsed = z.enum(["development", "production"]).safeParse(mode);
  if (!parsed.success) return { ok: false, message: zaloMessage("zalo_mode_invalid") };
  await requireInternalPermission("roles.manage");
  try {
    const { error } = await (await createServerSupabase()).rpc("set_zalo_send_mode", { target_mode: parsed.data });
    if (error) return refusedZalo(error);
    revalidatePath("/admin/settings/zalo");
    return { ok: true, message: parsed.data === "production" ? "Đã chuyển sang gửi cho khách thật." : "Đã chuyển về chế độ thử (chỉ quản trị OA nhận)." };
  } catch {
    return unknownZaloResult;
  }
}

export async function disconnectZaloAction(): Promise<ZaloActionResult> {
  await requireInternalPermission("roles.manage");
  try {
    const { error } = await (await createServerSupabase()).rpc("disconnect_zalo");
    if (error) return refusedZalo(error);
    revalidatePath("/admin/settings/zalo");
    return { ok: true, message: "Đã ngắt kết nối Zalo OA. Không gửi thêm tin nào." };
  } catch {
    return unknownZaloResult;
  }
}

const testInput = z.object({ event: z.enum(ZALO_EVENT_CODES), phone: z.string().trim().min(9).max(20), operationId: z.guid() });

/** "Gửi thử" one message with sample values (in development mode only OA/App admins receive it). */
export async function sendZaloTestAction(input: unknown): Promise<ZaloActionResult> {
  const parsed = testInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: zaloMessage("zalo_phone_invalid") };
  await requireInternalPermission("roles.manage");
  try {
    const { error } = await (await createServerSupabase()).rpc("send_zalo_test", {
      target_event: parsed.data.event, target_phone: parsed.data.phone, operation_id: parsed.data.operationId,
    });
    if (error) return refusedZalo(error);
    revalidatePath("/admin/settings/zalo");
    return { ok: true, message: "Đã đưa tin thử vào hàng gửi. Kết quả hiện ở mục “24 giờ qua” sau khoảng 1 phút." };
  } catch {
    return unknownZaloResult;
  }
}
