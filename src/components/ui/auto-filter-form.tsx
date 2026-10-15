"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useTransition, type ChangeEvent, type FormEvent, type FormHTMLAttributes } from "react";

export const FILTER_TEXT_DEBOUNCE_MS = 300;

const TEXT_TYPES = new Set(["text", "search", "tel", "email", "number"]);

/** Filter state stays in the URL (UX-110). Empty values are dropped and paging restarts on page 1. */
export function filterHref(pathname: string, form: HTMLFormElement): string {
  const params = new URLSearchParams();
  for (const [name, value] of new FormData(form)) {
    if (typeof value !== "string" || name === "page") continue;
    const trimmed = value.trim();
    if (trimmed) params.append(name, trimmed);
  }
  const search = params.toString();
  return search ? `${pathname}?${search}` : pathname;
}

type AutoFilterFormProps = Omit<FormHTMLAttributes<HTMLFormElement>, "onSubmit" | "onChange" | "method" | "action">;

/**
 * A GET filter form that applies itself: selects and dates apply at once, typed text after a short pause (UX-100).
 * Without JavaScript the <noscript> button keeps the plain GET submit working.
 */
export function AutoFilterForm({ className = "filter-bar", children, ...props }: AutoFilterFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const formRef = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [pending, startTransition] = useTransition();

  useEffect(() => () => clearTimeout(timer.current), []);

  function apply() {
    clearTimeout(timer.current);
    const form = formRef.current;
    if (!form) return;
    const href = filterHref(pathname, form);
    startTransition(() => router.replace(href, { scroll: false }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    apply();
  }

  function change(event: ChangeEvent<HTMLFormElement>) {
    const target = event.target as unknown as HTMLInputElement | HTMLSelectElement;
    if (!target.name) return;
    if (target instanceof HTMLInputElement && TEXT_TYPES.has(target.type)) {
      clearTimeout(timer.current);
      timer.current = setTimeout(apply, FILTER_TEXT_DEBOUNCE_MS);
      return;
    }
    apply();
  }

  return <form {...props} ref={formRef} className={className} method="get" onSubmit={submit} onChange={change} aria-busy={pending || undefined}>
    {children}
    <noscript><button className="button button-secondary" type="submit">Áp dụng</button></noscript>
  </form>;
}
