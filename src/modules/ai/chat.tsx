"use client";

// FB14 (D36): the conversation with the chatbot. The same stored conversation shows in Tin nhắn ("Trợ lý AI"), in the
// floating bubble and on the AI page; each question goes to the server, which adds the earlier turns itself.
import { FileSpreadsheet, FileText, Paperclip, SendHorizontal, SquarePen, X } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";

import { ScrollToEnd } from "@/components/messaging/messaging-controls";
import { Dialog } from "@/components/ui/dialog";
import { askAiAction, listAiProposalsAction, newAiChatAction, type AiProposalCard } from "@/modules/ai/actions";
import { listAiActionsAction, type AiActionCard } from "@/modules/ai/agent/actions";
import { AiActionCardView } from "@/modules/ai/agent/action-card";
import type { AiTurn } from "@/modules/ai/assistant";
import { AiProposalCardView } from "@/modules/ai/proposal-card";
import { AI_ATTACHMENT_ACCEPT, AI_ATTACHMENT_MAX_FILES, attachmentKind, attachmentProblem, type AiTurnAttachment } from "@/modules/ai/attachment-limits";
import { AI_EFFORTS, AI_MODELS, aiEffort, aiModel, DEFAULT_AI_EFFORT, DEFAULT_AI_MODEL, type AiEffortId, type AiModelId } from "@/modules/ai/models";

/** Proposals shown at once in the chat; the rest open with "Xem thêm". */
const PROPOSALS_SHOWN = 3;
const PICK_EVENT = "hx-ai-pick";
/** The picks of this page load, so the pickers work even where the browser keeps no storage. */
const picked = new Map<string, string>();

/** D50: a choice of the chat remembered on this device (the model, the "mức suy nghĩ"), shared by every open chat. */
function useRememberedPick<T extends string>(storageKey: string, normalise: (value: string | null) => T, fallback: T): [T, (next: T) => void] {
  const read = () => {
    const current = picked.get(storageKey);
    if (current) return normalise(current);
    try { return normalise(window.localStorage.getItem(storageKey)); } catch { return fallback; }
  };
  const subscribe = (onChange: () => void) => {
    window.addEventListener("storage", onChange);
    window.addEventListener(PICK_EVENT, onChange);
    return () => { window.removeEventListener("storage", onChange); window.removeEventListener(PICK_EVENT, onChange); };
  };
  const value = useSyncExternalStore(subscribe, read, () => fallback);
  const pick = (next: T) => {
    picked.set(storageKey, next);
    try { window.localStorage.setItem(storageKey, next); } catch { /* not remembered after a reload */ }
    window.dispatchEvent(new Event(PICK_EVENT));
  };
  return [value, pick];
}

function fileSize(bytes: number) {
  return bytes >= 1_000_000 ? `${(bytes / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`;
}

/** D63: a turn of the chat with the files of the question (kept files come with a one-hour link, new ones with a local preview). */
export type AiChatViewTurn = AiTurn & { attachments?: AiTurnAttachment[] };

/** The question's text as shown: the "📎 names" line is replaced by the files themselves when they are listed. */
export function visibleTurnText(turn: AiChatViewTurn): string {
  return turn.attachments?.length ? turn.text.replace(/\n📎 [^\n]*$/, "") : turn.text;
}

