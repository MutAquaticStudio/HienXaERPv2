"use client";

import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { EntityOption } from "./types";

export const ENTITY_SEARCH_DEBOUNCE_MS = 300;

export type EntityComboboxHandle = { focus: () => void };

type Props = {
  label: string;
  name: string;
  value: EntityOption | null;
  /** Suggestions shown before the user types (e.g. the customer's sites). */
  options: EntityOption[];
  onSearch?: (term: string) => Promise<EntityOption[]>;
  onSelect: (option: EntityOption | null) => void;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  action?: ReactNode;
  emptyText?: string;
};

/** Type-to-filter picker. Nothing is chosen until the user confirms an option (click or Enter). */
export const EntityCombobox = forwardRef<EntityComboboxHandle, Props>(function EntityCombobox(
  { label, name, value, options, onSearch, onSelect, placeholder, disabled, readOnly, action, emptyText = "Không tìm thấy kết quả phù hợp." }, ref) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<EntityOption[] | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const revision = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }), []);
  useEffect(() => () => clearTimeout(timer.current), []);

  const shown = results ?? options;
  const text = query ?? value?.label ?? "";

  function search(term: string) {
    clearTimeout(timer.current);
    if (!onSearch) {
      const lowered = term.toLowerCase();
      setResults(options.filter((option) => `${option.label} ${option.detail ?? ""}`.toLowerCase().includes(lowered)));
      return;
    }
    const current = ++revision.current;
    timer.current = setTimeout(async () => {
      setLoading(true);
      setFailed(false);
      try {
        const found = await onSearch(term);
        if (current === revision.current) { setResults(found); setHighlight(0); }
      } catch {
        if (current === revision.current) setFailed(true);
      } finally {
        if (current === revision.current) setLoading(false);
      }
    }, ENTITY_SEARCH_DEBOUNCE_MS);
  }

  function choose(option: EntityOption) {
    revision.current += 1;
    clearTimeout(timer.current);
    setQuery(null);
    setResults(null);
    setOpen(false);
    onSelect(option);
  }

  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      const step = event.key === "ArrowDown" ? 1 : -1;
      setHighlight((current) => shown.length ? (current + step + shown.length) % shown.length : 0);
    } else if (event.key === "Enter") {
      // Enter only ever picks; it never submits the surrounding document form.
      event.preventDefault();
      if (!open) { setOpen(true); return; }
      const option = shown[highlight];
      if (option) choose(option);
    } else if (event.key === "Escape") {
      setOpen(false);
      setQuery(null);
      setResults(null);
    }
  }

  const listId = `${id}-list`;
  if (readOnly) {
    return <div className="field doc-editor-entity"><span className="doc-editor-label">{label}</span><strong>{value?.label ?? "—"}</strong>{value?.detail && <small className="muted">{value.detail}</small>}<input type="hidden" name={name} value={value?.id ?? ""} /></div>;
  }
  return <div className="field doc-editor-entity">
    <div className="field-label-row"><label htmlFor={id}>{label}</label>{action}</div>
    <div className="doc-editor-combo">
      <input id={id} ref={inputRef} type="text" role="combobox" autoComplete="off" disabled={disabled} placeholder={placeholder}
        aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
        aria-activedescendant={open && shown[highlight] ? `${listId}-${highlight}` : undefined}
        value={text}
        onFocus={() => { setOpen(true); setHighlight(Math.max(0, shown.findIndex((option) => option.id === value?.id))); }}
        onBlur={() => { setOpen(false); setQuery(null); setResults(null); }}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); setHighlight(0); if (value) onSelect(null); search(event.target.value.trim()); }}
        onKeyDown={keyDown} />
      {open && <ul id={listId} role="listbox" aria-label={label} className="doc-editor-listbox">
        {shown.map((option, index) => <li key={option.id} id={`${listId}-${index}`} role="option" aria-selected={index === highlight}
          onMouseDown={(event) => { event.preventDefault(); choose(option); }} onMouseEnter={() => setHighlight(index)}>
          <span>{option.label}</span>{option.detail && <small>{option.detail}</small>}
        </li>)}
        {loading && <li className="doc-editor-listbox-note" role="presentation">Đang tìm...</li>}
        {!loading && failed && <li className="doc-editor-listbox-note" role="presentation">Không thể tìm. Thử lại sau.</li>}
        {!loading && !failed && !shown.length && <li className="doc-editor-listbox-note" role="presentation">{emptyText}</li>}
      </ul>}
    </div>
    {name && <input type="hidden" name={name} value={value?.id ?? ""} />}
    {value?.detail && <small className="muted">{value.detail}</small>}
  </div>;
});
