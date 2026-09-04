"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { BellRing, CircleAlert, LockKeyhole, MessageCircleMore, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";

import { runChatAction, type ChatActionState } from "@/app/chat/actions";
import { createClient, type BrowserSupabaseConfig } from "@/lib/supabase/client";
import type {
  ChatContextOption,
  OperationalChatSnapshot,
  OperationalConversation,
} from "@/modules/chat/types";

type Surface = "office" | "worker" | "customer";

const initialState = (idempotencyKey: string): ChatActionState => ({
  status: "idle",
  message: "",
  idempotencyKey,
});

function actionLabel(surface: Surface) {
  if (surface === "worker") return "NHẮN ĐIỀU PHỐI";
  if (surface === "customer") return "NHẮN NHÂN VIÊN PHỤ TRÁCH";
  return "MỞ HỘI THOẠI VẬN HÀNH";
}

function statusLabel(status: OperationalConversation["status"]) {
  return status === "OPEN" ? "ĐANG MỞ" : "ĐÃ ĐÓNG";
}

function ActionButton({ label, tone = "primary" }: { label: string; tone?: "primary" | "quiet" | "danger" }) {
  const { pending } = useFormStatus();
  const className = tone === "primary" ? "primary-button" : tone === "danger" ? "chat-close-button" : "chat-quiet-button";
  return <button className={className} disabled={pending} type="submit">
    {pending ? "ĐANG GỬI…" : label}
  </button>;
}

function ActionFeedback({ state }: { state: ChatActionState }) {
  if (!state.message) return null;
  return <p aria-live="polite" className={state.status === "error" ? "form-error" : "form-success"} role={state.status === "error" ? "alert" : "status"}>{state.message}</p>;
}

function OpenConversation({ context, surface }: { context: ChatContextOption; surface: Surface }) {
  const [state, action] = useActionState(runChatAction, initialState(`open-${context.contextId.replaceAll("-", "")}`));
  return <article className="chat-context-card">
    <div><strong>{context.subject}</strong><span>Hội thoại chỉ trao đổi vận hành; không thay nút xác nhận nghiệp vụ.</span></div>
    <form action={action} className="chat-open-form">
      <input name="kind" type="hidden" value="chat.conversation.ensure" />
      <input name="surface" type="hidden" value={surface} />
      <input name="contextType" type="hidden" value={context.contextType} />
      <input name="contextId" type="hidden" value={context.contextId} />
      <ActionButton label={actionLabel(surface)} />
      <ActionFeedback state={state} />
    </form>
  </article>;
}

function MarkRead({ conversationId, surface }: { conversationId: string; surface: Surface }) {
  const [state, action] = useActionState(runChatAction, initialState(`read-${conversationId.replaceAll("-", "")}`));
  return <form action={action} className="chat-mark-read">
    <input name="kind" type="hidden" value="chat.conversation.mark_read" />
    <input name="surface" type="hidden" value={surface} />
    <input name="conversationId" type="hidden" value={conversationId} />
    <ActionButton label="ĐÃ ĐỌC" tone="quiet" />
    <ActionFeedback state={state} />
  </form>;
}

function Composer({
  conversation,
  evidence,
  surface,
  initialKey,
}: {
  conversation: OperationalConversation;
  evidence: OperationalChatSnapshot["evidence"];
  surface: Surface;
  initialKey: string;
}) {
  const [state, action] = useActionState(runChatAction, initialState(initialKey));
  return <form action={action} className="chat-composer" noValidate>
    <input name="kind" type="hidden" value="chat.message.send" />
    <input name="surface" type="hidden" value={surface} />
    <input name="conversationId" type="hidden" value={conversation.id} />
    <input name="idempotencyKey" type="hidden" value={state.idempotencyKey} />
    <label>
      <span>Nội dung trao đổi</span>
      <textarea maxLength={2000} name="body" placeholder="Nhập nội dung cần phối hợp…" required rows={3} />
    </label>
    {evidence.length ? <label>
      <span>Đính kèm chứng từ riêng tư (không bắt buộc)</span>
      <select defaultValue="" name="evidenceId">
        <option value="">Không đính kèm</option>
        {evidence.map((item, index) => <option key={item.id} value={item.id}>Tệp riêng tư {index + 1}</option>)}
      </select>
    </label> : null}
    <p className="chat-send-contract"><LockKeyhole aria-hidden="true" size={17} />CHƯA GỬI cho đến khi máy chủ xác nhận. Tin nhắn không thay đổi báo giá, chuyến giao hoặc thanh toán.</p>
    <ActionButton label="GỬI TIN NHẮN" />
    <ActionFeedback state={state} />
  </form>;
}

