"use server";

// FB15 (D37): the cards of the assistant's prepared actions. "Xác nhận" runs the action's normal command under the
// person's own session (the database checks their permissions again) with the action id as operation id, so pressing
// twice, or again after a lost answer, writes once. A failed run stays waiting: the person can fix the cause and press
// again, or "Bỏ qua".
import { revalidatePath } from "next/cache";
import { z, ZodError } from "zod";

import { requireInternalPermission } from "@/lib/access/context";
import { AppError, userFacingError } from "@/lib/core/errors";
import { derivedOperationId } from "@/modules/sales/auto-sourcing";
import { createServerSupabase } from "@/lib/supabase/server";
import { catalogCreateProps, catalogEditorScope } from "@/modules/catalog/editor-data";
import { catalogs } from "@/modules/catalog/fields";
import { buildFormSpec, FORM_HINTS, type FormSpec } from "./form-spec";
import { agentActionOf, canUseAction, type ListView, type SummaryLine } from "./registry";
import { ResolveError } from "./resolve";
import { prepareFailure } from "./tools";

/** D63/D64: a list card also shows its rows, each with the action's own word ("Tạo", "Lưu giá"…) or why it is skipped. */
export type AiActionCard = { id: string; title: string; summary: SummaryLine[]; state: "PENDING" | "DONE" | "FAILED" | "CANCELLED"; link: string | null; message: string | null; list?: ListView;
  /** D65: "Xem và sửa" opens this form (any action but catalog records), pre-filled from the assistant's input. */
  form?: FormSpec;
  /** D65: "Xem và sửa" opens the real catalog form of this kind ("Thêm nhà cung cấp"…), pre-filled. */
  catalog?: { kind: string; title: string; site: boolean };
};
export type AiActionOutcome = { ok: boolean; card?: AiActionCard; message: string };

const COLUMNS = "id, title, summary, state, result_link, result_message, kind, payload";
const idSchema = z.object({ actionId: z.guid() });
/** Most rows a list card may hold (the purchase price book takes 500). */
const LIST_CARD_MAX = 500;
const confirmSchema = idSchema.extend({ exclude: z.array(z.number().int().min(1).max(LIST_CARD_MAX)).max(LIST_CARD_MAX).optional() });
type Row = { id: string; title: string; summary: SummaryLine[]; state: AiActionCard["state"]; result_link: string | null; result_message: string | null; kind: string; payload: Record<string, unknown> };
const card = (row: Row): AiActionCard => {
  const action = agentActionOf(row.kind);
  const payload = row.payload ?? {};
  const list = action?.view?.(payload);
  const pending = row.state === "PENDING";
  const form = pending && action && !action.catalog ? buildFormSpec(row.kind, action.properties, payload.__input as Record<string, unknown> | undefined) : null;
  const catalog = pending && action?.catalog ? { kind: action.catalog.kind, title: catalogs[action.catalog.kind].title, site: Boolean(action.catalog.site?.(payload, row.id)) } : null;
  return { id: row.id, title: row.title, summary: row.summary ?? [], state: row.state, link: row.result_link, message: row.result_message,
    ...(list ? { list } : {}), ...(form ? { form } : {}), ...(catalog ? { catalog } : {}) };
};

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
  const parsed = confirmSchema.safeParse(input);
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
    result = await action.execute({ supabase, branchId: access.branchId, permissions }, row.payload, row.id, { exclude: parsed.data.exclude ?? [] });
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


/* ---------- D65: "Xem và sửa" ---------- */

const CATALOG_LINKS: Record<string, (id: string) => string> = { customers: (id) => `/admin/customers/${id}`, suppliers: () => "/admin/suppliers", materials: (id) => `/admin/products/${id}` };

async function pendingRow(actionId: string) {
  const access = await requireInternalPermission("ai.use");
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("ai_actions").select(COLUMNS).eq("id", actionId).eq("branch_id", access.branchId).maybeSingle();
  if (error || !data) return { problem: "Không tìm thấy thao tác." } as const;
  const row = data as unknown as Row;
  if (row.state !== "PENDING") return { problem: row.state === "DONE" ? "Thao tác đã được thực hiện." : "Thao tác đã bỏ qua." } as const;
  const action = agentActionOf(row.kind);
  const permissions = new Set(access.permissions);
  if (!action || !canUseAction(action, permissions)) return { problem: "Bạn không có quyền thực hiện thao tác này." } as const;
  return { problem: undefined, access, supabase, row, action, permissions } as const;
}

export type CatalogFormProps = { kind: string; title: string; options: Awaited<ReturnType<typeof catalogCreateProps>>["options"]; permissions: string[]; scope: string;
  initial: Record<string, string>; operationId: string };
export type CatalogFormOutcome = { ok: true; form: CatalogFormProps } | { ok: false; message: string };

