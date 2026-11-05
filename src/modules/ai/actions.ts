"use server";

// FB12 (D34d) → FB14 (D36): the chatbot conversation (kept per person) and the approval of the assistant's proposals.
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireInternalPermission } from "@/lib/access/context";
import { formatBusinessDateTime } from "@/lib/core/business-time";
import { createServerSupabase } from "@/lib/supabase/server";
import { askAssistant, type AiAnswer } from "@/modules/ai/assistant";
import { attachmentBlocks, type AiContentBlock, type ReadAttachment } from "@/modules/ai/attachments";
import { storeAttachments } from "@/modules/ai/attachment-store";
import { AI_EFFORT_IDS, AI_MODEL_IDS, DEFAULT_AI_EFFORT, DEFAULT_AI_MODEL } from "@/modules/ai/models";
import { listAiActionsAction, type AiActionCard } from "@/modules/ai/agent/actions";
import { loadAiChat, type AiChatTurn } from "@/modules/ai/chat-history";

const askSchema = z.object({ question: z.string().trim().min(2).max(2000), model: z.enum(AI_MODEL_IDS).default(DEFAULT_AI_MODEL),
  effort: z.enum(AI_EFFORT_IDS).default(DEFAULT_AI_EFFORT) });

export async function loadAiChatAction(): Promise<AiChatTurn[]> {
  const access = await requireInternalPermission("ai.use");
  return loadAiChat(await createServerSupabase(), access.branchId);
}

/** The answer, with the cards of the actions the assistant prepared in this turn (FB15, D37). */
export type AiChatAnswer = AiAnswer & { actions: AiActionCard[] };

/** A question from the chat: a FormData with `question`, `model`, `effort` and the attached `files` (D50), or a plain object. */
export async function askAiAction(input: unknown): Promise<AiChatAnswer> {
  const form = input instanceof FormData ? input : null;
  const parsed = askSchema.safeParse(form ? { question: form.get("question"), model: form.get("model") || undefined, effort: form.get("effort") || undefined } : input);
  if (!parsed.success) return { outcome: "ERROR", text: "Câu hỏi cần từ 2 đến 2.000 ký tự.", proposals: 0, actions: [] };
  const access = await requireInternalPermission("ai.use");
  const files = form ? form.getAll("files").filter((value): value is File => value instanceof File && value.name !== "") : [];
  let attachments: AiContentBlock[] = [];
  let attachedNames: string[] = [];
  let attachedFiles: ReadAttachment[] = [];
  if (files.length) {
    const read = await attachmentBlocks(files);
    if ("problem" in read) return { outcome: "ERROR", text: read.problem, proposals: 0, actions: [] };
    attachments = read.blocks;
    attachedNames = read.names;
    attachedFiles = read.files;
  }
  const supabase = await createServerSupabase();
  const today = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "full" }).format(new Date());
  // The API needs alternating turns that start with the person: keep the last 20 stored turns from a question on.
  const stored = (await loadAiChat(supabase, access.branchId, 20, false)).map(({ role, text }) => ({ role, text }));
  const firstQuestion = stored.findIndex((turn) => turn.role === "user");
  const history = firstQuestion < 0 ? [] : stored.slice(firstQuestion);
  const answer = await askAssistant({ supabase, branchId: access.branchId, permissions: new Set(access.permissions), history,
    question: parsed.data.question, today, model: parsed.data.model, effort: parsed.data.effort, attachments });
  // Only answered turns are kept: a failure (no key, quota, error) is shown once and not sent to the assistant again.
  // D63: the attached files are kept in the person's own folder so the chat shows them again; the question still names them,
  // which is what the assistant reads back later. A file that could not be uploaded is only named.
  if (answer.outcome === "OK") {
    const operationId = randomUUID();
    const kept = attachedFiles.length ? await storeAttachments(supabase, access.authUserId, operationId, attachedFiles).catch(() => []) : [];
    await supabase.rpc("save_ai_chat_turn", { target_branch_id: access.branchId, question: withAttachmentNames(parsed.data.question, attachedNames),
      answer: answer.text.slice(0, 20000), operation_id: operationId, attachments: kept });
  }
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

/** D66: a proposal of the assistant waiting for a manager, shown as a card inside the chat. */
export type AiProposalCard = { id: string; title: string; body: string; linkPath: string | null; createdAt: string };
export type AiProposalList = { proposals: AiProposalCard[]; canDecide: boolean };

export async function listAiProposalsAction(): Promise<AiProposalList> {
  const access = await requireInternalPermission("ai.use");
  const { data, error } = await (await createServerSupabase()).from("ai_proposals").select("id, title, body, link_path, created_at")
    .eq("branch_id", access.branchId).eq("state", "PENDING").order("created_at", { ascending: false }).limit(30);
  if (error) return { proposals: [], canDecide: false };
  const rows = data as { id: string; title: string; body: string; link_path: string | null; created_at: string }[];
  return { canDecide: access.permissions.has("ai.manage"),
    proposals: rows.map((row) => ({ id: row.id, title: row.title, body: row.body, linkPath: row.link_path, createdAt: formatBusinessDateTime(row.created_at) })) };
}

/** "Đã làm" / "Bỏ qua" on a proposal card: the database lets only a person who may manage the assistant decide. */
export async function decideAiProposalAction(input: unknown): Promise<{ ok: boolean; message: string }> {
  const parsed = z.object({ proposalId: z.guid(), decision: z.enum(["DONE", "DISMISSED"]) }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Không xác định được đề xuất." };
  await requireInternalPermission("ai.manage");
  const { error } = await (await createServerSupabase()).rpc("decide_ai_proposal", {
    target_proposal_id: parsed.data.proposalId, decision: parsed.data.decision, operation_id: randomUUID(),
  });
  if (error) return { ok: false, message: "Bạn không có quyền duyệt đề xuất này." };
  revalidatePath("/admin", "layout");
  return { ok: true, message: parsed.data.decision === "DONE" ? "Đã đánh dấu đã làm." : "Đã bỏ qua đề xuất." };
}
