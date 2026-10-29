"use client";

// FB14 (D36): the floating "Trợ lý AI" bubble on every admin page. It opens the same stored conversation as Tin nhắn; the
// "Trợ lý AI" button of the top bar opens it too (event "hx:open-ai").
import { Sparkles, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { loadAiChatAction } from "@/modules/ai/actions";
import type { AiTurn } from "@/modules/ai/assistant";
import { AiChat } from "@/modules/ai/chat";
import { chatDockVisible, OPEN_AI_EVENT } from "@/modules/ai/events";

export function AiBubble() {
  const pathname = usePathname();
  const router = useRouter();
  // The AI page and Tin nhắn already show the conversation: there the top bar button opens the assistant's chat in Tin nhắn.
  const hidden = pathname.startsWith("/admin/ai") || pathname.startsWith("/admin/messages");
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<AiTurn[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, start] = useTransition();

  function show() {
    setOpen(true);
    setFailed(false);
    start(async () => {
      try { setTurns(await loadAiChatAction()); } catch { setFailed(true); }
    });
  }

  useEffect(() => {
    const listener = () => { if (chatDockVisible()) return; if (hidden) router.push("/admin/messages?ai=1"); else show(); };
    window.addEventListener(OPEN_AI_EVENT, listener);
    return () => window.removeEventListener(OPEN_AI_EVENT, listener);
  });

  if (hidden) return null;
  return <div className="ai-bubble">
    {open && <div className="ai-bubble-panel" role="dialog" aria-label="Trợ lý AI">
      <header className="ai-bubble-head">
        <span className="chat-avatar chat-avatar-ai" aria-hidden="true"><Sparkles size={16} /></span>
        <strong>Trợ lý AI</strong>
        <button type="button" className="icon-button" aria-label="Đóng trợ lý AI" onClick={() => setOpen(false)}><X size={18} /></button>
      </header>
      {failed ? <p className="form-message" role="status">Không tải được cuộc trò chuyện. Thử lại sau.</p>
        : turns === null || loading ? <p className="muted ai-bubble-loading">Đang mở cuộc trò chuyện…</p>
        : <AiChat initialTurns={turns} compact />}
    </div>}
    {!open && <button type="button" className="ai-bubble-button" aria-label="Mở trợ lý AI" onClick={show}><Sparkles aria-hidden="true" size={22} /></button>}
  </div>;
}
