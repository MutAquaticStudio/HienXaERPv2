import type { createServerSupabase } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createServerSupabase>>;

/** D97 (TB-2): questions one person may ask the assistant in an hour, across branches (each one is an ai_usage_log row). */
export const AI_QUESTIONS_PER_HOUR = 60;
export const AI_LIMIT_MESSAGE = `Bạn đã hỏi trợ lý AI ${AI_QUESTIONS_PER_HOUR} lần trong 1 giờ qua. Chờ một lúc rồi hỏi tiếp.`;

/**
 * Counts the caller's own questions of the last hour with the caller's session (RLS: a person reads their own usage rows).
 * A count that cannot be read never blocks the question.
 */
export async function aiHourlyLimitReached(supabase: Supabase, authUserId: string, now = Date.now()): Promise<boolean> {
  try {
    const since = new Date(now - 60 * 60 * 1000).toISOString();
    const { count, error } = await supabase.from("ai_usage_log").select("id", { count: "exact", head: true })
      .eq("user_id", authUserId).gte("created_at", since);
    return !error && (count ?? 0) >= AI_QUESTIONS_PER_HOUR;
  } catch {
    return false;
  }
}
