"use client";

// D66: a proposal of the assistant (something to do that has no ready-made action, or that the person may not do) shown
// inside the chat, like the cards of prepared actions: read it, open the screen where it is done, mark it done or dismiss it.
import Link from "next/link";
import { useState, useTransition } from "react";

import { decideAiProposalAction, type AiProposalCard } from "@/modules/ai/actions";

export function AiProposalCardView({ proposal, canDecide, onDecided }: { proposal: AiProposalCard; canDecide: boolean; onDecided(id: string): void }) {
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, start] = useTransition();
  const long = proposal.body.length > 260;
  const decide = (decision: "DONE" | "DISMISSED") => start(async () => {
    setError("");
    const outcome = await decideAiProposalAction({ proposalId: proposal.id, decision }).catch(() => ({ ok: false, message: "Chưa nhận được kết quả. Thử lại." }));
    if (outcome.ok) onDecided(proposal.id); else setError(outcome.message);
  });
  return <article className="ai-action-card ai-proposal-card" aria-label={proposal.title}>
    <header><strong>{proposal.title}</strong><span className="ai-action-state">Đề xuất chờ duyệt</span></header>
    <small className="table-subline">{proposal.createdAt}</small>
    <p className={`ai-proposal-body${long && !open ? " ai-proposal-clamped" : ""}`}>{proposal.body}</p>
    {long && <button type="button" className="code-link ai-proposal-more" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "Thu gọn" : "Xem đầy đủ"}</button>}
    <div className="ai-action-buttons">
      {proposal.linkPath && <Link className="button button-secondary button-compact" href={proposal.linkPath}>Mở màn hình thực hiện</Link>}
      {canDecide && <>
        <button type="button" className="button button-primary button-compact" onClick={() => decide("DONE")} disabled={busy}>Đã làm</button>
        <button type="button" className="button button-secondary button-compact" onClick={() => decide("DISMISSED")} disabled={busy}>Bỏ qua</button>
      </>}
    </div>
    {error && <p className="form-message error" role="alert">{error}</p>}
  </article>;
}
