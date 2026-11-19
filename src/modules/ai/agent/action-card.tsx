"use client";

// FB15 (D37): a card of what the assistant prepared. Nothing is written until "Xác nhận".
import dynamic from "next/dynamic";
import Link from "next/link";
import { useState, useTransition } from "react";

import { confirmAiActionAction, dismissAiActionAction, type AiActionCard } from "./actions";

// The two forms are loaded only when "Xem và sửa" is pressed: the chat bubble is on every admin page.
const ActionFormDialog = dynamic(() => import("./action-form-dialog").then((module) => module.ActionFormDialog), { ssr: false });
const CatalogActionDialog = dynamic(() => import("./catalog-action-dialog").then((module) => module.CatalogActionDialog), { ssr: false });

const STATE_LABELS: Record<AiActionCard["state"], string> = { PENDING: "Chờ bạn xác nhận", DONE: "Đã thực hiện", FAILED: "Không thực hiện được", CANCELLED: "Đã bỏ qua" };

export function AiActionCardView({ card, onChange }: { card: AiActionCard; onChange(card: AiActionCard): void }) {
  const [error, setError] = useState("");
  const [busy, start] = useTransition();
  // D65: the pre-filled form that "Xem và sửa" opens.
  const [editing, setEditing] = useState<"catalog" | "form" | null>(null);
  const canEdit = card.state === "PENDING" && Boolean(card.form || card.catalog);
  // D63: rows of a list card the person unticked; they are left out when confirming.
  const [excluded, setExcluded] = useState<ReadonlySet<number>>(new Set());
  const list = card.list;
  const creatable = list?.rows.filter((row) => row.status === "CREATE") ?? [];
  const chosen = creatable.filter((row) => !excluded.has(row.n)).length;
  const toggle = (n: number) => setExcluded((current) => { const next = new Set(current); if (next.has(n)) next.delete(n); else next.add(n); return next; });

  function confirm() {
    start(async () => {
      setError("");
      const outcome = await confirmAiActionAction({ actionId: card.id, ...(list ? { exclude: [...excluded] } : {}) });
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
    {list && list.rows.length > 0 && <div className="ai-action-rows"><table>
      <thead><tr>{card.state === "PENDING" && <th scope="col"><span className="sr-only">Chọn</span></th>}<th scope="col">#</th><th scope="col">{list.columns[0]}</th><th scope="col">Trạng thái</th>
        {list.columns.slice(1).map((column) => <th key={column} scope="col">{column}</th>)}</tr></thead>
      <tbody>{list.rows.map((row) => <tr key={row.n} className={row.status === "SKIP" || excluded.has(row.n) ? "ai-action-row-off" : undefined}>
        {card.state === "PENDING" && <td>{row.status === "CREATE" && <input type="checkbox" checked={!excluded.has(row.n)} onChange={() => toggle(row.n)} disabled={busy} aria-label={`${list.okLabel} ${row.cells[0] || `dòng ${row.n}`}`} />}</td>}
        <td className="mono">{row.n}</td><td>{row.cells[0]}</td>
        <td className="ai-action-row-status">{row.status === "CREATE" ? (excluded.has(row.n) ? "Không làm" : list.okLabel) : <span className="ai-action-row-reason">Bỏ qua: {row.reason}</span>}</td>
        {row.cells.slice(1).map((cell, index) => <td key={index}>{cell}</td>)}
      </tr>)}</tbody>
    </table></div>}
    {card.state === "PENDING" && <div className="ai-action-buttons">
      {canEdit && <button type="button" className="button button-primary button-compact" onClick={() => setEditing(card.catalog ? "catalog" : "form")} disabled={busy}>Xem và sửa</button>}
      <button type="button" className={`button ${canEdit ? "button-secondary" : "button-primary"} button-compact`} onClick={confirm} disabled={busy || (list !== undefined && chosen === 0)}>
        {busy ? "Đang thực hiện…" : list ? (chosen ? `Xác nhận ${list.verb} ${chosen} ${list.noun}` : `Chọn ${list.noun} để ${list.verb}`) : "Xác nhận"}</button>
      <button type="button" className="button button-secondary button-compact" onClick={dismiss} disabled={busy}>Bỏ qua</button>
    </div>}
    {card.state === "DONE" && <p className="ai-action-result">{card.message}{card.link && <> <Link href={card.link}>Mở</Link></>}</p>}
    {error && <p className="form-message error" role="alert">{error}</p>}
    {/* Stays mounted after the card is done: a new customer then goes on to the form of its first site. */}
    {editing === "catalog" && <CatalogActionDialog card={card} onClose={() => setEditing(null)} onDone={onChange} />}
    {editing === "form" && <ActionFormDialog card={card} onClose={() => setEditing(null)} onDone={onChange} />}
  </article>;
}
