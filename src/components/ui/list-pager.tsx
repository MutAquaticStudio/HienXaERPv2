import Link from "next/link";
import { CORE_LIST_PAGE_SIZE } from "@/lib/core-list";

function href(page: number, params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  if (page > 1) query.set("page", String(page));
  const value = query.toString();
  return value ? `?${value}` : "?";
}

export function ListPager({ page, total, hasNext, params }: { page: number; total?: number; hasNext?: boolean; params: Record<string, string | undefined> }) {
  const pages = total === undefined ? null : Math.max(1, Math.ceil(total / CORE_LIST_PAGE_SIZE));
  const showNext = pages === null ? Boolean(hasNext) : page < pages;
  return <div className="section-head"><span className="muted">{pages === null ? `Trang ${page}` : `Trang ${page} / ${pages} · ${total} kết quả`}</span><div className="action-cluster">{page > 1 && <Link className="button button-secondary" href={href(page - 1, params)}>Trang trước</Link>}{showNext && <Link className="button button-secondary" href={href(page + 1, params)}>Trang sau</Link>}</div></div>;
}
