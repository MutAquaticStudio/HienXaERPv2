import Link from "next/link";
import { markConversationReadAction } from "@/modules/messaging/actions";
import { loadMessagingWorkspace, type MessageSurface } from "@/modules/messaging/server";
import { MessageRefreshSignal, NewConversationForm, SendMessageForm } from "./messaging-controls";

export async function MessagingWorkspace({ surface, searchParams }: { surface: MessageSurface; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  const selectedId = first(params.conversation);
  const before = first(params.before);
  const beforeId = first(params.before_id);
  const data = await loadMessagingWorkspace(surface, selectedId, before, beforeId);
  const root = `/${surface}/messages`;
  const names = new Map(data.participants.map((p) => [p.auth_user_id, p.display_name_snapshot]));
  const oldest = data.messages.at(-1);
  const olderHref = oldest && data.conversation ? `${root}?${new URLSearchParams({ conversation: data.conversation.id, before: oldest.created_at, before_id: oldest.id })}` : null;

  return (
    <div className="page-stack">
      <header className="page-heading"><div><p className="eyebrow">Trao đổi</p><h1>Tin nhắn</h1><p className="lede">Hội thoại lưu trong hệ thống. Tin nhắn không phải lệnh nghiệp vụ.</p></div></header>
      {surface === "admin" && data.options.length > 0 && <section className="card card-pad"><h2>Hội thoại mới</h2><NewConversationForm options={data.options} /></section>}
      <section className="card card-pad">
        <h2>Hội thoại của tôi</h2>
        {data.conversations.length ? <div className="clean-list">{data.conversations.map((conversation) => (
          <Link className="detail-item" key={conversation.conversation_id} href={`${root}?conversation=${conversation.conversation_id}`}>
            <strong>{conversation.subject}</strong>
            <span>{conversation.audience === "CUSTOMER" ? "Khách hàng" : "Nội bộ"} · {conversation.participant_summary}</span>
            <span className="muted">{conversation.last_message_preview ?? "Chưa có tin nhắn"} · {new Date(conversation.updated_at).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</span>
            {conversation.unread_count > 0 && <span className="scope-chip">{conversation.unread_count} chưa đọc</span>}
          </Link>
        ))}</div> : <p className="empty-inline">Chưa có hội thoại.</p>}
      </section>
      {data.conversation && <section className="card card-pad">
        <MessageRefreshSignal conversationId={data.conversation.id} />
        <div className="section-head flush"><div><h2>{data.conversation.subject}</h2><p className="muted">{data.conversation.participant_summary}</p></div>
          <form action={markConversationReadAction}><input type="hidden" name="conversation_id" value={data.conversation.id} /><input type="hidden" name="surface" value={surface} /><button className="button button-secondary" type="submit">Đánh dấu đã đọc</button></form>
        </div>
        {data.messages.length ? <div className="clean-list">{[...data.messages].reverse().map((message) => <article className="detail-item" key={message.id}><strong>{names.get(message.sender_auth_user_id) ?? "Người tham gia"}{message.sender_auth_user_id === data.currentUserId ? " (bạn)" : ""}</strong><p>{message.body}</p><time className="muted" dateTime={message.created_at}>{new Date(message.created_at).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</time></article>)}</div> : <p className="empty-inline">Hội thoại chưa có tin nhắn.</p>}
        {data.messages.length === 50 && olderHref && <Link className="button button-secondary" href={olderHref}>Xem tin cũ hơn</Link>}
        <SendMessageForm conversationId={data.conversation.id} surface={surface} />
      </section>}
    </div>
  );
}
