"use client";

// FB12 (D34d): the "Hỏi AI" conversation of one module. The history lives in the page (not stored); each question goes
// to the server with the turns before it.
import { useState, useTransition } from "react";

import { CommandForm } from "@/components/ui/command-form";
import { askAiAction, decideAiProposalAction } from "@/modules/ai/actions";
import type { AiTurn } from "@/modules/ai/assistant";

const suggestions: Record<string, string[]> = {
  overview: ["Tóm tắt tình hình hôm nay: đơn bán, giao hàng, thu chi.", "Những việc nào đang trễ hạn cần xử lý?"],
  sales: ["Đơn bán nào đã xác nhận nhưng chưa giao?", "Top 5 khách mua nhiều nhất tháng này?"],
  purchasing: ["Đơn mua nào đã quá ngày dự kiến nhận hàng?", "Hàng nào dưới ngưỡng cần đặt nhà cung cấp?"],
  inventory: ["Hàng nào dưới ngưỡng tồn kho?", "Giá trị tồn kho hiện tại theo kho?"],
  delivery: ["Hôm nay có những phiếu giao nào, ai đang giao?", "Phiếu giao nào chưa xác minh?"],
  finance: ["Khách nào nợ quá hạn nhiều nhất?", "Tổng thu, tổng chi tuần này?"],
  workforce: ["Hôm nay ai đi muộn hoặc chưa vào ca?", "Tổng thực lĩnh bảng lương gần nhất?"],
};

export function AiChat({ module, moduleLabel }: { module: string; moduleLabel: string }) {
  const [turns, setTurns] = useState<AiTurn[]>([]);
  const [question, setQuestion] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, start] = useTransition();

  function ask(text: string) {
    const asked = text.trim();
    if (asked.length < 2 || pending) return;
    const history = turns;
    setTurns([...history, { role: "user", text: asked }]);
    setQuestion("");
    setNotice("");
    start(async () => {
      const answer = await askAiAction({ module, question: asked, history: history.slice(-20) });
      setTurns((current) => [...current, { role: "assistant", text: answer.text }]);
      if (answer.proposals) setNotice(`Đã ghi ${answer.proposals} đề xuất chờ duyệt.`);
    });
  }

  return <section className="card ai-chat" aria-label={`Hỏi AI · ${moduleLabel}`}>
    <div className="ai-turns" aria-live="polite">
      {!turns.length && <div className="ai-empty">
        <p>Hỏi trợ lý về {moduleLabel.toLocaleLowerCase("vi-VN")}: trợ lý chỉ đọc dữ liệu bạn có quyền xem; việc ghi sổ sẽ thành đề xuất chờ duyệt.</p>
        <div className="period-presets">{(suggestions[module] ?? []).map((item) => <button key={item} type="button" className="chip-link" onClick={() => ask(item)}>{item}</button>)}</div>
      </div>}
      {turns.map((turn, index) => <div key={index} className={`ai-turn ai-${turn.role}`}><span className="ai-who">{turn.role === "user" ? "Bạn" : "Trợ lý"}</span><div className="ai-text">{turn.text}</div></div>)}
      {pending && <div className="ai-turn ai-assistant"><span className="ai-who">Trợ lý</span><div className="ai-text muted">Đang đọc dữ liệu và trả lời…</div></div>}
    </div>
    {notice && <p className="form-message success" role="status">{notice}</p>}
    <form className="ai-ask" onSubmit={(event) => { event.preventDefault(); ask(question); }}>
      <label className="sr-only" htmlFor="ai-question">Câu hỏi cho trợ lý</label>
      <textarea id="ai-question" value={question} onChange={(event) => setQuestion(event.target.value)} rows={2} maxLength={2000}
        placeholder="Ví dụ: Khách nào nợ quá hạn trên 30 ngày?" onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); ask(question); } }} />
      <button className="button button-primary" disabled={pending || question.trim().length < 2}>{pending ? "Đang hỏi…" : "Hỏi"}</button>
    </form>
  </section>;
}

export function DecideProposalForm({ proposalId, decision }: { proposalId: string; decision: "DONE" | "DISMISSED" }) {
  return <CommandForm action={decideAiProposalAction} submit={decision === "DONE" ? "Đã làm" : "Bỏ qua"} danger={decision === "DISMISSED"} className="mini-command">
    <input type="hidden" name="proposalId" value={proposalId} />
    <input type="hidden" name="decision" value={decision} />
  </CommandForm>;
}
