"use client";

// FB15 (D37): a card of what the assistant prepared. Nothing is written until "Xác nhận".
import Link from "next/link";
import { useState, useTransition } from "react";

import { confirmAiActionAction, dismissAiActionAction, type AiActionCard } from "./actions";

const STATE_LABELS: Record<AiActionCard["state"], string> = { PENDING: "Chờ bạn xác nhận", DONE: "Đã thực hiện", FAILED: "Không thực hiện được", CANCELLED: "Đã bỏ qua" };

export function AiActionCardView({ card, onChange }: { card: AiActionCard; onChange(card: AiActionCard): void }) {
  const [error, setError] = useState("");
  const [busy, start] = useTransition();
  // D63: rows of a list card the person unticked; they are left out when confirming.
  const [excluded, setExcluded] = useState<ReadonlySet<number>>(new Set());
  const creatable = card.rows?.filter((row) => row.status === "CREATE") ?? [];
  const chosen = creatable.filter((row) => !excluded.has(row.n)).length;
  const toggle = (n: number) => setExcluded((current) => { const next = new Set(current); if (next.has(n)) next.delete(n); else next.add(n); return next; });

  function confirm() {
    start(async () => {
      setError("");
      const outcome = await confirmAiActionAction({ actionId: card.id, ...(card.rows ? { exclude: [...excluded] } : {}) });
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
    {card.rows && card.rows.length > 0 && <div className="ai-action-rows"><table>
      <thead><tr>{card.state === "PENDING" && <th scope="col"><span className="sr-only">Chọn</span></th>}<th scope="col">#</th><th scope="col">Khách hàng</th><th scope="col">Trạng thái</th><th scope="col">Điện thoại</th><th scope="col">Địa chỉ</th></tr></thead>
      <tbody>{card.rows.map((row) => <tr key={row.n} className={row.status === "SKIP" || excluded.has(row.n) ? "ai-action-row-off" : undefined}>
        {card.state === "PENDING" && <td>{row.status === "CREATE" && <input type="checkbox" checked={!excluded.has(row.n)} onChange={() => toggle(row.n)} disabled={busy} aria-label={`Tạo khách ${row.ten || `dòng ${row.n}`}`} />}</td>}
        <td className="mono">{row.n}</td><td>{row.ten || "—"}</td>
        <td className="ai-action-row-status">{row.status === "CREATE" ? (excluded.has(row.n) ? "Không tạo" : "Tạo") : <span className="ai-action-row-reason">Bỏ qua: {row.reason}</span>}</td>
        <td className="mono">{row.dien_thoai || "—"}</td><td>{row.dia_chi_giao || "—"}</td>
      </tr>)}</tbody>
    </table></div>}
    {card.state === "PENDING" && <div className="ai-action-buttons">
      <button type="button" className="button button-primary button-compact" onClick={confirm} disabled={busy || (card.rows !== undefined && chosen === 0)}>
        {busy ? "Đang thực hiện…" : card.rows ? (chosen ? `Xác nhận tạo ${chosen} khách` : "Chọn khách để tạo") : "Xác nhận"}</button>
      <button type="button" className="button button-secondary button-compact" onClick={dismiss} disabled={busy}>Bỏ qua</button>
    </div>}
    {card.state === "DONE" && <p className="ai-action-result">{card.message}{card.link && <> <Link href={card.link}>Mở</Link></>}</p>}
    {error && <p className="form-message error" role="alert">{error}</p>}
  </article>;
}
