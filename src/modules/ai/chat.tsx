"use client";

// FB14 (D36): the conversation with the chatbot. The same stored conversation shows in Tin nhắn ("Trợ lý AI"), in the
// floating bubble and on the AI page; each question goes to the server, which adds the earlier turns itself.
import { Paperclip, X } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";

import { ScrollToEnd } from "@/components/messaging/messaging-controls";
import { CommandForm } from "@/components/ui/command-form";
import { askAiAction, decideAiProposalAction, newAiChatAction } from "@/modules/ai/actions";
import { listAiActionsAction, type AiActionCard } from "@/modules/ai/agent/actions";
import { AiActionCardView } from "@/modules/ai/agent/action-card";
import type { AiTurn } from "@/modules/ai/assistant";
import { AI_ATTACHMENT_ACCEPT, AI_ATTACHMENT_MAX_FILES, attachmentProblem } from "@/modules/ai/attachment-limits";
import { AI_MODELS, aiModel, DEFAULT_AI_MODEL, type AiModelId } from "@/modules/ai/models";

const MODEL_STORAGE_KEY = "hx.ai.model";

const MODEL_EVENT = "hx-ai-model";
/** The pick of this page load, so the picker works even where the browser keeps no storage. */
let pickedModel: AiModelId | null = null;

/** The model this person picked last on this device (D50), or the default. */
function storedModel(): AiModelId {
  if (pickedModel) return pickedModel;
  try { return aiModel(window.localStorage.getItem(MODEL_STORAGE_KEY)).id; } catch { return DEFAULT_AI_MODEL; }
}
function subscribeModel(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(MODEL_EVENT, onChange);
  return () => { window.removeEventListener("storage", onChange); window.removeEventListener(MODEL_EVENT, onChange); };
}

function fileSize(bytes: number) {
  return bytes >= 1_000_000 ? `${(bytes / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`;
}

export const AI_SUGGESTIONS = [
  "Tóm tắt tình hình hôm nay: đơn bán, giao hàng, thu chi.",
  "Khách nào nợ quá hạn nhiều nhất?",
  "Hàng nào dưới ngưỡng tồn kho cần nhập?",
  "Hôm nay có những phiếu giao nào, ai đang giao?",
  "Soạn đơn bán 20 bao xi măng cho khách quen, giao ngày mai.",
] as const;

