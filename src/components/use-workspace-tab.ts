"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function useWorkspaceTab<T extends string>(fallback: T, initialTab?: T) {
  const router = useRouter();
  const [localTab, setLocalTab] = useState<T>(fallback);
  const [pending, startTransition] = useTransition();
  function setTab(next: T) {
    if (!initialTab) { setLocalTab(next); return; }
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    url.searchParams.delete("after");
    startTransition(() => router.push(`${url.pathname}${url.search}`, { scroll: false }));
  }
  return { tab: initialTab ?? localTab, setTab, pending };
}
