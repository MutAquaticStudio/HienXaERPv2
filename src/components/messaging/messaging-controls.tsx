"use client";

import { createBrowserClient } from "@supabase/ssr";
import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { sendDirectMessageAction, sendMessageAction, type MessageActionState } from "@/modules/messaging/actions";

const initialState: MessageActionState = { status: "idle", message: "" };

/** Refreshes the page when a message arrives: in one conversation, or in any conversation of the person (no id). */
export function MessageRefreshSignal({ conversationId }: { conversationId?: string }) {
  const router = useRouter();
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return;
    let active = true;
    const refresh = () => { if (active) router.refresh(); };
    const supabase = createBrowserClient(url, key);
    const createChannel = () => supabase
      .channel(`message-refresh-${conversationId ?? "all"}`)
      // Without a filter, RLS still limits the events to the person's own conversations.
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", ...(conversationId ? { filter: `conversation_id=eq.${conversationId}` } : {}) }, refresh)
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

/** Keeps a chat scrolled to its newest message (placed last inside the scrolling box). */
export function ScrollToEnd({ signal }: { signal: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => { const box = ref.current?.parentElement; if (box) box.scrollTop = box.scrollHeight; }, [signal]);
  return <span ref={ref} aria-hidden="true" />;
}

export type MessengerListItem = { key: string; href: string; name: string; preview: string; time: string | null; unread: number; active: boolean; ai?: true };

const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(-2).map((word) => word[0]).join("").toLocaleUpperCase("vi-VN") || "?";

export function ChatAvatar({ name, ai }: { name: string; ai?: boolean }) {
  return ai ? <span className="chat-avatar chat-avatar-ai" aria-hidden="true"><Sparkles size={18} /></span>
    : <span className="chat-avatar" aria-hidden="true">{initialsOf(name)}</span>;
}

/** The contact list with a search box, like Messenger. */
export function MessengerList({ items, others }: { items: MessengerListItem[]; others: MessengerListItem[] }) {
  const [query, setQuery] = useState("");
  const match = (item: MessengerListItem) => !query.trim() || item.name.toLocaleLowerCase("vi-VN").includes(query.trim().toLocaleLowerCase("vi-VN"));
  const row = (item: MessengerListItem) => <li key={item.key}>
    <Link className={`messenger-item${item.active ? " active" : ""}${item.unread ? " unread" : ""}`} href={item.href} aria-current={item.active ? "page" : undefined}>
      <ChatAvatar name={item.name} ai={item.ai} />
      <span className="messenger-item-text"><strong>{item.name}</strong><span>{item.preview}</span></span>
      <span className="messenger-item-meta">{item.time && <time>{item.time}</time>}{item.unread > 0 && <span className="messenger-unread" aria-label={`${item.unread} tin chưa đọc`}>{item.unread}</span>}</span>
    </Link>
  </li>;
  const shown = items.filter(match);
  const shownOthers = others.filter(match);
  return <>
    <label className="sr-only" htmlFor="messenger-search">Tìm người</label>
    <input id="messenger-search" className="messenger-search" type="search" placeholder="Tìm người…" value={query} onChange={(event) => setQuery(event.target.value)} />
    <ul className="messenger-items" aria-label="Danh bạ">{shown.map(row)}</ul>
    {!shown.length && <p className="empty-inline">Không có ai phù hợp.</p>}
    {shownOthers.length > 0 && <><h2 className="messenger-section">Hội thoại khác</h2><ul className="messenger-items" aria-label="Hội thoại khác">{shownOthers.map(row)}</ul></>}
  </>;
}

/** The message box at the bottom of a chat; Enter sends, Shift+Enter starts a new line. A first message opens the chat. */
export function ChatComposer({ surface, conversationId, contact, placeholder }: {
  surface: "admin" | "work" | "customer"; conversationId?: string; contact?: { authUserId: string; customerId: string | null }; placeholder: string;
}) {
  const [state, action, pending] = useActionState(conversationId ? sendMessageAction : sendDirectMessageAction, initialState);
  const operationId = useRef<string | null>(null);
  const lastMessageId = useRef<string | undefined>(undefined);
  return (
    <form action={action} className="chat-composer" key={state.messageId ?? "draft"} onSubmit={(event) => {
      if (state.messageId && state.messageId !== lastMessageId.current) {
        operationId.current = null;
        lastMessageId.current = state.messageId;
      }
      operationId.current ??= crypto.randomUUID();
      (event.currentTarget.elements.namedItem("operation_id") as HTMLInputElement).value = operationId.current;
    }}>
      {conversationId && <input type="hidden" name="conversation_id" value={conversationId} />}
      {contact && <><input type="hidden" name="contact_auth_user_id" value={contact.authUserId} /><input type="hidden" name="contact_customer_id" value={contact.customerId ?? ""} /></>}
      <input type="hidden" name="surface" value={surface} />
      <input type="hidden" name="operation_id" defaultValue="" />
      <label className="sr-only" htmlFor="chat-body">Nội dung tin nhắn</label>
      <textarea id="chat-body" name="body" maxLength={4000} rows={1} required placeholder={placeholder}
        onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
      <button className="button button-primary" type="submit" disabled={pending}>{pending ? "Đang gửi…" : "Gửi"}</button>
      {state.status === "error" && <p role="alert" className="error-message chat-composer-error">{state.message}</p>}
    </form>
  );
}
