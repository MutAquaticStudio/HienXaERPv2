"use client";

// D65: "Xem và sửa" on a card of the assistant that is not a catalog record (sales order, purchase order, receipt, expense…).
// The form is drawn from the tool's own input description, pre-filled with what the assistant understood. "Lưu" sends the
// values back through the action's own checks (the same ones the assistant ran), so a wrong customer or item is told here.
import { useId, useState, useTransition } from "react";

import { Dialog } from "@/components/ui/dialog";
import { submitAiActionFormAction, type AiActionCard } from "./actions";
import { blankValue, type FormField } from "./form-spec";

type Line = Record<string, string>;
type Values = Record<string, string | boolean | Line[]>;

const text = (value: unknown) => (value === null || value === undefined ? "" : typeof value === "boolean" ? "" : String(value));

function startValues(card: AiActionCard): Values {
  const spec = card.form;
  const values: Values = {};
  for (const field of spec?.fields ?? []) {
    const given = spec?.values[field.key];
    if (field.kind === "checkbox") values[field.key] = given === true;
    else if (field.kind === "lines") {
      const lines = Array.isArray(given) ? given : [];
      values[field.key] = lines.map((line) => Object.fromEntries((field.columns ?? []).map((column) => [column.key, text((line as Record<string, unknown>)?.[column.key])])));
    } else values[field.key] = text(given);
  }
  return values;
}

export function ActionFormDialog({ card, onClose, onDone }: { card: AiActionCard; onClose: () => void; onDone: (card: AiActionCard) => void }) {
  const spec = card.form;
  const base = useId();
  const [values, setValues] = useState<Values>(() => startValues(card));
  const [error, setError] = useState("");
  const [busy, start] = useTransition();
  if (!spec) return null;

  const set = (key: string, value: string | boolean | Line[]) => setValues((current) => ({ ...current, [key]: value }));
  const lineOf = (field: FormField): Line[] => (values[field.key] as Line[]) ?? [];
  const setCell = (field: FormField, index: number, column: string, value: string) => set(field.key, lineOf(field).map((line, at) => (at === index ? { ...line, [column]: value } : line)));
  const addLine = (field: FormField) => set(field.key, [...lineOf(field), Object.fromEntries((field.columns ?? []).map((column) => [column.key, ""]))]);
  const removeLine = (field: FormField, index: number) => set(field.key, lineOf(field).filter((_, at) => at !== index));

  function submit(event: React.FormEvent) {
    event.preventDefault();
    start(async () => {
      setError("");
      // An empty box is sent as empty text, so the action's own checks see every key; empty lines are dropped.
      const payload: Record<string, unknown> = {};
      for (const field of spec!.fields) {
        const value = values[field.key];
        payload[field.key] = field.kind === "lines" ? (value as Line[]).filter((line) => Object.values(line).some((cell) => cell.trim())) : (value ?? blankValue(field));
      }
      const outcome = await submitAiActionFormAction({ actionId: card.id, values: payload }).catch(() => null);
      if (!outcome) { setError("Chưa nhận được kết quả. Mở lại chat để xem thẻ đã xong chưa trước khi lưu lại."); return; }
      if (outcome.card && outcome.card.state !== "PENDING") { onDone(outcome.card); onClose(); return; }
      setError(outcome.message);
    });
  }

  return <Dialog title={card.title} eyebrow="Xem và sửa" description="Các ô đã điền theo yêu cầu của bạn. Sửa nếu cần rồi bấm Lưu." size="lg" onClose={onClose}>
    <form className="ai-form" onSubmit={submit} noValidate>
      <div className="form-grid">
        {spec.fields.map((field) => {
          const id = `${base}-${field.key}`;
          if (field.kind === "lines") return <fieldset key={field.key} className="ai-form-lines field-full"><legend>{field.label}</legend>
            {lineOf(field).length === 0 && <p className="muted">Chưa có dòng nào.</p>}
            {lineOf(field).map((line, index) => <div key={index} className="ai-form-line" role="group" aria-label={`${field.label} ${index + 1}`}>
              {(field.columns ?? []).map((column) => <div className="field" key={column.key}>
                <label htmlFor={`${id}-${index}-${column.key}`}>{column.label}</label>
                <input id={`${id}-${index}-${column.key}`} value={line[column.key] ?? ""} onChange={(event) => setCell(field, index, column.key, event.target.value)} inputMode={column.key === "so_luong" ? "decimal" : undefined} />
              </div>)}
              <button type="button" className="button button-secondary button-compact" onClick={() => removeLine(field, index)}>Xóa dòng</button>
            </div>)}
            <button type="button" className="button button-secondary button-compact" onClick={() => addLine(field)}>{field.addLabel ?? "Thêm dòng"}</button>
          </fieldset>;
          if (field.kind === "checkbox") return <div className="field field-check field-full" key={field.key}>
            <label htmlFor={id}><input id={id} type="checkbox" checked={values[field.key] === true} onChange={(event) => set(field.key, event.target.checked)} /> {field.label}</label>
          </div>;
          return <div className="field" key={field.key}>
            <label htmlFor={id}>{field.label}</label>
            {field.kind === "select" ? <select id={id} value={String(values[field.key] ?? "")} onChange={(event) => set(field.key, event.target.value)}>
                {(field.options ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
              : field.kind === "textarea" ? <textarea id={id} rows={3} value={String(values[field.key] ?? "")} onChange={(event) => set(field.key, event.target.value)} />
              : <input id={id} type={field.kind === "date" ? "date" : "text"} inputMode={field.kind === "money" ? "numeric" : undefined} value={String(values[field.key] ?? "")} onChange={(event) => set(field.key, event.target.value)} />}
            {field.help && <small className="muted">{field.help}</small>}
          </div>;
        })}
      </div>
      {error && <p className="form-message error" role="alert">{error}</p>}
      <div className="ai-action-buttons">
        <button type="submit" className="button button-primary" disabled={busy}>{busy ? "Đang lưu…" : "Lưu"}</button>
        <button type="button" className="button button-secondary" onClick={onClose} disabled={busy}>Đóng</button>
      </div>
    </form>
  </Dialog>;
}
