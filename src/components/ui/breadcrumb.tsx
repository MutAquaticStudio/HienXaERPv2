import Link from "next/link";

/** D56 (mục 3): where a detail page sits — "Đơn bán › SO-2026-000079" — instead of a small label above its title. */
export function Breadcrumb({ parent, current }: { parent: { href: string; label: string }; current?: string }) {
  return <nav className="breadcrumb" aria-label="Đường dẫn">
    <Link href={parent.href}>{parent.label}</Link>
    {current && <><span aria-hidden="true">›</span><span aria-current="page">{current}</span></>}
  </nav>;
}