/** The catalog form of a card ("Thêm nhà cung cấp"…): its choices, the person's rights and the values the assistant filled in. */
export async function loadAiCatalogFormAction(input: unknown): Promise<CatalogFormOutcome> {
  const parsed = idSchema.extend({ site: z.boolean().optional() }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Không xác định được thao tác." };
  const found = await pendingRow(parsed.data.actionId);
  if (found.problem) return { ok: false, message: found.problem };
  const { access, supabase, row, action, permissions } = found;
  const hint = action.catalog;
  if (!hint) return { ok: false, message: "Thao tác này không có form." };
  const kind = parsed.data.site ? "sites" : hint.kind;
  const config = catalogs[kind];
  if (!config || !permissions.has(config.permission)) return { ok: false, message: "Bạn không có quyền thêm bản ghi này." };
  const initial = parsed.data.site ? hint.site?.(row.payload, row.id) : hint.initial(row.payload);
  if (!initial) return { ok: false, message: "Thao tác này không có công trình đi kèm." };
  const base = { authUserId: access.authUserId, branchId: access.branchId, permissions };
  const props = await catalogCreateProps(kind, base, supabase);
  // One recovery scope and one operation per card (and per step), so a half-typed form of the normal screen never lands on it.
  return { ok: true, form: { kind, title: config.title, options: props.options, permissions: props.permissions, scope: catalogEditorScope(base, kind, `${row.id}${parsed.data.site ? ":site" : ""}`),
    initial, operationId: parsed.data.site ? derivedSiteOperation(row.id) : row.id } };
}

/** The first site of a new customer uses its own operation id, derived from the card. */
function derivedSiteOperation(actionId: string): string {
  return derivedOperationId(actionId, "site-form");
}

/** The record the catalog form saved (its id is the card's id): marks the card done once the record really exists. */
export async function finishAiCatalogActionAction(input: unknown): Promise<AiActionOutcome> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Không xác định được thao tác." };
  const found = await pendingRow(parsed.data.actionId);
  if (found.problem) return { ok: false, message: found.problem };
  const { supabase, row, action } = found;
  const kind = action.catalog?.kind;
  if (!kind) return { ok: false, message: "Thao tác này không có form." };
  const exists = await supabase.from(catalogs[kind].table as "materials").select("id").eq("id", row.id).maybeSingle();
  if (exists.error || !exists.data) return { ok: false, message: "Chưa thấy bản ghi vừa lưu. Lưu form trước." };
  const link = CATALOG_LINKS[kind]?.(row.id) ?? null;
  const message = `Đã lưu ${catalogs[kind].title.toLowerCase()} từ form.`;
  await supabase.rpc("finish_ai_action", { target_action_id: row.id, new_state: "DONE", link, message });
  revalidatePath("/admin", "layout");
  return { ok: true, card: { ...card(row), state: "DONE", link, message }, message };
}

/** The checks name an input by its key (so_tien); the form names it by its label. */
function formIssues(kind: string, error: ZodError): string {
  const hints = FORM_HINTS[kind];
  const lines = error.issues.map((issue) => {
    const [key, , column] = issue.path as (string | number)[];
    const label = key === undefined ? "" : hints?.labels[String(key)] ?? String(key);
    const part = typeof column === "string" ? ` — ${hints?.lineLabels?.[column] ?? column}` : "";
    return `${label ? `${label}${part}: ` : ""}${issue.message.replace(/\.+$/, "")}`;
  });
  return `Thông tin chưa hợp lệ. ${[...new Set(lines)].join("; ")}.`;
}

const formSchema = idSchema.extend({ values: z.record(z.string().max(60), z.unknown()) });

/** "Lưu" in the form: the edited values go through the action's own `prepare` (every check), then its normal command. */
export async function submitAiActionFormAction(input: unknown): Promise<AiActionOutcome> {
  const parsed = formSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Thông tin form chưa hợp lệ." };
  const found = await pendingRow(parsed.data.actionId);
  if (found.problem) return { ok: false, message: found.problem };
  const { access, supabase, row, action, permissions } = found;
  if (action.catalog || !FORM_HINTS[row.kind]) return { ok: false, message: "Thao tác này không có form." };
  const context = { supabase, branchId: access.branchId, permissions };
  let result;
  try {
    const prepared = await action.prepare(context, parsed.data.values);
    result = await action.execute(context, prepared.payload, row.id, {});
  } catch (failure) {
    // A refusal of the checks (not found, several matches, a missing price…) reads as a line under the form; the form stays open.
    if (failure instanceof ZodError) return { ok: false, message: formIssues(row.kind, failure) };
    const message = failure instanceof ResolveError || failure instanceof AppError ? prepareFailure(failure).replace(/^Lỗi:\s*/, "") : runFailure(failure);
    return { ok: false, message };
  }
  await supabase.rpc("finish_ai_action", { target_action_id: row.id, new_state: "DONE", link: result.link ?? null, message: result.message });
  revalidatePath("/admin", "layout");
  return { ok: true, card: { ...card(row), state: "DONE", link: result.link ?? null, message: result.message }, message: result.message };
}
