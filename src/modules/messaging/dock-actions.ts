"use server";

// FB14 (D36): the Facebook-style contact bar on every page and its small chat windows. Same rules as "Tin nhắn": the
// database gives the contacts, opens the direct conversation and checks every message.
import { createServerSupabase } from "@/lib/supabase/server";
import { messengerScope, type MessageSurface, type MessengerContact, type MessengerMessage } from "@/modules/messaging/server";
import { userFacingError } from "@/lib/core/errors";

const UUID = /^[0-9a-f-]{36}$/i;
const SURFACES = ["admin", "work", "customer"] as const;
const validSurface = (surface: unknown): surface is MessageSurface => (SURFACES as readonly unknown[]).includes(surface);

export type DockData = { contacts: MessengerContact[]; canAi: boolean };
export type ChatTarget = { conversationId: string | null; contactId: string | null; contactCustomerId: string | null };
export type ChatData = { conversationId: string | null; messages: MessengerMessage[]; me: string };
export type ChatSendResult = { ok: true; conversationId: string } | { ok: false; message: string };

export async function loadDockAction(surface: MessageSurface): Promise<DockData> {
  if (!validSurface(surface)) return { contacts: [], canAi: false };
  const scope = await messengerScope(surface);
  const { data, error } = await (await createServerSupabase()).rpc("messenger_contacts", { target_branch_id: scope.branchId, target_customer_id: scope.customerId });
  if (error) throw new Error("Không tải được danh bạ.");
  return { contacts: (data ?? []) as MessengerContact[], canAi: scope.canAi };
}

/** The last 30 messages of a chat window; opening it reads the conversation. */
export async function loadChatAction(surface: MessageSurface, target: ChatTarget): Promise<ChatData> {
  if (!validSurface(surface)) throw new Error("Không tải được tin nhắn.");
  await messengerScope(surface);
  const supabase = await createServerSupabase();
  const { data: user } = await supabase.auth.getUser();
  const me = user.user?.id ?? "";
  if (!target.conversationId || !UUID.test(target.conversationId)) return { conversationId: null, messages: [], me };
  const { data, error } = await supabase.rpc("conversation_message_page", { target_conversation_id: target.conversationId, before_created_at: null, before_id: null, page_size: 30 });
  if (error) throw new Error("Không tải được tin nhắn.");
  await supabase.rpc("mark_conversation_read", { target_conversation_id: target.conversationId });
  return { conversationId: target.conversationId, messages: ((data ?? []) as MessengerMessage[]).reverse(), me };
}

export async function sendChatAction(surface: MessageSurface, target: ChatTarget, body: string, operationId: string): Promise<ChatSendResult> {
  const text = String(body ?? "").trim();
  if (!validSurface(surface) || !text || text.length > 4000 || !UUID.test(operationId)) return { ok: false, message: "Nhập nội dung tin nhắn (tối đa 4.000 ký tự)." };
  const scope = await messengerScope(surface);
  const supabase = await createServerSupabase();
  let conversationId = target.conversationId && UUID.test(target.conversationId) ? target.conversationId : null;
  if (!conversationId) {
    if (!target.contactId || !UUID.test(target.contactId) || (target.contactCustomerId && !UUID.test(target.contactCustomerId))) return { ok: false, message: "Không xác định được người nhận." };
    const { data, error } = await supabase.rpc("open_direct_conversation", { target_branch_id: scope.branchId, target_customer_id: scope.customerId,
      contact_auth_user_id: target.contactId, contact_customer_id: target.contactCustomerId });
    if (error || !data) return { ok: false, message: /forbidden/.test(error?.message ?? "") ? "Bạn không nhắn được cho người này." : "Chưa gửi được tin nhắn. Kiểm tra kết nối rồi thử lại." };
    conversationId = String(data);
  }
  const { error } = await supabase.rpc("send_message", { target_conversation_id: conversationId, target_body: text, operation_id: operationId });
  if (error) return { ok: false, message: /forbidden/.test(error.message) ? "Bạn không nhắn được cho người này." : userFacingError(error.message, "Chưa gửi được tin nhắn. Kiểm tra kết nối rồi thử lại.") };
  return { ok: true, conversationId };
}
