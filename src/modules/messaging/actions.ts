"use server";

import { revalidatePath } from "next/cache";
import { requireInternalAccess } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";

export type MessageActionState = { status: "idle" | "success" | "error"; message: string; conversationId?: string; messageId?: string };

export async function createConversationAction(_state: MessageActionState, formData: FormData): Promise<MessageActionState> {
  const access = await requireInternalAccess();
  const audience = String(formData.get("audience") ?? "");
  const participantId = String(formData.get("participant_id") ?? "");
  const customerId = audience === "CUSTOMER" ? String(formData.get("customer_id") ?? "") : null;
  const subject = String(formData.get("subject") ?? "").trim();
  const operationId = String(formData.get("operation_id") ?? "");
  if (!participantId || !["INTERNAL", "CUSTOMER"].includes(audience) || subject.length < 3 || subject.length > 160 || (audience === "CUSTOMER" && !customerId) || !/^[0-9a-f-]{36}$/i.test(operationId)) {
    return { status: "error", message: "Kiểm tra người nhận và tiêu đề hội thoại." };
  }
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("create_conversation", {
    target_branch_id: access.branchId,
    target_audience: audience,
    target_customer_id: customerId,
    target_subject: subject,
    target_entity_type: audience === "CUSTOMER" ? "customer" : "branch",
    target_entity_id: customerId ?? access.branchId,
    target_participant_auth_user_ids: [participantId],
    operation_id: operationId,
  });
  if (error) return { status: "error", message: error.message };
  revalidatePath("/admin/messages");
  return { status: "success", message: "Đã tạo hội thoại.", conversationId: String(data) };
}

export async function sendMessageAction(_state: MessageActionState, formData: FormData): Promise<MessageActionState> {
  const conversationId = String(formData.get("conversation_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const surface = String(formData.get("surface") ?? "");
  const operationId = String(formData.get("operation_id") ?? "");
  if (!conversationId || !body || body.length > 4000 || !["admin", "work", "customer"].includes(surface) || !/^[0-9a-f-]{36}$/i.test(operationId)) {
    return { status: "error", message: "Nội dung tin nhắn không hợp lệ." };
  }
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("send_message", {
    target_conversation_id: conversationId,
    target_body: body,
    operation_id: operationId,
  });
  if (error) return { status: "error", message: error.message };
  revalidatePath(`/${surface}/messages`);
  return { status: "success", message: "Đã gửi tin nhắn.", messageId: String(data) };
}

export async function markConversationReadAction(formData: FormData) {
  const conversationId = String(formData.get("conversation_id") ?? "");
  const surface = String(formData.get("surface") ?? "");
  if (!conversationId || !["admin", "work", "customer"].includes(surface)) return;
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("mark_conversation_read", { target_conversation_id: conversationId });
  if (error) throw error;
  revalidatePath(`/${surface}/messages`);
}
