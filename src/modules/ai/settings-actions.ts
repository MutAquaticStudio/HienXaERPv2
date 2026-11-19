"use server";

// D50: Cài đặt → Trợ lý AI — set, replace or remove the Claude API key (ai.manage). A new key is tried against Claude first
// (one model lookup, no tokens) so a wrong key is refused before it replaces a working one. The key goes to Vault through
// the database; it is never returned, logged or shown again.
import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireInternalPermission } from "@/lib/access/context";
import { isAuthoritativeRejection } from "@/lib/core/command-outcome";
import { createServerSupabase } from "@/lib/supabase/server";
import { DEFAULT_AI_MODEL } from "@/modules/ai/models";

export type AiKeyActionResult = { ok: boolean; message: string };

const UNKNOWN: AiKeyActionResult = { ok: false, message: "Chưa xác định được kết quả. Tải lại trang để kiểm tra." };
const keyInput = z.object({ apiKey: z.string().trim().regex(/^sk-ant-[A-Za-z0-9_-]{20,250}$/), operationId: z.guid() });

/** Whether Claude accepts the key: "OK", "REJECTED" (wrong / revoked key) or "UNKNOWN" (Claude could not be reached). */
async function tryKey(apiKey: string): Promise<"OK" | "REJECTED" | "UNKNOWN"> {
  try {
    await new Anthropic({ apiKey, maxRetries: 1, timeout: 15_000 }).models.retrieve(DEFAULT_AI_MODEL);
    return "OK";
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) return "REJECTED";
    // Not found means the key works but the account cannot use this model yet: the key itself is fine.
    if (error instanceof Anthropic.NotFoundError) return "OK";
    return "UNKNOWN";
  }
}

function refused(error: { code?: string; message?: string }): AiKeyActionResult {
  if (!isAuthoritativeRejection(error.code)) return UNKNOWN;
  if (error.message?.includes("ai_api_key_invalid")) return { ok: false, message: "Khóa API không đúng định dạng (bắt đầu bằng sk-ant-)." };
  if (error.message?.includes("ai_vault_unavailable")) return { ok: false, message: "Hệ thống chưa bật kho khóa bí mật (Vault). Báo quản trị viên." };
  if (error.message?.includes("forbidden")) return { ok: false, message: "Bạn không có quyền quản lý trợ lý AI." };
  return { ok: false, message: "Chưa lưu được khóa API. Vui lòng thử lại." };
}

export async function saveAiApiKeyAction(input: unknown): Promise<AiKeyActionResult> {
  const parsed = keyInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Khóa API không đúng định dạng (bắt đầu bằng sk-ant-)." };
  await requireInternalPermission("ai.manage");
  const tried = await tryKey(parsed.data.apiKey);
  if (tried === "REJECTED") return { ok: false, message: "Claude không nhận khóa này (sai hoặc đã bị thu hồi). Kiểm tra lại trên console.anthropic.com." };
  if (tried === "UNKNOWN") return { ok: false, message: "Chưa kiểm tra được khóa với Claude. Vui lòng thử lại sau ít phút." };
  try {
    const { data, error } = await (await createServerSupabase()).rpc("set_ai_api_key", { api_key: parsed.data.apiKey, operation_id: parsed.data.operationId });
    if (error) return refused(error);
    revalidatePath("/admin/settings/ai");
    return { ok: true, message: `Đã lưu khóa mới (…${String(data)}). Trợ lý AI dùng khóa này từ câu hỏi tiếp theo.` };
  } catch {
    return UNKNOWN;
  }
}

export async function clearAiApiKeyAction(input: unknown): Promise<AiKeyActionResult> {
  const parsed = z.object({ operationId: z.guid() }).safeParse(input);
  if (!parsed.success) return UNKNOWN;
  await requireInternalPermission("ai.manage");
  try {
    const { error } = await (await createServerSupabase()).rpc("clear_ai_api_key", { operation_id: parsed.data.operationId });
    if (error) return refused(error);
    revalidatePath("/admin/settings/ai");
    return { ok: true, message: "Đã gỡ khóa trong ứng dụng." };
  } catch {
    return UNKNOWN;
  }
}
