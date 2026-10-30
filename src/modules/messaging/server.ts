import "server-only";

// FB14 (D36): "Tin nhắn" like Messenger — the contacts the database lets the person write to (messenger_contacts), one
// direct conversation per contact, older conversations with a subject, and the "Trợ lý AI" chat for staff with ai.use.
import { requireCustomerAccess, requireInternalAccess } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { loadAiChat, type AiChatTurn } from "@/modules/ai/chat-history";

export type MessageSurface = "admin" | "work" | "customer";
const UUID = /^[0-9a-f-]{36}$/i;

export type MessengerContact = {
  auth_user_id: string;
  contact_kind: "EMPLOYEE" | "CUSTOMER";
  display_name: string;
  subtitle: string;
  customer_id: string | null;
  conversation_id: string | null;
  last_message_preview: string | null;
  last_message_at: string | null;
  unread_count: number;
};

type ConversationRow = {
  conversation_id: string;
  subject: string;
  participant_summary: string;
  last_message_preview: string | null;
  updated_at: string;
  unread_count: number;
};

export type MessengerMessage = { id: string; body: string; sender_auth_user_id: string; created_at: string };

export type MessengerThread =
  | { kind: "ai"; turns: AiChatTurn[] }
  | { kind: "new"; contact: MessengerContact }
  | { kind: "conversation"; id: string; title: string; subtitle: string; contact: MessengerContact | null; messages: MessengerMessage[];
      names: Record<string, string>; group: boolean };

/** The messenger scope of the signed-in person: their branch (staff) or their customer account. */
export async function messengerScope(surface: MessageSurface) {
  if (surface === "customer") {
    const access = await requireCustomerAccess();
    return { branchId: null, customerId: access.customerId, canAi: false };
  }
  const access = await requireInternalAccess(surface === "work" ? "/work/login" : "/login");
  return { branchId: access.branchId, customerId: null, canAi: new Set(access.permissions).has("ai.use") };
}

export async function loadMessenger(surface: MessageSurface, params: { conversation?: string; contact?: string; customer?: string; ai?: string; before?: string; beforeId?: string }) {
  const scope = await messengerScope(surface);
  const supabase = await createServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  const me = userData.user?.id ?? "";
  const [contactsResult, listResult] = await Promise.all([
    supabase.rpc("messenger_contacts", { target_branch_id: scope.branchId, target_customer_id: scope.customerId }),
    supabase.rpc("conversation_list_for_scope", { target_branch_id: scope.branchId, target_customer_id: scope.customerId, before_updated_at: null, before_id: null, page_size: 25 }),
  ]);
  if (contactsResult.error || listResult.error) throw new Error("Không tải được tin nhắn. Vui lòng thử lại.");
  const contacts = (contactsResult.data ?? []) as MessengerContact[];
  const direct = new Set(contacts.map((contact) => contact.conversation_id).filter(Boolean));
  // Conversations that are not a direct chat with a current contact: the older ones with a subject.
  const others = ((listResult.data ?? []) as ConversationRow[]).filter((row) => !direct.has(row.conversation_id));

  let thread: MessengerThread | null = null;
  if (params.ai && scope.canAi && scope.branchId) {
    thread = { kind: "ai", turns: await loadAiChat(supabase, scope.branchId) };
  } else if (params.conversation && UUID.test(params.conversation)) {
    let query = supabase.from("conversations").select("id, subject, participant_summary").eq("id", params.conversation);
    query = scope.customerId ? query.eq("customer_id", scope.customerId).eq("audience", "CUSTOMER") : query.eq("branch_id", scope.branchId!);
    const { data: conversation, error } = await query.maybeSingle();
    if (error) throw new Error("Không tải được hội thoại. Vui lòng thử lại.");
    if (conversation) {
      const dateCursor = params.before && Number.isFinite(Date.parse(params.before)) ? params.before : null;
      const idCursor = params.beforeId && UUID.test(params.beforeId) ? params.beforeId : null;
      const [{ data: page, error: pageError }, { data: members, error: memberError }] = await Promise.all([
        supabase.rpc("conversation_message_page", { target_conversation_id: conversation.id, before_created_at: dateCursor && idCursor ? dateCursor : null,
          before_id: dateCursor && idCursor ? idCursor : null, page_size: 50 }),
        supabase.from("conversation_participants").select("auth_user_id, display_name_snapshot").eq("conversation_id", conversation.id).limit(50),
      ]);
      if (pageError || memberError) throw new Error("Không tải được tin nhắn. Vui lòng thử lại.");
      const contact = contacts.find((item) => item.conversation_id === conversation.id) ?? null;
      const unread = contact?.unread_count ?? others.find((row) => row.conversation_id === conversation.id)?.unread_count ?? 0;
      // Opening a conversation reads it, like Messenger.
      if (unread > 0 && !dateCursor) {
        await supabase.rpc("mark_conversation_read", { target_conversation_id: conversation.id });
        if (contact) contact.unread_count = 0;
        const row = others.find((item) => item.conversation_id === conversation.id);
        if (row) row.unread_count = 0;
      }
      const people = (members ?? []) as Array<{ auth_user_id: string; display_name_snapshot: string }>;
      thread = {
        kind: "conversation", id: conversation.id,
        title: contact?.display_name ?? (conversation.subject === "Tin nhắn trực tiếp" ? conversation.participant_summary : conversation.subject),
        subtitle: contact?.subtitle ?? conversation.participant_summary,
        contact, messages: ((page ?? []) as MessengerMessage[]).reverse(),
        names: Object.fromEntries(people.map((person) => [person.auth_user_id, person.display_name_snapshot])), group: people.length > 2,
      };
    }
  } else if (params.contact && UUID.test(params.contact)) {
    const contact = contacts.find((item) => item.auth_user_id === params.contact && (item.customer_id ?? "") === (params.customer ?? ""));
    if (contact) thread = contact.conversation_id ? null : { kind: "new", contact };
  }
  return { contacts, others, thread, me, canAi: scope.canAi, surface };
}