export function AiChat({ initialTurns, compact = false }: { initialTurns: AiTurn[]; compact?: boolean }) {
  const [turns, setTurns] = useState<AiTurn[]>(initialTurns);
  const [question, setQuestion] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, start] = useTransition();
  // D50: the model picked in the chat (remembered on this device) and the files attached to the next question.
  // Every open chat (page, bubble, Tin nhắn) shows the same choice.
  const model = useSyncExternalStore(subscribeModel, storedModel, () => DEFAULT_AI_MODEL);
  const [files, setFiles] = useState<File[]>([]);
  const [fileProblem, setFileProblem] = useState("");
  const picker = useRef<HTMLInputElement>(null);
  const pickModel = (next: AiModelId) => {
    pickedModel = next;
    try { window.localStorage.setItem(MODEL_STORAGE_KEY, next); } catch { /* not remembered after a reload */ }
    window.dispatchEvent(new Event(MODEL_EVENT));
  };
  const addFiles = (picked: FileList | null) => {
    if (!picked?.length) return;
    const next = [...files, ...Array.from(picked)];
    const problem = attachmentProblem(next);
    setFileProblem(problem ?? "");
    if (!problem) setFiles(next);
    if (picker.current) picker.current.value = "";
  };
  const removeFile = (index: number) => { setFiles((current) => current.filter((_, at) => at !== index)); setFileProblem(""); };
  // FB15 (D37): actions the assistant prepared — the ones still waiting show when the chat opens.
  const [cards, setCards] = useState<AiActionCard[]>([]);
  useEffect(() => {
    let live = true;
    listAiActionsAction().then((waiting) => { if (live) setCards(waiting); }, () => null);
    return () => { live = false; };
  }, []);
  const replaceCard = (next: AiActionCard) => setCards((current) => current.map((item) => item.id === next.id ? next : item));

  function ask(text: string) {
    const asked = text.trim();
    if (asked.length < 2 || pending) return;
    const sent = files;
    const shown = sent.length ? `${asked}\n📎 ${sent.map((file) => file.name).join(", ")}` : asked;
    setTurns((current) => [...current, { role: "user", text: shown }]);
    setQuestion("");
    setNotice("");
    setFileProblem("");
    start(async () => {
      let answer: Awaited<ReturnType<typeof askAiAction>>;
      const form = new FormData();
      form.set("question", asked);
      form.set("model", model);
      for (const file of sent) form.append("files", file);
      try {
        answer = await askAiAction(form);
      } catch {
        // The request itself failed (timeout, lost connection): the answer is unknown, not a refusal.
        setTurns((current) => [...current, { role: "assistant", text: "Chưa nhận được trả lời của trợ lý AI (mất kết nối hoặc quá thời gian chờ). Vui lòng hỏi lại." }]);
        return;
      }
      setTurns((current) => [...current, { role: "assistant", text: answer.text }]);
      // The files went with this question; after a failure they stay attached for the next try.
      if (answer.outcome === "OK") setFiles((current) => current.filter((file) => !sent.includes(file)));
      if (answer.actions.length) setCards((current) => [...current.filter((item) => !answer.actions.some((next) => next.id === item.id)), ...answer.actions]);
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
      <span className="muted">Trợ lý đọc dữ liệu bạn có quyền xem và soạn sẵn việc cần làm; chỉ thực hiện khi bạn bấm Xác nhận.</span>
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
      {cards.length > 0 && <div className="ai-action-list" aria-label="Việc trợ lý soạn sẵn">{cards.map((card) => <AiActionCardView key={card.id} card={card} onChange={replaceCard} />)}</div>}
      {pending && <div className="chat-bubble-row theirs"><div className="chat-bubble muted">Đang đọc dữ liệu và trả lời…</div></div>}
      <ScrollToEnd signal={`${turns.length}:${pending}:${cards.length}`} />
    </div>
    {notice && <p className="form-message success" role="status">{notice}</p>}
    <form className="chat-composer ai-composer" onSubmit={(event) => { event.preventDefault(); ask(question); }}>
      {files.length > 0 && <ul className="ai-attachments" aria-label="Tệp đính kèm">{files.map((file, index) => <li key={`${file.name}-${index}`} className="ai-attachment">
        <Paperclip size={14} aria-hidden="true" /><span className="ai-attachment-name">{file.name}</span><small>{fileSize(file.size)}</small>
        <button type="button" className="icon-button ai-attachment-remove" onClick={() => removeFile(index)} disabled={pending} aria-label={`Bỏ tệp ${file.name}`} title="Bỏ tệp"><X size={14} aria-hidden="true" /></button>
      </li>)}</ul>}
      {fileProblem && <p className="form-message chat-composer-error" role="alert">{fileProblem}</p>}
      <div className="ai-composer-row">
        <input ref={picker} type="file" multiple hidden accept={AI_ATTACHMENT_ACCEPT} onChange={(event) => addFiles(event.target.files)}
          aria-label="Chọn tệp đính kèm" />
        <button type="button" className="icon-button ai-attach" onClick={() => picker.current?.click()} disabled={pending || files.length >= AI_ATTACHMENT_MAX_FILES}
          aria-label="Đính kèm tệp" title="Đính kèm ảnh, PDF, Excel, CSV, TXT (tối đa 5 tệp, 3,5 MB)"><Paperclip size={18} aria-hidden="true" /></button>
        <label className="sr-only" htmlFor={compact ? "ai-question-bubble" : "ai-question"}>Câu hỏi cho trợ lý</label>
        <textarea id={compact ? "ai-question-bubble" : "ai-question"} value={question} onChange={(event) => setQuestion(event.target.value)} rows={1} maxLength={2000}
          placeholder="Nhắn cho trợ lý AI…" onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); ask(question); } }} />
        <button className="button button-primary" disabled={pending || question.trim().length < 2}>{pending ? "Đang hỏi…" : "Gửi"}</button>
      </div>
      <div className="ai-composer-meta">
        <label className="ai-model-picker"><span>Mô hình</span>
          <select value={model} onChange={(event) => pickModel(event.target.value as AiModelId)} disabled={pending} aria-label="Chọn mô hình Claude">
            {AI_MODELS.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.hint}</option>)}
          </select>
        </label>
      </div>
    </form>
  </section>;
}

export function DecideProposalForm({ proposalId, decision }: { proposalId: string; decision: "DONE" | "DISMISSED" }) {
  return <CommandForm action={decideAiProposalAction} submit={decision === "DONE" ? "Đã làm" : "Bỏ qua"} danger={decision === "DISMISSED"} className="mini-command">
    <input type="hidden" name="proposalId" value={proposalId} />
    <input type="hidden" name="decision" value={decision} />
  </CommandForm>;
}
