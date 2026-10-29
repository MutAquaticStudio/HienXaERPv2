"use server";

// FB15 (D37): the cards of the assistant's prepared actions. "Xác nhận" runs the action's normal command under the
// person's own session (the database checks their permissions again) with the action id as operation id, so pressing
// twice, or again after a lost answer, writes once. A failed run stays waiting: the person can fix the cause and press
// again, or "Bỏ qua".
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireInternalPermission } from "@/lib/access/context";
import { userFacingError } from "@/lib/core/errors";
import { createServerSupabase } from "@/lib/supabase/server";
import { agentActionOf, canUseAction, type SummaryLine } from "./registry";
import { ResolveError } from "./resolve";

export type AiActionCard = { id: string; title: string; summary: SummaryLine[]; state: "PENDING" | "DONE" | "FAILED" | "CANCELLED"; link: string | null; message: string | null };
export type AiActionOutcome = { ok: boolean; card?: AiActionCard; message: string };

const COLUMNS = "id, title, summary, state, result_link, result_message, kind, payload";
const idSchema = z.object({ actionId: z.guid() });
type Row = { id: string; title: string; summary: SummaryLine[]; state: AiActionCard["state"]; result_link: string | null; result_message: string | null; kind: string; payload: Record<string, unknown> };
const card = (row: Row): AiActionCard => ({ id: row.id, title: row.title, summary: row.summary ?? [], state: row.state, link: row.result_link, message: row.result_message });

/** Messages of the commands' usual refusals; anything else stays generic (the action can be retried). */
function runFailure(error: unknown): string {
  if (error instanceof ResolveError) return error.message;
  const text = error instanceof Error ? error.message : "";
  if (/forbidden|permission|42501/i.test(text)) return "Bạn không có quyền thực hiện thao tác này.";
  if (/credit_limit|credit_commitment/i.test(text)) return "Vượt hạn mức công nợ của khách; mở đơn để xin duyệt.";
  if (/insufficient|not_enough|shortage|stock/i.test(text)) return "Không đủ hàng trong kho cho thao tác này.";
  if (/version|stale|conflict/i.test(text)) return "Chứng từ vừa được người khác thay đổi. Hỏi trợ lý soạn lại.";
  return userFacingError(text, "Chưa thực hiện được. Kiểm tra lại thông tin rồi bấm Xác nhận lần nữa, hoặc Bỏ qua.");
}

/** The cards of the given actions (after an answer) or of all still waiting ones (opening the chat). */
export async function listAiActionsAction(input?: { ids?: string[] }): Promise<AiActionCard[]> {
  const access = await requireInternalPermission("ai.use");
  const ids = z.array(z.guid()).max(20).safeParse(input?.ids ?? []);
  let query = (await createServerSupabase()).from("ai_actions").select(COLUMNS).eq("branch_id", access.branchId);
  query = ids.success && ids.data.length ? query.in("id", ids.data) : query.eq("state", "PENDING");
  const { data, error } = await query.order("created_at").limit(20);
  if (error) return [];
  return (data as unknown as Row[]).map(card);
}

export async function confirmAiActionAction(input: unknown): Promise<AiActionOutcome> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Không xác định được thao tác." };
  const access = await requireInternalPermission("ai.use");
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("ai_actions").select(COLUMNS).eq("id", parsed.data.actionId).eq("branch_id", access.branchId).maybeSingle();
  if (error || !data) return { ok: false, message: "Không tìm thấy thao tác." };
  const row = data as unknown as Row;
  if (row.state !== "PENDING") return { ok: row.state === "DONE", card: card(row), message: row.state === "DONE" ? "Thao tác đã được thực hiện." : "Thao tác đã bỏ qua." };
  const action = agentActionOf(row.kind);
  const permissions = new Set(access.permissions);
  if (!action || !canUseAction(action, permissions)) return { ok: false, card: card(row), message: "Bạn không có quyền thực hiện thao tác này." };
  let result;
  try {
    result = await action.execute({ supabase, branchId: access.branchId, permissions }, row.payload, row.id);
  } catch (failure) {
    return { ok: false, card: card(row), message: runFailure(failure) };
  }
  await supabase.rpc("finish_ai_action", { target_action_id: row.id, new_state: "DONE", link: result.link ?? null, message: result.message });
  revalidatePath("/admin", "layout");
  return { ok: true, card: { ...card(row), state: "DONE", link: result.link ?? null, message: result.message }, message: result.message };
}

export async function dismissAiActionAction(input: unknown): Promise<AiActionOutcome> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Không xác định được thao tác." };
  await requireInternalPermission("ai.use");
  const { error } = await (await createServerSupabase()).rpc("finish_ai_action", { target_action_id: parsed.data.actionId, new_state: "CANCELLED", link: null, message: "Đã bỏ qua." });
  return error ? { ok: false, message: "Không bỏ qua được thao tác." } : { ok: true, message: "Đã bỏ qua." };
}
