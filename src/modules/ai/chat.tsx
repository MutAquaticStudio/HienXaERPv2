"use client";

// FB14 (D36): the conversation with the chatbot. The same stored conversation shows in Tin nhắn ("Trợ lý AI"), in the
// floating bubble and on the AI page; each question goes to the server, which adds the earlier turns itself.
import { useState, useTransition } from "react";

import { ScrollToEnd } from "@/components/messaging/messaging-controls";
import { CommandForm } from "@/components/ui/command-form";
import { askAiAction, decideAiProposalAction, newAiChatAction } from "@/modules/ai/actions";
import type { AiTurn } from "@/modules/ai/assistant";

export const AI_SUGGESTIONS = [
  "Tóm tắt tình hình hôm nay: đơn bán, giao hàng, thu chi.",
  "Khách nào nợ quá hạn nhiều nhất?",
  "Hàng nào dưới ngưỡng tồn kho cần nhập?",
  "Hôm nay có những phiếu giao nào, ai đang giao?",
] as const;

export function AiChat({ initialTurns, compact = false }: { initialTurns: AiTurn[]; compact?: boolean }) {
  const [turns, setTurns] = useState<AiTurn[]>(initialTurns);
  const [question, setQuestion] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, start] = useTransition();

  function ask(text: string) {
    const asked = text.trim();
    if (asked.length < 2 || pending) return;
    setTurns((current) => [...current, { role: "user", text: asked }]);
    setQuestion("");
    setNotice("");
    start(async () => {
      const answer = await askAiAction({ question: asked });
      setTurns((current) => [...current, { role: "assistant", text: answer.text }]);
      if (answer.proposals) setNotice(`Đã ghi ${answer.proposals} đề xuất chờ duyệt.`);
    });
  }

  function restart() {
    if (pending) return;
    start(async () => {
      const outcome = await newAiChatAction();
      if (outcome.success) { setTurns([]); setNotice(""); }
    });
  }

  return <section className={`ai-chat${compact ? " ai-chat-compact" : ""}`} aria-label="Trò chuyện với trợ lý AI">
    <div className="ai-chat-tools">
      <span className="muted">Trợ lý đọc dữ liệu bạn có quyền xem; việc ghi sổ thành đề xuất chờ duyệt.</span>
      {turns.length > 0 && <button type="button" className="button button-secondary button-compact" onClick={restart} disabled={pending}>Cuộc trò chuyện mới</button>}
    </div>
    <div className="ai-turns chat-scroll" aria-live="polite">
      {!turns.length && <div className="ai-empty">
        <p>Hỏi bất cứ điều gì về bán hàng, kho, giao hàng, công nợ, sổ quỹ, chấm công, bảng lương…</p>
        <div className="period-presets">{AI_SUGGESTIONS.map((item) => <button key={item} type="button" className="chip-link" onClick={() => ask(item)}>{item}</button>)}</div>
      </div>}
      {turns.map((turn, index) => <div key={index} className={`chat-bubble-row ${turn.role === "user" ? "mine" : "theirs"}`}>
        <div className="chat-bubble">{turn.text}</div>
      </div>)}
      {pending && <div className="chat-bubble-row theirs"><div className="chat-bubble muted">Đang đọc dữ liệu và trả lời…</div></div>}
      <ScrollToEnd signal={`${turns.length}:${pending}`} />
    </div>
    {notice && <p className="form-message success" role="status">{notice}</p>}
    <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); ask(question); }}>
      <label className="sr-only" htmlFor={compact ? "ai-question-bubble" : "ai-question"}>Câu hỏi cho trợ lý</label>
      <textarea id={compact ? "ai-question-bubble" : "ai-question"} value={question} onChange={(event) => setQuestion(event.target.value)} rows={1} maxLength={2000}
        placeholder="Nhắn cho trợ lý AI…" onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); ask(question); } }} />
      <button className="button button-primary" disabled={pending || question.trim().length < 2}>{pending ? "Đang hỏi…" : "Gửi"}</button>
    </form>
  </section>;
}

export function DecideProposalForm({ proposalId, decision }: { proposalId: string; decision: "DONE" | "DISMISSED" }) {
  return <CommandForm action={decideAiProposalAction} submit={decision === "DONE" ? "Đã làm" : "Bỏ qua"} danger={decision === "DISMISSED"} className="mini-command">
    <input type="hidden" name="proposalId" value={proposalId} />
    <input type="hidden" name="decision" value={decision} />
  </CommandForm>;
}
