"use server";

// FB12 (D34d) → FB14 (D36): the chatbot conversation (kept per person) and the approval of the assistant's proposals.
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { askAssistant, type AiAnswer } from "@/modules/ai/assistant";
import { attachmentBlocks, type AiContentBlock } from "@/modules/ai/attachments";
import { AI_MODEL_IDS, DEFAULT_AI_MODEL } from "@/modules/ai/models";
import { listAiActionsAction, type AiActionCard } from "@/modules/ai/agent/actions";
import { loadAiChat, type AiChatTurn } from "@/modules/ai/chat-history";

const askSchema = z.object({ question: z.string().trim().min(2).max(2000), model: z.enum(AI_MODEL_IDS).default(DEFAULT_AI_MODEL) });

export async function loadAiChatAction(): Promise<AiChatTurn[]> {
  const access = await requireInternalPermission("ai.use");
  return loadAiChat(await createServerSupabase(), access.branchId);
}

/** The answer, with the cards of the actions the assistant prepared in this turn (FB15, D37). */
export type AiChatAnswer = AiAnswer & { actions: AiActionCard[] };

/** A question from the chat: a FormData with `question`, `model` and the attached `files` (D50), or a plain object. */
export async function askAiAction(input: unknown): Promise<AiChatAnswer> {
  const form = input instanceof FormData ? input : null;
  const parsed = askSchema.safeParse(form ? { question: form.get("question"), model: form.get("model") || undefined } : input);
  if (!parsed.success) return { outcome: "ERROR", text: "Câu hỏi cần từ 2 đến 2.000 ký tự.", proposals: 0, actions: [] };
  const access = await requireInternalPermission("ai.use");
  const files = form ? form.getAll("files").filter((value): value is File => value instanceof File && value.name !== "") : [];
  let attachments: AiContentBlock[] = [];
  let attachedNames: string[] = [];
  if (files.length) {
    const read = await attachmentBlocks(files);
    if ("problem" in read) return { outcome: "ERROR", text: read.problem, proposals: 0, actions: [] };
    attachments = read.blocks;
    attachedNames = read.names;
  }
  const supabase = await createServerSupabase();
  const today = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "full" }).format(new Date());
  // The API needs alternating turns that start with the person: keep the last 20 stored turns from a question on.
  const stored = (await loadAiChat(supabase, access.branchId, 20)).map(({ role, text }) => ({ role, text }));
  const firstQuestion = stored.findIndex((turn) => turn.role === "user");
  const history = firstQuestion < 0 ? [] : stored.slice(firstQuestion);
  const answer = await askAssistant({ supabase, branchId: access.branchId, permissions: new Set(access.permissions), history,
    question: parsed.data.question, today, model: parsed.data.model, attachments });
  // Only answered turns are kept: a failure (no key, quota, error) is shown once and not sent to the assistant again.
  // Attached files are not stored: the kept question only names them.
  if (answer.outcome === "OK") {
    await supabase.rpc("save_ai_chat_turn", { target_branch_id: access.branchId, question: withAttachmentNames(parsed.data.question, attachedNames),
      answer: answer.text.slice(0, 20000), operation_id: randomUUID() });
  }
  if (answer.proposals) revalidatePath("/admin/ai");
  const actions = answer.actionIds?.length ? await listAiActionsAction({ ids: answer.actionIds }) : [];
  return { ...answer, actions };
}

/** The question as kept in the chat: the attached files' names follow it on one line ("📎 a.pdf, b.xlsx"). */
function withAttachmentNames(question: string, names: readonly string[]): string {
  if (!names.length) return question;
  return `${question}\n📎 ${names.map((name) => name.slice(0, 120)).join(", ")}`.slice(0, 4000);
}

/** "Cuộc trò chuyện mới": earlier turns are archived and no longer sent to the assistant. */
export async function newAiChatAction(): Promise<{ success: boolean }> {
  const access = await requireInternalPermission("ai.use");
  const { error } = await (await createServerSupabase()).rpc("start_new_ai_chat", { target_branch_id: access.branchId });
  return { success: !error };
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
