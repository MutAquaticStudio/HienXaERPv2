import Link from "next/link";
import { CORE_LIST_PAGE_SIZE } from "@/lib/core-list";

/** "Đến trang" appears only when there are enough pages to make typing a number faster than clicking. */
const JUMP_FROM_PAGES = 6;
const count = new Intl.NumberFormat("vi-VN");

function href(page: number, params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  if (page > 1) query.set("page", String(page));
  const value = query.toString();
  return value ? `?${value}` : "?";
}

/** Page numbers to show: the first, the last and two on each side of `page`; `null` marks a gap ("…"). */
export function pageWindow(page: number, pages: number): (number | null)[] {
  const current = Math.min(Math.max(page, 1), pages);
  const shown = [...new Set([1, pages, current - 2, current - 1, current, current + 1, current + 2])]
    .filter((value) => value >= 1 && value <= pages).sort((left, right) => left - right);
  const result: (number | null)[] = [];
  shown.forEach((value, index) => {
    const previous = shown[index - 1];
    // A gap of a single page shows that page instead of "…".
    if (previous !== undefined && value - previous === 2) result.push(previous + 1);
    else if (previous !== undefined && value - previous > 2) result.push(null);
    result.push(value);
  });
  return result;
}

/**
 * Pager under a list. With an exact `total` it shows "Trang x / y", page numbers and, from 6 pages, a "Đến trang" box;
 * without one (`hasNext` from a sentinel row) only previous/next. Nothing is shown for an empty list or a single page.
 */
export function ListPager({ page, total, hasNext, params }: { page: number; total?: number; hasNext?: boolean; params: Record<string, string | undefined> }) {
  if (total === 0) return null;
  const pages = total === undefined ? null : Math.max(1, Math.ceil(total / CORE_LIST_PAGE_SIZE));
  const showPrevious = page > 1;
  const showNext = pages === null ? Boolean(hasNext) : page < pages;
  if (!showPrevious && !showNext) {
    return pages === null ? null : <div className="list-pager"><span className="muted">{count.format(total!)} kết quả</span></div>;
  }
  return <nav className="list-pager" aria-label="Phân trang">
    <span className="muted">{pages === null ? `Trang ${page}` : `Trang ${page} / ${pages} · ${count.format(total!)} kết quả`}</span>
    <div className="list-pager-pages">
      {showPrevious && <Link className="button button-secondary button-compact" href={href(page - 1, params)}>Trang trước</Link>}
      {pages !== null && pageWindow(page, pages).map((value, index) => value === null
        ? <span key={`gap-${index}`} className="list-pager-gap" aria-hidden="true">…</span>
        : value === page
          ? <span key={value} className="button button-primary button-compact" aria-current="page">{value}</span>
          : <Link key={value} className="button button-secondary button-compact" href={href(value, params)} aria-label={`Trang ${value}`}>{value}</Link>)}
      {showNext && <Link className="button button-secondary button-compact" href={href(page + 1, params)}>Trang sau</Link>}
    </div>
    {pages !== null && pages >= JUMP_FROM_PAGES && <form className="list-pager-jump" method="get">
      {Object.entries(params).map(([key, value]) => value ? <input key={key} type="hidden" name={key} value={value} /> : null)}
      <label>Đến trang<input type="number" name="page" min={1} max={pages} step={1} inputMode="numeric" required placeholder={`1–${pages}`} /></label>
      <button className="button button-secondary button-compact" type="submit">Đi</button>
    </form>}
  </nav>;
}
