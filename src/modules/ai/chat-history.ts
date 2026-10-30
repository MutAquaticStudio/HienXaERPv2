import "server-only";

// FB14 (D36): the person's conversation with the chatbot, stored per person and branch (ai_chat_messages, own rows only).
import type { createServerSupabase } from "@/lib/supabase/server";
import type { AiTurn } from "@/modules/ai/assistant";

export type AiChatTurn = AiTurn & { id: string };

/** The person's current chat with the assistant (shared by Tin nhắn and the floating bubble), oldest first. */
export async function loadAiChat(supabase: Awaited<ReturnType<typeof createServerSupabase>>, branchId: string, limit = 40): Promise<AiChatTurn[]> {
  const { data, error } = await supabase.from("ai_chat_messages").select("id, role, body").eq("branch_id", branchId).eq("archived", false)
    .order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error("Không tải được cuộc trò chuyện với trợ lý AI.");
  return (data ?? []).reverse().map((row) => ({ id: row.id as string, role: row.role as AiTurn["role"], text: row.body as string }));
}
