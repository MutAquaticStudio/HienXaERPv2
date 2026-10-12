"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createConversationAction, sendMessageAction, type MessageActionState } from "@/modules/messaging/actions";

const initialState: MessageActionState = { status: "idle", message: "" };

export function MessageRefreshSignal({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return;
    let active = true;
    const refresh = () => { if (active) router.refresh(); };
    const supabase = createBrowserClient(url, key);
    const createChannel = () => supabase
      .channel(`message-refresh-${conversationId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, refresh)
      .on("system", {}, (payload) => {
        // SUBSCRIBED precedes the database listener. Requery at readiness and
        // reconnect to recover messages committed while no listener was active.
        if (payload.extension === "postgres_changes" && payload.status === "ok") refresh();
      });
    let channel = createChannel();
    async function subscribe(target: typeof channel) {
      const { data, error } = await supabase.auth.getSession();
      if (!active || target !== channel || error || !data.session) return;
      // Cookie restoration is asynchronous. Bind the JWT before asking the
      // server to authorize the table/filter; an anonymous join cannot read it.
      await supabase.realtime.setAuth(data.session.access_token);
      if (active && target === channel) target.subscribe();
    }
    const queryFallback = () => { /* The authenticated query/reload path remains available. */ };
    void subscribe(channel).catch(queryFallback);
    const reconnect = () => {
      refresh();
      void (async () => {
        await supabase.removeChannel(channel);
        if (!active) return;
        channel = createChannel();
        await subscribe(channel);
      })().catch(queryFallback);
    };
    window.addEventListener("online", reconnect);
    return () => { active = false; window.removeEventListener("online", reconnect); void supabase.removeChannel(channel); };
  }, [conversationId, router]);
  return null;
}

export function NewConversationForm({ options }: { options: Array<{ auth_user_id: string; participant_kind: string; display_name: string; customer_id: string | null }> }) {
  const [state, action, pending] = useActionState(createConversationAction, initialState);
  const operationId = useRef<string | null>(null);
  return (
    <form action={action} className="form-stack" onSubmit={(event) => {
      operationId.current ??= crypto.randomUUID();
      (event.currentTarget.elements.namedItem("operation_id") as HTMLInputElement).value = operationId.current;
    }}>
      <input type="hidden" name="operation_id" defaultValue="" />
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
      <button className="button button-primary" type="submit" disabled={pending || state.status === "success"}>{pending ? "Đang tạo..." : "Tạo hội thoại"}</button>
      {state.message && <p role="status" className={state.status === "error" ? "error-message" : "muted"}>{state.message}{state.conversationId ? <a className="code-link" href={`/admin/messages?conversation=${state.conversationId}`}> Mở hội thoại</a> : null}</p>}
    </form>
  );
}

export function SendMessageForm({ conversationId, surface }: { conversationId: string; surface: "admin" | "work" | "customer" }) {
  const [state, action, pending] = useActionState(sendMessageAction, initialState);
  const operationId = useRef<string | null>(null);
  const lastMessageId = useRef<string | undefined>(undefined);
  return (
    <form action={action} className="form-stack" key={state.messageId ?? "draft"} onSubmit={(event) => {
      if (state.messageId && state.messageId !== lastMessageId.current) {
        operationId.current = null;
        lastMessageId.current = state.messageId;
      }
      operationId.current ??= crypto.randomUUID();
      (event.currentTarget.elements.namedItem("operation_id") as HTMLInputElement).value = operationId.current;
    }}>
      <input type="hidden" name="conversation_id" value={conversationId} />
      <input type="hidden" name="surface" value={surface} />
      <input type="hidden" name="operation_id" defaultValue="" />
      <label className="field"><span>Nội dung</span><textarea name="body" maxLength={4000} rows={3} required placeholder="Nhập tin nhắn. Tin nhắn không tự thay đổi đơn hàng hoặc thanh toán." /></label>
      <button className="button button-primary" type="submit" disabled={pending}>{pending ? "Đang gửi..." : "Gửi tin nhắn"}</button>
      {state.message && <p role="status" className={state.status === "error" ? "error-message" : "muted"}>{state.message}</p>}
    </form>
  );
}
