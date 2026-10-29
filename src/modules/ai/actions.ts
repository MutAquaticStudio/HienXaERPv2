"use server";

// FB12 (D34d): "Hỏi AI" and the approval of the assistant's proposals.
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { askAssistant, type AiAnswer } from "@/modules/ai/assistant";
import { AI_MODULES } from "@/modules/ai/sources";

const askSchema = z.object({
  module: z.enum(AI_MODULES),
  question: z.string().trim().min(2).max(2000),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(8000) })).max(20),
});

export async function askAiAction(input: unknown): Promise<AiAnswer> {
  const parsed = askSchema.safeParse(input);
  if (!parsed.success) return { outcome: "ERROR", text: "Câu hỏi cần từ 2 đến 2.000 ký tự.", proposals: 0 };
  const access = await requireInternalPermission("ai.use");
  const supabase = await createServerSupabase();
  const today = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "full" }).format(new Date());
  // The API needs alternating turns that start with the person: drop a leading assistant greeting, keep the last 20.
  const firstQuestion = parsed.data.history.findIndex((turn) => turn.role === "user");
  const history = firstQuestion < 0 ? [] : parsed.data.history.slice(firstQuestion);
  const answer = await askAssistant({ supabase, branchId: access.branchId, module: parsed.data.module, history, question: parsed.data.question, today });
  if (answer.proposals) revalidatePath("/admin/ai");
  return answer;
}

export type ProposalState = { success?: boolean; message?: string } | undefined;

export async function decideAiProposalAction(_: ProposalState, form: FormData): Promise<ProposalState> {
  const parsed = z.object({ proposalId: z.guid(), decision: z.enum(["DONE", "DISMISSED"]), operationId: z.guid() }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { message: "Không xác định được đề xuất." };
  await requireInternalPermission("ai.manage");
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("decide_ai_proposal", {
    target_proposal_id: parsed.data.proposalId, decision: parsed.data.decision, operation_id: parsed.data.operationId,
  });
  if (error) return { message: "Bạn không có quyền duyệt đề xuất này." };
  revalidatePath("/admin/ai");
  return { success: true, message: parsed.data.decision === "DONE" ? "Đã đánh dấu đã làm." : "Đã bỏ qua đề xuất." };
}
