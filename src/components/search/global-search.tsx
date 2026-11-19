"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Search } from "lucide-react";
import { globalSearchAction } from "@/modules/search/actions";
import type { SearchHit, SearchResult } from "@/modules/search/results";

const subscribeNothing = () => () => {};
const SHORTCUT = "Ctrl K";

/**
 * D56 ô tìm chung: one box in the top bar for số đơn, phiếu giao, khách, SĐT, công trình, vật tư. Ctrl K (⌘K) opens it
 * anywhere; ↑ ↓ choose, Enter opens, Esc closes; a document number typed exactly opens that document on Enter.
 */
export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const request = useRef(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const mounted = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const hits: SearchHit[] = result?.groups.flatMap((group) => group.hits) ?? [];

  const close = useCallback(() => { setOpen(false); trigger.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  useEffect(() => {
    const text = term.trim();
    const id = ++request.current;
    if (text.length < 2) return;
    // Wait for a pause in typing; an older answer arriving late never replaces a newer one.
    const timer = window.setTimeout(() => {
      setLoading(true);
      globalSearchAction(text).then((answer) => {
        if (id !== request.current) return;
        if ("error" in answer) { setError(answer.error); setResult(null); } else { setError(""); setResult(answer); setActive(0); }
      }).catch(() => { if (id === request.current) setError("Chưa tìm được. Kiểm tra kết nối rồi thử lại."); })
        .finally(() => { if (id === request.current) setLoading(false); });
    }, 220);
    return () => window.clearTimeout(timer);
  }, [term]);

  function go(href: string) { setOpen(false); setTerm(""); setResult(null); router.push(href); }
  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!hits.length) return;
      setActive((current) => (current + (event.key === "ArrowDown" ? 1 : hits.length - 1)) % hits.length);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const href = result?.exact ?? hits[active]?.href;
      if (href) go(href);
    }
  }

  const short = term.trim().length < 2;
  let index = -1;
  return <>
    <button ref={trigger} type="button" className="global-search-trigger" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label="Tìm đơn, phiếu giao, khách, vật tư">
      <Search aria-hidden size={18} /><span>Tìm số đơn, phiếu giao, khách, SĐT, vật tư…</span><kbd aria-hidden="true">{SHORTCUT}</kbd>
    </button>
    {open && mounted && createPortal(<div className="global-search-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section className="global-search-panel" role="dialog" aria-modal="true" aria-label="Tìm trong hệ thống">
        <div className="global-search-field">
          <Search aria-hidden size={18} />
          <input ref={input} type="search" role="combobox" aria-expanded={hits.length > 0} aria-controls={listId} aria-autocomplete="list"
            aria-activedescendant={hits.length ? `${listId}-${active}` : undefined} aria-label="Tìm đơn, phiếu giao, khách, SĐT, vật tư"
            placeholder="Gõ số đơn, tên khách, SĐT…" value={term} onChange={(event) => setTerm(event.target.value)} onKeyDown={onKeyDown} maxLength={80} autoComplete="off" />
          <button type="button" className="global-search-close" onClick={close}>Đóng</button>
        </div>
        <div id={listId} role="listbox" aria-label="Kết quả tìm" className="global-search-results">
          {short ? <p className="global-search-hint">Gõ không dấu được · số đơn (SO-…, DL-…, PO-…), tên / mã / SĐT khách, công trình, nhà cung cấp, vật tư.</p>
            : error ? <p className="global-search-hint" role="alert">{error}</p>
            : loading && !result ? <p className="global-search-hint" role="status">Đang tìm…</p>
            : result && !result.groups.length ? <p className="global-search-hint" role="status">Không thấy “{term.trim()}”. Thử số đơn đầy đủ, một phần tên khách hoặc số điện thoại.</p>
            : result?.groups.map((group) => <div key={group.key} role="group" aria-label={group.label}>
              <h3 className="global-search-group">{group.label}</h3>
              {group.hits.map((hit) => { index += 1; const mine = index; return <a key={`${group.key}-${hit.id}`} id={`${listId}-${mine}`} role="option" aria-selected={mine === active}
                className="global-search-hit" href={hit.href} onMouseEnter={() => setActive(mine)} onClick={(event) => { event.preventDefault(); go(hit.href); }}>
                <span><strong>{hit.title}</strong>{hit.detail && <small>{hit.detail}</small>}</span>{hit.badge && <span className="global-search-badge">{hit.badge}</span>}
              </a>; })}
            </div>)}
        </div>
        <p className="global-search-keys" aria-hidden="true"><span>↑ ↓ chọn</span><span>Enter mở</span><span>Esc đóng</span><span>Gõ đúng số chứng từ là mở thẳng</span></p>
      </section>
    </div>, document.body)}
  </>;
}
