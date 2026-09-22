"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createConversationAction, sendMessageAction, type MessageActionState } from "@/modules/messaging/actions";

const initialState: MessageActionState = { status: "idle", message: "" };

export function MessageRefreshSignal({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return;
    const supabase = createBrowserClient(url, key);
    const channel = supabase
      .channel(`message-refresh-${conversationId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, () => router.refresh())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [conversationId, router]);
  return null;
}

export function NewConversationForm({ options }: { options: Array<{ auth_user_id: string; participant_kind: string; display_name: string; customer_id: string | null }> }) {
  const [state, action, pending] = useActionState(createConversationAction, initialState);
  const [operationId, setOperationId] = useState("");
  useEffect(() => setOperationId(crypto.randomUUID()), []);
  return (
    <form action={action} className="form-stack">
      <input type="hidden" name="operation_id" value={operationId} />
      <label className="field"><span>Tiêu đề</span><input name="subject" minLength={3} maxLength={160} required placeholder="Ví dụ: Trao đổi lịch giao" /></label>
      <label className="field"><span>Người nhận</span>
        <select name="participant_id" required onChange={(event) => {
          const selected = event.currentTarget.selectedOptions[0];
          const form = event.currentTarget.form;
          if (form) {
            (form.elements.namedItem("audience") as HTMLInputElement).value = selected?.dataset.kind === "CUSTOMER" ? "CUSTOMER" : "INTERNAL";
            (form.elements.namedItem("customer_id") as HTMLInputElement).value = selected?.dataset.customerId ?? "";
          }
        }}>
          <option value="">Chọn người nhận</option>
          {options.map((option) => <option key={`${option.participant_kind}-${option.auth_user_id}-${option.customer_id ?? ""}`} value={option.auth_user_id} data-kind={option.participant_kind} data-customer-id={option.customer_id ?? ""}>{option.display_name} · {option.participant_kind === "CUSTOMER" ? "Khách hàng" : "Nội bộ"}</option>)}
        </select>
      </label>
      <input type="hidden" name="audience" defaultValue="INTERNAL" />
      <input type="hidden" name="customer_id" defaultValue="" />
      <button className="button button-primary" type="submit" disabled={pending || !operationId || state.status === "success"}>{pending ? "Đang tạo..." : "Tạo hội thoại"}</button>
      {state.message && <p role="status" className={state.status === "error" ? "error-message" : "muted"}>{state.message}{state.conversationId ? <a className="code-link" href={`/admin/messages?conversation=${state.conversationId}`}> Mở hội thoại</a> : null}</p>}
    </form>
  );
}

export function SendMessageForm({ conversationId, surface }: { conversationId: string; surface: "admin" | "work" | "customer" }) {
  const [state, action, pending] = useActionState(sendMessageAction, initialState);
  const [operationId, setOperationId] = useState("");
  useEffect(() => setOperationId(crypto.randomUUID()), [state.messageId]);
  return (
    <form action={action} className="form-stack" key={operationId}>
      <input type="hidden" name="conversation_id" value={conversationId} />
      <input type="hidden" name="surface" value={surface} />
      <input type="hidden" name="operation_id" value={operationId} />
      <label className="field"><span>Nội dung</span><textarea name="body" maxLength={4000} rows={3} required placeholder="Nhập tin nhắn. Tin nhắn không tự thay đổi đơn hàng hoặc thanh toán." /></label>
      <button className="button button-primary" type="submit" disabled={pending || !operationId}>{pending ? "Đang gửi..." : "Gửi tin nhắn"}</button>
      {state.message && <p role="status" className={state.status === "error" ? "error-message" : "muted"}>{state.message}</p>}
    </form>
  );
}
