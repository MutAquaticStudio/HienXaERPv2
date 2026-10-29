import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { formatBusinessDateTime } from "@/lib/core/business-time";
import { AiChat } from "@/modules/ai/chat";
import { loadMessenger, type MessageSurface, type MessengerContact } from "@/modules/messaging/server";
import { ChatAvatar, ChatComposer, MessageRefreshSignal, MessengerList, ScrollToEnd, type MessengerListItem } from "./messaging-controls";

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** "10:42" today, otherwise "29/10" — like the time column of Messenger. */
function shortTime(value: string | null) {
  if (!value) return null;
  const zone = { timeZone: "Asia/Ho_Chi_Minh" } as const;
  const day = (date: Date) => new Intl.DateTimeFormat("en-CA", zone).format(date);
  const date = new Date(value);
  return day(date) === day(new Date())
    ? new Intl.DateTimeFormat("vi-VN", { ...zone, hour: "2-digit", minute: "2-digit" }).format(date)
    : new Intl.DateTimeFormat("vi-VN", { ...zone, day: "2-digit", month: "2-digit" }).format(date);
}

/** FB14 (D36): "Tin nhắn" like Messenger — contacts on the left, the chat on the right (one at a time on a phone). */
export async function MessagingWorkspace({ surface, searchParams }: { surface: MessageSurface; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const data = await loadMessenger(surface, {
    conversation: first(params.conversation), contact: first(params.contact), customer: first(params.customer), ai: first(params.ai),
    before: first(params.before), beforeId: first(params.before_id),
  });
  const root = `/${surface}/messages`;
  const thread = data.thread;
  const contactHref = (contact: MessengerContact) => contact.conversation_id
    ? `${root}?conversation=${contact.conversation_id}`
    : `${root}?${new URLSearchParams({ contact: contact.auth_user_id, customer: contact.customer_id ?? "" })}`;
  const items: MessengerListItem[] = [
    ...(data.canAi ? [{ key: "ai", href: `${root}?ai=1`, name: "Trợ lý AI", preview: "Hỏi về số liệu bạn có quyền xem", time: null, unread: 0, active: thread?.kind === "ai", ai: true as const }] : []),
    ...data.contacts.map((contact) => ({
      key: `${contact.auth_user_id}:${contact.customer_id ?? ""}`, href: contactHref(contact), name: contact.display_name,
      preview: contact.last_message_preview ?? contact.subtitle, time: shortTime(contact.last_message_at), unread: contact.unread_count,
      active: (thread?.kind === "conversation" && !!contact.conversation_id && thread.id === contact.conversation_id)
        || (thread?.kind === "new" && thread.contact.auth_user_id === contact.auth_user_id && thread.contact.customer_id === contact.customer_id),
    })),
  ];
  const others: MessengerListItem[] = data.others.map((row) => ({
    key: row.conversation_id, href: `${root}?conversation=${row.conversation_id}`, name: row.subject, preview: row.last_message_preview ?? row.participant_summary,
    time: shortTime(row.updated_at), unread: row.unread_count, active: thread?.kind === "conversation" && thread.id === row.conversation_id,
  }));
  const oldest = thread?.kind === "conversation" ? thread.messages[0] : undefined;

  return (
    <div className={`messenger${thread ? " has-thread" : ""}`}>
      <MessageRefreshSignal />
      <aside className="messenger-list card" aria-label="Danh sách tin nhắn">
        <header className="messenger-list-head"><h1>Tin nhắn</h1></header>
        <MessengerList items={items} others={others} />
      </aside>
      <section className="messenger-thread card" aria-label="Cuộc trò chuyện">
        {!thread && <div className="messenger-placeholder"><p>Chọn một người trong danh bạ để nhắn tin.</p></div>}
        {thread && <header className="messenger-thread-head">
          <Link className="icon-button messenger-back" href={root} aria-label="Quay lại danh bạ"><ArrowLeft size={20} /></Link>
          {thread.kind === "ai" ? <><ChatAvatar name="Trợ lý AI" ai /><div><strong>Trợ lý AI</strong><span>Claude · đọc dữ liệu theo quyền của bạn</span></div></>
            : thread.kind === "new" ? <><ChatAvatar name={thread.contact.display_name} /><div><strong>{thread.contact.display_name}</strong><span>{thread.contact.subtitle}</span></div></>
            : <><ChatAvatar name={thread.title} /><div><strong>{thread.title}</strong><span>{thread.subtitle}</span></div></>}
        </header>}
        {thread?.kind === "ai" && <AiChat initialTurns={thread.turns} />}
        {thread?.kind === "new" && <>
          <div className="chat-scroll messenger-messages"><p className="messenger-placeholder">Gửi tin nhắn đầu tiên cho {thread.contact.display_name}.</p></div>
          <ChatComposer surface={surface} contact={{ authUserId: thread.contact.auth_user_id, customerId: thread.contact.customer_id }} placeholder="Nhập tin nhắn…" />
        </>}
        {thread?.kind === "conversation" && <>
          <div className="chat-scroll messenger-messages">
            {thread.messages.length === 50 && oldest && <Link className="button button-secondary button-compact messenger-older"
              href={`${root}?${new URLSearchParams({ conversation: thread.id, before: oldest.created_at, before_id: oldest.id })}`}>Xem tin cũ hơn</Link>}
            {thread.messages.map((message) => {
              const mine = message.sender_auth_user_id === data.me;
              return <div key={message.id} className={`chat-bubble-row ${mine ? "mine" : "theirs"}`}>
                {thread.group && !mine && <span className="chat-sender">{thread.names[message.sender_auth_user_id] ?? "Người tham gia"}</span>}
                <div className="chat-bubble">{message.body}</div>
                <time className="chat-time" dateTime={message.created_at}>{formatBusinessDateTime(message.created_at)}</time>
              </div>;
            })}
            {!thread.messages.length && <p className="messenger-placeholder">Chưa có tin nhắn.</p>}
            <ScrollToEnd signal={thread.messages.at(-1)?.id ?? thread.id} />
          </div>
          <ChatComposer surface={surface} conversationId={thread.id} placeholder="Nhập tin nhắn…" />
        </>}
      </section>
    </div>
  );
}
