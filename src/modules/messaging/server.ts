import { requireCustomerAccess, requireInternalAccess } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";

export type MessageSurface = "admin" | "work" | "customer";

type ConversationRow = {
  conversation_id: string;
  branch_id: string;
  audience: "INTERNAL" | "CUSTOMER";
  customer_id: string | null;
  subject: string;
  participant_summary: string;
  last_message_preview: string | null;
  last_message_at: string | null;
  updated_at: string;
  unread_count: number;
};

export async function loadMessagingWorkspace(surface: MessageSurface, selectedId?: string, before?: string, beforeId?: string) {
  const access = surface === "customer" ? await requireCustomerAccess() : await requireInternalAccess(surface === "work" ? "/work/login" : "/login");
  const branchId = "branchId" in access ? access.branchId : null;
  const customerId = "customerId" in access ? access.customerId : null;
  const supabase = await createServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  const { data: conversations, error: listError } = await supabase.rpc("conversation_list_for_scope", {
    target_branch_id: branchId,
    target_customer_id: customerId,
    before_updated_at: null,
    before_id: null,
    page_size: 25,
  });
  if (listError) throw listError;
  const id = /^[0-9a-f-]{36}$/i.test(selectedId ?? "") ? selectedId : (conversations?.[0]?.conversation_id ?? null);
  let conversation = null;
  let messages: Array<{ id: string; body: string; sender_auth_user_id: string; created_at: string }> = [];
  let participants: Array<{ auth_user_id: string; display_name_snapshot: string }> = [];
  if (id) {
    let query = supabase
      .from("conversations")
      .select("id,subject,audience,branch_id,customer_id,participant_summary,updated_at")
      .eq("id", id);
    query = customerId ? query.eq("customer_id", customerId).eq("audience", "CUSTOMER") : query.eq("branch_id", branchId);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    conversation = data;
    if (conversation) {
      const dateCursor = before && Number.isFinite(Date.parse(before)) ? before : null;
      const idCursor = /^[0-9a-f-]{36}$/i.test(beforeId ?? "") ? beforeId : null;
      const [{ data: page, error: pageError }, { data: members, error: memberError }] = await Promise.all([
        supabase.rpc("conversation_message_page", {
          target_conversation_id: conversation.id,
          before_created_at: dateCursor && idCursor ? dateCursor : null,
          before_id: dateCursor && idCursor ? idCursor : null,
          page_size: 50,
        }),
        supabase.from("conversation_participants").select("auth_user_id,display_name_snapshot").eq("conversation_id", conversation.id).limit(50),
      ]);
      if (pageError || memberError) throw pageError ?? memberError;
      messages = (page ?? []) as typeof messages;
      participants = (members ?? []) as typeof participants;
    }
  }
  const { data: options, error: optionsError } = surface === "admin" && branchId
    ? await supabase.rpc("messaging_participant_options", { target_branch_id: branchId, result_limit: 200 })
    : { data: [], error: null };
  if (optionsError) throw optionsError;
  return {
    conversations: (conversations ?? []) as ConversationRow[],
    conversation,
    messages,
    participants,
    options: options ?? [],
    currentUserId: userData.user?.id ?? "",
    surface,
    branchId,
  };
}
