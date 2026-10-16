"use client";

import { forwardRef, useEffect, useId, useImperativeHandle, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { matchesSearch } from "./search-text";
import type { EditorMaterial } from "./types";

export const MATERIAL_RESULT_LIMIT = 20;

export type MaterialSearchHandle = { focus: () => void };

/** KiotViet-style product search: type code or name (accents optional), Enter adds the line. F3 jumps here. */
export const MaterialSearchBox = forwardRef<MaterialSearchHandle, {
  materials: EditorMaterial[];
  onPick: (material: EditorMaterial) => void;
  disabled?: boolean;
  label?: string;
}>(function MaterialSearchBox({ materials, onPick, disabled, label = "Tìm vật tư" }, ref) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [open, setOpen] = useState(false);
  const results = useMemo(() => query.trim()
    ? materials.filter((material) => matchesSearch(query, material.code, material.name)).slice(0, MATERIAL_RESULT_LIMIT)
    : [], [materials, query]);

  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }), []);
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "F3") return;
      event.preventDefault();
      inputRef.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  function pick(material: EditorMaterial) {
    setQuery("");
    setOpen(false);
    setHighlight(0);
    onPick(material);
  }

  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setHighlight((current) => results.length ? (current + step + results.length) % results.length : 0);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const material = results[highlight];
      if (material) pick(material);
    } else if (event.key === "Escape") {
      setQuery("");
      setOpen(false);
    }
  }

  const listId = `${id}-list`;
  const showList = open && query.trim().length > 0;
  return <div className="doc-editor-search">
    <label htmlFor={id} className="sr-only">{label}</label>
    <input id={id} ref={inputRef} type="search" role="combobox" autoComplete="off" disabled={disabled}
      placeholder="Tìm vật tư theo mã hoặc tên (F3)" value={query}
      aria-expanded={showList} aria-controls={listId} aria-autocomplete="list"
      aria-activedescendant={showList && results[highlight] ? `${listId}-${highlight}` : undefined}
      onChange={(event) => { setQuery(event.target.value); setHighlight(0); setOpen(true); }}
      onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={keyDown} />
    {showList && <ul id={listId} role="listbox" aria-label="Kết quả tìm vật tư" className="doc-editor-listbox">
      {results.map((material, index) => <li key={material.id} id={`${listId}-${index}`} role="option" aria-selected={index === highlight}
        onMouseDown={(event) => { event.preventDefault(); pick(material); }} onMouseEnter={() => setHighlight(index)}>
        <span>{material.name}</span><small>{[material.code, material.uoms.map((uom) => uom.symbol).join(" · ")].filter(Boolean).join(" · ")}</small>
      </li>)}
      {!results.length && <li className="doc-editor-listbox-note" role="presentation">Không tìm thấy vật tư phù hợp.</li>}
    </ul>}
  </div>;
});
