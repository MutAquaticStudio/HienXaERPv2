"use client";

// FB15 (D37): a card of what the assistant prepared. Nothing is written until "Xác nhận".
import Link from "next/link";
import { useState, useTransition } from "react";

import { confirmAiActionAction, dismissAiActionAction, type AiActionCard } from "./actions";

const STATE_LABELS: Record<AiActionCard["state"], string> = { PENDING: "Chờ bạn xác nhận", DONE: "Đã thực hiện", FAILED: "Không thực hiện được", CANCELLED: "Đã bỏ qua" };

export function AiActionCardView({ card, onChange }: { card: AiActionCard; onChange(card: AiActionCard): void }) {
  const [error, setError] = useState("");
  const [busy, start] = useTransition();

  function confirm() {
    start(async () => {
      setError("");
      const outcome = await confirmAiActionAction({ actionId: card.id });
      if (outcome.card) onChange(outcome.card);
      if (!outcome.ok) setError(outcome.message);
    });
  }

  function dismiss() {
    start(async () => {
      const outcome = await dismissAiActionAction({ actionId: card.id });
      if (outcome.ok) onChange({ ...card, state: "CANCELLED", message: outcome.message });
      else setError(outcome.message);
    });
  }

  return <article className={`ai-action-card ai-action-${card.state.toLowerCase()}`} aria-label={card.title}>
    <header><strong>{card.title}</strong><span className="ai-action-state">{STATE_LABELS[card.state]}</span></header>
    {card.summary.length > 0 && <dl>{card.summary.map((line, index) => <div key={index}><dt>{line.label}</dt><dd>{line.value}</dd></div>)}</dl>}
    {card.state === "PENDING" && <div className="ai-action-buttons">
      <button type="button" className="button button-primary button-compact" onClick={confirm} disabled={busy}>{busy ? "Đang thực hiện…" : "Xác nhận"}</button>
      <button type="button" className="button button-secondary button-compact" onClick={dismiss} disabled={busy}>Bỏ qua</button>
    </div>}
    {card.state === "DONE" && <p className="ai-action-result">{card.message}{card.link && <> <Link href={card.link}>Mở</Link></>}</p>}
    {error && <p className="form-message error" role="alert">{error}</p>}
  </article>;
}
