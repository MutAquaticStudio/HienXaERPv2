"use server";

// FB14 (D36): sending in "Tin nhắn". A first message to a contact opens the direct conversation (the database checks the
// person may write to that contact) and then sends; later messages go to the conversation.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { userFacingError } from "@/lib/core/errors";
import { createServerSupabase } from "@/lib/supabase/server";
import { messengerScope, type MessageSurface } from "@/modules/messaging/server";

export type MessageActionState = { status: "idle" | "success" | "error"; message: string; messageId?: string };

const UUID = /^[0-9a-f-]{36}$/i;
const SURFACES = ["admin", "work", "customer"] as const;
const surfaceOf = (value: FormDataEntryValue | null) => (SURFACES as readonly string[]).includes(String(value)) ? String(value) as MessageSurface : null;
const failed = (message?: string): MessageActionState => ({ status: "error", message: /conversation_participant_forbidden|forbidden/.test(message ?? "")
  ? "Bạn không nhắn được cho người này." : userFacingError(message, "Chưa gửi được tin nhắn. Kiểm tra kết nối rồi thử lại.") });

export async function sendMessageAction(_state: MessageActionState, formData: FormData): Promise<MessageActionState> {
  const conversationId = String(formData.get("conversation_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const surface = surfaceOf(formData.get("surface"));
  const operationId = String(formData.get("operation_id") ?? "");
  if (!UUID.test(conversationId) || !body || body.length > 4000 || !surface || !UUID.test(operationId)) {
    return { status: "error", message: "Nhập nội dung tin nhắn (tối đa 4.000 ký tự)." };
  }
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("send_message", { target_conversation_id: conversationId, target_body: body, operation_id: operationId });
  if (error) return failed(error.message);
  revalidatePath(`/${surface}/messages`);
  return { status: "success", message: "", messageId: String(data) };
}

export async function sendDirectMessageAction(_state: MessageActionState, formData: FormData): Promise<MessageActionState> {
  const contactId = String(formData.get("contact_auth_user_id") ?? "");
  const contactCustomer = String(formData.get("contact_customer_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const surface = surfaceOf(formData.get("surface"));
  const operationId = String(formData.get("operation_id") ?? "");
  if (!UUID.test(contactId) || (contactCustomer && !UUID.test(contactCustomer)) || !body || body.length > 4000 || !surface || !UUID.test(operationId)) {
    return { status: "error", message: "Nhập nội dung tin nhắn (tối đa 4.000 ký tự)." };
  }
  const scope = await messengerScope(surface);
  const supabase = await createServerSupabase();
  const { data: conversationId, error } = await supabase.rpc("open_direct_conversation", {
    target_branch_id: scope.branchId, target_customer_id: scope.customerId, contact_auth_user_id: contactId, contact_customer_id: contactCustomer || null,
  });
  if (error || !conversationId) return failed(error?.message);
  const { error: sendError } = await supabase.rpc("send_message", { target_conversation_id: conversationId, target_body: body, operation_id: operationId });
  if (sendError) return failed(sendError.message);
  revalidatePath(`/${surface}/messages`);
  redirect(`/${surface}/messages?conversation=${conversationId}`);
}
