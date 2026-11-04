import "server-only";

// FB14 (D36): the person's conversation with the chatbot, stored per person and branch (ai_chat_messages, own rows only).
import type { createServerSupabase } from "@/lib/supabase/server";
import type { AiTurn } from "@/modules/ai/assistant";
import type { AiTurnAttachment } from "@/modules/ai/attachment-limits";
import { attachmentViews, type StoredAttachment } from "@/modules/ai/attachment-store";

/** D63: a question also lists its kept files (pictures come with a one-hour link). */
export type AiChatTurn = AiTurn & { id: string; attachments?: AiTurnAttachment[] };

/** The person's current chat with the assistant (shared by Tin nhắn and the floating bubble), oldest first. */
export async function loadAiChat(supabase: Awaited<ReturnType<typeof createServerSupabase>>, branchId: string, limit = 40, withFiles = true): Promise<AiChatTurn[]> {
  const { data, error } = await supabase.from("ai_chat_messages").select("id, role, body, attachments").eq("branch_id", branchId).eq("archived", false)
    .order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error("Không tải được cuộc trò chuyện với trợ lý AI.");
  const rows = (data ?? []).reverse() as { id: string; role: AiTurn["role"]; body: string; attachments?: StoredAttachment[] | null }[];
  const views = withFiles ? await attachmentViews(supabase, rows.flatMap((row) => row.attachments ?? [])) : [];
  let next = 0;
  return rows.map((row) => {
    const files = row.attachments ?? [];
    const attachments = withFiles && files.length ? views.slice(next, next += files.length) : undefined;
    return { id: row.id, role: row.role, text: row.body, ...(attachments ? { attachments } : {}) };
  });
}