const MIME_BY_KIND: Record<string, string> = { pdf: "application/pdf", spreadsheet: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", text: "text/plain" };
function localPreview(file: File): AiTurnAttachment {
  const kind = attachmentKind(file.name);
  const mime = file.type || (kind ? MIME_BY_KIND[kind] ?? "image/jpeg" : "application/octet-stream");
  const viewable = kind === "image" || kind === "pdf";
  return { name: file.name, mime, size: file.size, ...(viewable ? { url: URL.createObjectURL(file) } : {}) };
}

/** D63: pictures of a question as thumbnails (opened large in a popup), other files as chips; a broken link falls back to the name. */
export function TurnAttachments({ items }: { items: readonly AiTurnAttachment[] }) {
  const [open, setOpen] = useState<AiTurnAttachment | null>(null);
  const [broken, setBroken] = useState<ReadonlySet<string>>(new Set());
  const images = items.filter((item) => item.mime.startsWith("image/") && item.url && !broken.has(item.url));
  const files = items.filter((item) => !images.includes(item));
  return <div className="ai-turn-files">
    {images.length > 0 && <div className="ai-turn-images">{images.map((item) => <button key={item.url} type="button" className="ai-turn-image" onClick={() => setOpen(item)} aria-label={`Xem ảnh ${item.name}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a signed or local picture of the chat, not a page asset */}
      <img src={item.url} alt={item.name} loading="lazy" onError={() => setBroken((current) => new Set(current).add(item.url!))} />
    </button>)}</div>}
    {files.length > 0 && <ul className="ai-turn-chips">{files.map((item, index) => <li key={`${item.name}-${index}`} className="ai-turn-chip">
      {item.mime.includes("spreadsheet") || item.mime === "text/csv" ? <FileSpreadsheet size={14} aria-hidden="true" /> : <FileText size={14} aria-hidden="true" />}
      <span className="ai-attachment-name">{item.name}</span><small>{fileSize(item.size)}</small>
      {item.url && item.mime === "application/pdf" && <a href={item.url} target="_blank" rel="noopener noreferrer">Mở</a>}
    </li>)}</ul>}
    {open && <Dialog title={open.name} onClose={() => setOpen(null)} size="lg">
      <div className="ai-image-viewer">
        {/* eslint-disable-next-line @next/next/no-img-element -- a signed or local picture of the chat */}
        <img src={open.url} alt={open.name} />
        <a className="code-link" href={open.url} target="_blank" rel="noopener noreferrer">Mở ảnh gốc</a>
      </div>
    </Dialog>}
  </div>;
}

export const AI_SUGGESTIONS = [
  "Tóm tắt tình hình hôm nay: đơn bán, giao hàng, thu chi.",
  "Khách nào nợ quá hạn nhiều nhất?",
  "Hàng nào dưới ngưỡng tồn kho cần nhập?",
  "Hôm nay có những phiếu giao nào, ai đang giao?",
  "Soạn đơn bán 20 bao xi măng cho khách quen, giao ngày mai.",
] as const;

export function AiChat({ initialTurns, compact = false }: { initialTurns: AiChatViewTurn[]; compact?: boolean }) {
  const [turns, setTurns] = useState<AiChatViewTurn[]>(initialTurns);
  // Local previews of pictures sent in this visit, released when the chat closes.
  const previews = useRef<string[]>([]);
  useEffect(() => () => { for (const url of previews.current) URL.revokeObjectURL(url); }, []);
  const [question, setQuestion] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, start] = useTransition();
  // D50: the model and the "mức suy nghĩ" picked in the chat (remembered on this device; every open chat — page, bubble,
  // Tin nhắn — shows the same choice) and the files attached to the next question.
  const [model, pickModel] = useRememberedPick<AiModelId>("hx.ai.model", (value) => aiModel(value).id, DEFAULT_AI_MODEL);
  const [effort, pickEffort] = useRememberedPick<AiEffortId>("hx.ai.effort", (value) => aiEffort(value).id, DEFAULT_AI_EFFORT);
  const [files, setFiles] = useState<File[]>([]);
  const [fileProblem, setFileProblem] = useState("");
  const picker = useRef<HTMLInputElement>(null);
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
  // D66: proposals waiting for a manager are cards of the chat too (no separate page).
  const [proposals, setProposals] = useState<AiProposalCard[]>([]);
  const [canDecide, setCanDecide] = useState(false);
  const [allProposals, setAllProposals] = useState(false);
  const loadProposals = () => listAiProposalsAction().then((list) => { setProposals(list.proposals); setCanDecide(list.canDecide); }, () => null);
  useEffect(() => { void loadProposals(); }, []);
  const shownProposals = allProposals ? proposals : proposals.slice(0, PROPOSALS_SHOWN);
  const replaceCard = (next: AiActionCard) => setCards((current) => current.map((item) => item.id === next.id ? next : item));

  function ask(text: string) {
    const asked = text.trim();
    if (asked.length < 2 || pending) return;
    const sent = files;
    const shown = sent.length ? `${asked}\n📎 ${sent.map((file) => file.name).join(", ")}` : asked;
    const attachments = sent.map(localPreview);
    previews.current.push(...attachments.flatMap((item) => item.url ? [item.url] : []));
    setTurns((current) => [...current, { role: "user", text: shown, ...(attachments.length ? { attachments } : {}) }]);
    setQuestion("");
    setNotice("");
    setFileProblem("");
    start(async () => {
      let answer: Awaited<ReturnType<typeof askAiAction>>;
      const form = new FormData();
      form.set("question", asked);
      form.set("model", model);
      form.set("effort", effort);
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
      if (answer.proposals) { setNotice(`Đã ghi ${answer.proposals} đề xuất chờ duyệt.`); void loadProposals(); }
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
    <div className="ai-turns chat-scroll" aria-live="polite">
      {!turns.length && <div className="ai-empty">
        <p>Hỏi bất cứ điều gì về bán hàng, kho, giao hàng, công nợ, sổ quỹ, chấm công, bảng lương…</p>
        <p className="ai-empty-note">Trợ lý đọc dữ liệu bạn có quyền xem và soạn sẵn việc cần làm; chỉ thực hiện khi bạn bấm Xác nhận.</p>
        <div className="period-presets">{AI_SUGGESTIONS.map((item) => <button key={item} type="button" className="chip-link" onClick={() => ask(item)}>{item}</button>)}</div>
      </div>}
      {turns.map((turn, index) => <div key={index} className={`chat-bubble-row ${turn.role === "user" ? "mine" : "theirs"}`}>
        <div className="chat-bubble">{turn.attachments?.length ? <TurnAttachments items={turn.attachments} /> : null}{visibleTurnText(turn)}</div>
      </div>)}
      {cards.length > 0 && <div className="ai-action-list" aria-label="Việc trợ lý soạn sẵn">{cards.map((card) => <AiActionCardView key={card.id} card={card} onChange={replaceCard} />)}</div>}
      {proposals.length > 0 && <div className="ai-action-list" aria-label="Đề xuất chờ duyệt">
        {shownProposals.map((proposal) => <AiProposalCardView key={proposal.id} proposal={proposal} canDecide={canDecide} onDecided={(id) => setProposals((current) => current.filter((item) => item.id !== id))} />)}
        {proposals.length > PROPOSALS_SHOWN && <button type="button" className="button button-secondary button-compact" onClick={() => setAllProposals(!allProposals)}>
          {allProposals ? "Thu gọn danh sách đề xuất" : `Xem thêm ${proposals.length - PROPOSALS_SHOWN} đề xuất`}</button>}
      </div>}
      {pending && <div className="chat-bubble-row theirs"><div className="chat-bubble muted">Đang đọc dữ liệu và trả lời…</div></div>}
      <ScrollToEnd signal={`${turns.length}:${pending}:${cards.length}:${proposals.length}`} />
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
        {compact
          ? <button className="button button-primary ai-send-icon" disabled={pending || question.trim().length < 2} aria-label={pending ? "Đang hỏi" : "Gửi"} title="Gửi (Enter)">
            <SendHorizontal size={18} aria-hidden="true" /></button>
          : <button className="button button-primary" disabled={pending || question.trim().length < 2}>{pending ? "Đang hỏi…" : "Gửi"}</button>}
      </div>
      <div className="ai-composer-meta">
        <label className="sr-only" htmlFor={`${compact ? "ai-bubble" : "ai"}-model`}>Mô hình Claude</label>
        <select id={`${compact ? "ai-bubble" : "ai"}-model`} className="ai-pill-select" value={model} onChange={(event) => pickModel(event.target.value as AiModelId)} disabled={pending}
          title={`Mô hình: ${aiModel(model).label} — ${aiModel(model).hint}`}>
          {AI_MODELS.map((item) => <option key={item.id} value={item.id} title={item.hint}>{item.label}</option>)}
        </select>
        <label className="sr-only" htmlFor={`${compact ? "ai-bubble" : "ai"}-effort`}>Mức suy nghĩ</label>
        <select id={`${compact ? "ai-bubble" : "ai"}-effort`} className="ai-pill-select" value={effort} onChange={(event) => pickEffort(event.target.value as AiEffortId)} disabled={pending}
          title={`Mức suy nghĩ: ${aiEffort(effort).label} — ${aiEffort(effort).hint}. Mức càng cao trả lời càng kỹ nhưng chậm và tốn token hơn.`}>
          {AI_EFFORTS.map((item) => <option key={item.id} value={item.id} title={item.hint}>Suy nghĩ {item.label.toLocaleLowerCase("vi-VN")}</option>)}
        </select>
        {turns.length > 0 && <button type="button" className="icon-button ai-new-chat" onClick={restart} disabled={pending}
          aria-label="Cuộc trò chuyện mới" title="Cuộc trò chuyện mới (lưu trữ cuộc hiện tại)"><SquarePen size={16} aria-hidden="true" /></button>}
      </div>
    </form>
  </section>;
}
