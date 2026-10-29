"use client";

// FB14 (D36): Facebook-style contacts on every page — a contact bar on the right of wide screens with the search box under
// the list, and small chat windows at the bottom that stay open while the person works. Narrow screens use the Tin nhắn
// page instead. The database decides the contacts and checks every message, as on the Tin nhắn page.
import { Minus, PanelRightClose, PanelRightOpen, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { ChatAvatar, ScrollToEnd, useMessageInserts } from "@/components/messaging/messaging-controls";
import { loadAiChatAction } from "@/modules/ai/actions";
import type { AiTurn } from "@/modules/ai/assistant";
import { AiChat } from "@/modules/ai/chat";
import { CHAT_DOCK_QUERY, OPEN_AI_EVENT } from "@/modules/ai/events";
import { loadChatAction, loadDockAction, sendChatAction, type ChatData } from "@/modules/messaging/dock-actions";
import type { MessageSurface, MessengerContact } from "@/modules/messaging/server";

type DockWindow = { key: string; contact: MessengerContact | null };
/** Open chats kept at once; those that do not fit as windows (or are minimized) show as round chat heads, like Facebook. */
const MAX_CHATS = 10;
const WINDOW_WIDTH = 342;

const COLLAPSED_KEY = "hx_chat_dock_collapsed";
const readCollapsed = () => { try { return typeof window !== "undefined" && window.localStorage.getItem(COLLAPSED_KEY) === "1"; } catch { return false; } };
const keyOf = (contact: MessengerContact) => `${contact.auth_user_id}:${contact.customer_id ?? ""}`;

export function ChatDock({ surface }: { surface: MessageSurface }) {
  const pathname = usePathname();
  const [wide, setWide] = useState(false);
  const [contacts, setContacts] = useState<MessengerContact[]>([]);
  const [canAi, setCanAi] = useState(false);
  const [query, setQuery] = useState("");
  // "Thu gọn" leaves a narrow strip of faces (unread still shows); the choice is remembered on this device.
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const toggleCollapsed = () => setCollapsed((current) => {
    try { window.localStorage.setItem(COLLAPSED_KEY, current ? "0" : "1"); } catch { /* private mode: not remembered */ }
    return !current;
  });
  const [chats, setChats] = useState<DockWindow[]>([]);
  const [minimized, setMinimized] = useState<string[]>([]);
  const [viewport, setViewport] = useState(1440);
  const [version, setVersion] = useState(0);
  // The Tin nhắn page already is the messenger.
  const onMessagesPage = pathname.startsWith(`/${surface}/messages`);
  const active = wide && !onMessagesPage;

  useEffect(() => {
    const media = window.matchMedia(CHAT_DOCK_QUERY);
    const update = () => { setWide(media.matches); setViewport(window.innerWidth); };
    update();
    media.addEventListener("change", update);
    window.addEventListener("resize", update);
    return () => { media.removeEventListener("change", update); window.removeEventListener("resize", update); };
  }, []);

  const reload = useCallback(() => {
    // The open chat windows reload with the list (version), after a new message or a send.
    loadDockAction(surface).then((data) => { setContacts(data.contacts); setCanAi(data.canAi); setVersion((value) => value + 1); })
      .catch(() => { /* keep the last list */ });
  }, [surface]);
  useEffect(() => { if (active) reload(); }, [active, reload]);
  useMessageInserts(undefined, reload, active);

  // Opening a chat (again) brings it to the front: the newest windows show, older ones become chat heads.
  const open = useCallback((item: DockWindow) => {
    setMinimized((current) => current.filter((key) => key !== item.key));
    setChats((current) => [...current.filter((existing) => existing.key !== item.key), item].slice(-MAX_CHATS));
  }, []);
  useEffect(() => {
    if (!active || !canAi) return;
    const listener = () => open({ key: "ai", contact: null });
    window.addEventListener(OPEN_AI_EVENT, listener);
    return () => window.removeEventListener(OPEN_AI_EVENT, listener);
  }, [active, canAi, open]);

  if (!active) return null;
  const match = (name: string) => !query.trim() || name.toLocaleLowerCase("vi-VN").includes(query.trim().toLocaleLowerCase("vi-VN"));
  const shown = contacts.filter((contact) => match(contact.display_name));
  return <>
    {collapsed ? <aside className="chat-dock collapsed" aria-label="Người liên hệ">
      <button type="button" className="icon-button chat-dock-toggle" aria-label="Mở danh bạ" title="Mở danh bạ" onClick={toggleCollapsed}><PanelRightOpen size={18} /></button>
      <ul className="chat-dock-list">
        {canAi && <li><button type="button" className="chat-dock-item" aria-label="Trợ lý AI" title="Trợ lý AI" onClick={() => open({ key: "ai", contact: null })}><ChatAvatar name="Trợ lý AI" ai /></button></li>}
        {contacts.map((contact) => <li key={keyOf(contact)}>
          <button type="button" className="chat-dock-item" aria-label={contact.unread_count ? `${contact.display_name}, ${contact.unread_count} tin chưa đọc` : contact.display_name}
            title={contact.display_name} onClick={() => open({ key: keyOf(contact), contact })}>
            <ChatAvatar name={contact.display_name} />{contact.unread_count > 0 && <span className="chat-dock-dot" aria-hidden="true">{contact.unread_count}</span>}
          </button>
        </li>)}
      </ul>
    </aside> : <aside className="chat-dock" aria-label="Người liên hệ">
      <header className="chat-dock-head"><h2>Người liên hệ</h2><Link href={`/${surface}/messages`}>Mở Tin nhắn</Link>
        <button type="button" className="icon-button chat-dock-toggle" aria-label="Thu gọn danh bạ" title="Thu gọn danh bạ" onClick={toggleCollapsed}><PanelRightClose size={18} /></button></header>
      <ul className="chat-dock-list">
        {canAi && match("Trợ lý AI") && <li><button type="button" className="chat-dock-item" onClick={() => open({ key: "ai", contact: null })}>
          <ChatAvatar name="Trợ lý AI" ai /><span>Trợ lý AI</span></button></li>}
        {shown.map((contact) => <li key={keyOf(contact)}>
          <button type="button" className={`chat-dock-item${contact.unread_count ? " unread" : ""}`} onClick={() => open({ key: keyOf(contact), contact })}>
            <ChatAvatar name={contact.display_name} />
            <span className="chat-dock-name"><strong>{contact.display_name}</strong><small>{contact.contact_kind === "CUSTOMER" ? "Khách hàng" : contact.subtitle}</small></span>
            {contact.unread_count > 0 && <span className="messenger-unread" aria-label={`${contact.unread_count} tin chưa đọc`}>{contact.unread_count}</span>}
          </button>
        </li>)}
        {!shown.length && !(canAi && match("Trợ lý AI")) && <li className="empty-inline">Không có ai phù hợp.</li>}
      </ul>
      <label className="sr-only" htmlFor="chat-dock-search">Tìm người</label>
      <input id="chat-dock-search" className="chat-dock-search" type="search" placeholder="Tìm người…" value={query} onChange={(event) => setQuery(event.target.value)} />
    </aside>}
    <div className="chat-windows">
      {(() => {
        const slots = Math.max(1, Math.min(3, Math.floor((viewport - (collapsed ? 64 : 280) - 96) / WINDOW_WIDTH)));
        const shown = chats.filter((chat) => !minimized.includes(chat.key)).slice(-slots);
        const heads = chats.filter((chat) => !shown.includes(chat));
        const close = (key: string) => { setChats((current) => current.filter((item) => item.key !== key)); setMinimized((current) => current.filter((item) => item !== key)); };
        const contactOf = (chat: DockWindow) => chat.contact ? contacts.find((contact) => keyOf(contact) === chat.key) ?? chat.contact : null;
        return <>
          {shown.map((win) => {
            const latest = contactOf(win);
            const minimize = () => setMinimized((current) => [...current, win.key]);
            return <section key={win.key} className="chat-window" aria-label={latest ? `Chat với ${latest.display_name}` : "Trợ lý AI"}>
              <header className="chat-window-head">
                {latest ? <ChatAvatar name={latest.display_name} /> : <ChatAvatar name="Trợ lý AI" ai />}
                <button type="button" className="chat-window-title" onClick={minimize}><strong>{latest?.display_name ?? "Trợ lý AI"}</strong>
                  <small>{latest ? (latest.contact_kind === "CUSTOMER" ? "Khách hàng" : latest.subtitle) : "Đọc dữ liệu theo quyền của bạn"}</small></button>
                <button type="button" className="icon-button" aria-label="Thu nhỏ" onClick={minimize}><Minus size={16} /></button>
                <button type="button" className="icon-button" aria-label="Đóng" onClick={() => close(win.key)}><X size={16} /></button>
              </header>
              {latest ? <ContactChat surface={surface} contact={latest} version={version} onSent={reload} /> : <AiWindow />}
            </section>;
          })}
          {heads.length > 0 && <ul className="chat-heads" aria-label="Cuộc trò chuyện đang mở">
            {heads.map((head) => {
              const latest = contactOf(head);
              const name = latest?.display_name ?? "Trợ lý AI";
              return <li key={head.key} className="chat-head">
                <button type="button" className="chat-head-open" title={name} aria-label={latest?.unread_count ? `Mở chat với ${name}, ${latest.unread_count} tin chưa đọc` : `Mở chat với ${name}`}
                  onClick={() => open(head)}>
                  <ChatAvatar name={name} ai={!latest} />{latest && latest.unread_count > 0 && <span className="chat-dock-dot" aria-hidden="true">{latest.unread_count}</span>}
                </button>
                <button type="button" className="chat-head-close" aria-label={`Đóng chat với ${name}`} onClick={() => close(head.key)}><X size={12} /></button>
              </li>;
            })}
          </ul>}
        </>;
      })()}
    </div>
  </>;
}

function ContactChat({ surface, contact, version, onSent }: { surface: MessageSurface; contact: MessengerContact; version: number; onSent: () => void }) {
  const [conversationId, setConversationId] = useState(contact.conversation_id);
  const [chat, setChat] = useState<ChatData | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const operationId = useRef<string | null>(null);
  const target = { conversationId, contactId: contact.auth_user_id, contactCustomerId: contact.customer_id };

  useEffect(() => {
    let current = true;
    loadChatAction(surface, { conversationId, contactId: contact.auth_user_id, contactCustomerId: contact.customer_id })
      .then((data) => { if (current) setChat(data); }).catch(() => { if (current) setError("Không tải được tin nhắn."); });
    return () => { current = false; };
  }, [surface, conversationId, contact.auth_user_id, contact.customer_id, version]);

  function send() {
    const body = text.trim();
    if (!body || pending) return;
    operationId.current ??= crypto.randomUUID();
    start(async () => {
      const result = await sendChatAction(surface, target, body, operationId.current!);
      if (!result.ok) { setError(result.message); return; }
      operationId.current = null;
      setText("");
      setError("");
      setConversationId(result.conversationId);
      onSent();
    });
  }

  return <>
    <div className="chat-window-body">
      {chat?.messages.map((message) => <div key={message.id} className={`chat-bubble-row ${message.sender_auth_user_id === chat.me ? "mine" : "theirs"}`}>
        <div className="chat-bubble">{message.body}</div>
      </div>)}
      {chat && !chat.messages.length && <p className="messenger-placeholder">Gửi tin nhắn đầu tiên cho {contact.display_name}.</p>}
      {!chat && !error && <p className="messenger-placeholder">Đang tải…</p>}
      <ScrollToEnd signal={`${chat?.messages.at(-1)?.id ?? ""}`} />
    </div>
    {error && <p role="alert" className="error-message chat-window-error">{error}</p>}
    <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); send(); }}>
      <label className="sr-only" htmlFor={`dock-body-${contact.auth_user_id}`}>Nội dung tin nhắn</label>
      <textarea id={`dock-body-${contact.auth_user_id}`} rows={1} maxLength={4000} value={text} placeholder="Aa" onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } }} />
      <button className="button button-primary" type="submit" disabled={pending || !text.trim()}>Gửi</button>
    </form>
  </>;
}

function AiWindow() {
  const [turns, setTurns] = useState<AiTurn[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { loadAiChatAction().then(setTurns).catch(() => setFailed(true)); }, []);
  if (failed) return <p className="form-message chat-window-error" role="status">Không tải được cuộc trò chuyện.</p>;
  if (!turns) return <p className="messenger-placeholder"><Sparkles size={16} aria-hidden="true" /> Đang mở…</p>;
  return <AiChat initialTurns={turns} compact />;
}
