"use client";

import { Fragment, forwardRef, useEffect, useId, useImperativeHandle, useMemo, useRef, useState, type KeyboardEvent } from "react";
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
  /** Extra text per result, e.g. the stock that can be sold from the chosen warehouse. */
  hint?: (material: EditorMaterial) => string | null;
}>(function MaterialSearchBox({ materials, onPick, disabled, label = "Tìm vật tư", hint }, ref) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [open, setOpen] = useState(false);
  const results = useMemo(() => {
    if (!query.trim()) return [];
    const found = materials.filter((material) => matchesSearch(query, material.code, material.name, material.variant?.name, material.variant?.label));
    // Variants of one product stay together, under the product name, where the first of them was found.
    const first = new Map<string, number>();
    found.forEach((material, index) => { const key = material.variant?.groupId ?? material.id; if (!first.has(key)) first.set(key, index); });
    const place = (material: EditorMaterial) => first.get(material.variant?.groupId ?? material.id)!;
    return found.map((material, index) => ({ material, index })).sort((left, right) => place(left.material) - place(right.material) || left.index - right.index)
      .map((item) => item.material).slice(0, MATERIAL_RESULT_LIMIT);
  }, [materials, query]);

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
      if (open && query.trim()) event.preventDefault();
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
      {results.map((material, index) => <Fragment key={material.id}>
        {material.variant && material.variant.groupId !== results[index - 1]?.variant?.groupId && <li className="doc-editor-listbox-group" role="presentation">{material.variant.name}</li>}
        <li id={`${listId}-${index}`} role="option" aria-selected={index === highlight} className={material.variant ? "doc-editor-listbox-variant" : undefined}
          onMouseDown={(event) => { event.preventDefault(); pick(material); }} onMouseEnter={() => setHighlight(index)}>
          <span>{material.name}</span><small>{[material.variant?.label, material.code, material.uoms.map((uom) => uom.symbol).join(" · "), hint?.(material)].filter(Boolean).join(" · ")}</small>
        </li>
      </Fragment>)}
      {!results.length && <li className="doc-editor-listbox-note" role="presentation">Không tìm thấy vật tư phù hợp.</li>}
    </ul>}
  </div>;
});