function CloseConversation({ conversationId, surface }: { conversationId: string; surface: Surface }) {
  const [state, action] = useActionState(runChatAction, initialState(`close-${conversationId.replaceAll("-", "")}`));
  return <details className="chat-close-details">
    <summary>Đóng hội thoại sau khi đã xử lý</summary>
    <form action={action} className="chat-close-form" noValidate>
      <input name="kind" type="hidden" value="chat.conversation.close" />
      <input name="surface" type="hidden" value={surface} />
      <input name="conversationId" type="hidden" value={conversationId} />
      <label>Lý do đóng<textarea minLength={10} maxLength={500} name="reason" placeholder="Nêu rõ việc phối hợp đã được xử lý" required rows={2} /></label>
      <ActionButton label="ĐÓNG HỘI THOẠI" tone="danger" />
      <ActionFeedback state={state} />
    </form>
  </details>;
}

function ConversationCard({
  conversation,
  evidence,
  surface,
  canManage,
}: {
  conversation: OperationalConversation;
  evidence: OperationalChatSnapshot["evidence"];
  surface: Surface;
  canManage: boolean;
}) {
  return <article className="chat-conversation-card" aria-label={`Hội thoại ${conversation.subject}`}>
    <header>
      <div><strong>{conversation.subject}</strong><span>{statusLabel(conversation.status)}</span></div>
      {conversation.unreadCount ? <b className="chat-unread"><BellRing aria-hidden="true" size={16} />{conversation.unreadCount} chưa đọc</b> : null}
    </header>
    <div className="chat-message-list" aria-live="polite">
      {conversation.messages.length ? conversation.messages.map((message) => <article className={`chat-message chat-message-${message.senderKind.toLowerCase()}`} key={message.id}>
        <header><strong>{message.senderDisplayName}</strong><time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString("vi-VN")}</time></header>
        <p>{message.body}</p>
        {message.evidenceId ? <span className="chat-private-attachment"><LockKeyhole aria-hidden="true" size={15} />Có tệp đính kèm riêng tư</span> : null}
      </article>) : <p className="chat-empty">Chưa có tin nhắn. Hãy trao đổi nội dung phối hợp, không dùng chat để xác nhận nghiệp vụ.</p>}
    </div>
    {conversation.unreadCount ? <MarkRead conversationId={conversation.id} surface={surface} /> : null}
    {conversation.status === "OPEN" ? <Composer conversation={conversation} evidence={evidence} initialKey={`message-${conversation.id.replaceAll("-", "")}`} surface={surface} /> : <p className="chat-closed"><XCircle aria-hidden="true" size={18} />Đã đóng: {conversation.closeReason ?? "Hội thoại đã kết thúc."}</p>}
    {conversation.status === "OPEN" && canManage ? <CloseConversation conversationId={conversation.id} surface={surface} /> : null}
  </article>;
}

export function OperationalChatPanel({
  snapshot,
  contexts,
  surface,
  canManage,
  supabaseConfig,
}: {
  snapshot: OperationalChatSnapshot;
  contexts: ChatContextOption[];
  surface: Surface;
  canManage: boolean;
  supabaseConfig: BrowserSupabaseConfig | null;
}) {
  const router = useRouter();
  useEffect(() => {
    if (!supabaseConfig || !snapshot.conversations.length) return;
    const client = createClient(supabaseConfig);
    const channels = snapshot.conversations.map((conversation) => client.channel(`chat:${conversation.id}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "conversation_messages",
        filter: `conversation_id=eq.${conversation.id}`,
      }, () => router.refresh())
      .subscribe());
    return () => { channels.forEach((channel) => { void client.removeChannel(channel); }); };
  }, [router, snapshot.conversations, supabaseConfig]);

  const conversationKeys = new Set(snapshot.conversations.map((conversation) => `${conversation.contextType}:${conversation.contextId}`));
  const unopenedContexts = contexts.filter((context) => !conversationKeys.has(`${context.contextType}:${context.contextId}`));
  return <section className="operational-chat-panel" aria-labelledby={`chat-panel-${surface}`}>
    <header className="operational-chat-heading"><MessageCircleMore aria-hidden="true" size={27} /><div><h2 id={`chat-panel-${surface}`}>Trao đổi vận hành</h2><p>Chỉ người tham gia theo ngữ cảnh được phép mới đọc hoặc gửi. Realtime chỉ làm mới hiển thị sau khi tin nhắn đã được lưu.</p></div></header>
    {unopenedContexts.length ? <div className="chat-context-list">{unopenedContexts.map((context) => <OpenConversation context={context} key={`${context.contextType}:${context.contextId}`} surface={surface} />)}</div> : null}
    {snapshot.conversations.length ? <div className="chat-conversation-list">{snapshot.conversations.map((conversation) => <ConversationCard canManage={canManage} conversation={conversation} evidence={snapshot.evidence} key={conversation.id} surface={surface} />)}</div> : !unopenedContexts.length ? <p className="chat-empty"><CircleAlert aria-hidden="true" size={19} />Chưa có ngữ cảnh phù hợp để mở hội thoại.</p> : null}
  </section>;
}
